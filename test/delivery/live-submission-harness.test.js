import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  consumeEvent,
  consumeFeed,
  emptyLedger,
  sha256Canonical,
} from "../../packages/peoples-court-adapter/webhook-consumer.mjs";
import {
  buildX402Prepare,
  verifyX402Prepare,
  deriveIdempotencyKey,
  PENDING,
} from "../../packages/peoples-court-adapter/x402-prepare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CLI = join(REPO, "packages", "peoples-court-adapter", "cli-harness.mjs");
const REF_A = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");
const FEED = join(REPO, "packages", "peoples-court-adapter", "examples", "recorded-feed.json");
const HARNESS_FILES = [
  "x402-prepare-packet.json",
  "x402-packet-digest.json",
  "webhook-ledger.json",
  "webhook-events-log.json",
  "harness-report.json",
  "harness-hashes.json",
];

const REV = "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4";

function tmpOut(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  const out = join(d, "out");
  mkdirSync(out, { recursive: true });
  return { d, out };
}

function withTmp(fn) {
  const { d, out } = tmpOut("cgh-");
  try {
    return fn({ d, out });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

function run(script, cwd, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], { cwd, encoding: "utf8" });
}

test("harness: CLI on reference-A exits 0, self-verifies, and honors the recorded feed semantics", () => {
  withTmp(({ out }) => {
    const r = run(CLI, REPO, ["--case", REF_A, "--out", out]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PEOPLES_COURT_HARNESS_READY/);
    for (const f of HARNESS_FILES) assert.ok(existsSync(join(out, f)), `${f} missing`);

    const report = JSON.parse(readFileSync(join(out, "harness-report.json"), "utf8"));
    assert.equal(report.networkCall, "NOT_PERFORMED");
    assert.equal(report.webhook.events, 7);
    assert.equal(report.webhook.applied, 4, "event_0001..0004 applied (event_0005 out-of-order, event_0006 after gap)");
    assert.equal(report.webhook.duplicates, 1, "event_0002 redelivered once -> acked, never re-applied");
    assert.equal(report.webhook.outOfOrder, 2, "event_0005 arrived before event_0004; event_0006 after the gap");
    assert.equal(report.webhook.tampered, 0);
    assert.equal(report.webhook.cursor, 4);

    const hashes = JSON.parse(readFileSync(join(out, "harness-hashes.json"), "utf8"));
    assert.ok(hashes.manifest.selfExcluded.includes("harness-hashes.json"));
    for (const f of HARNESS_FILES.filter((x) => x !== "harness-hashes.json")) {
      const disk = sha256Canonical(JSON.parse(readFileSync(join(out, f), "utf8")));
      assert.equal(hashes.files[f], disk, `${f} pin must match disk bytes`);
    }
  });
});

test("harness: deterministic — two runs emit byte-identical outputs", () => {
  const { d, out } = tmpOut("cgh-");
  const out2 = join(d, "out2");
  try {
    mkdirSync(out2, { recursive: true });
    const r1 = run(CLI, REPO, ["--case", REF_A, "--out", out]);
    const r2 = run(CLI, REPO, ["--case", REF_A, "--out", out2]);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    for (const f of HARNESS_FILES) {
      assert.equal(
        readFileSync(join(out, f), "utf8"),
        readFileSync(join(out2, f), "utf8"),
        `${f} must be byte-identical across runs`,
      );
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("harness: a corrupted feed event fails closed (tampered, never acked)", () => {
  withTmp(({ d, out }) => {
    const feed = JSON.parse(readFileSync(FEED, "utf8"));
    feed.events[0].payloadHash = "0x" + "0".repeat(64); // break the pin on event_0001
    const badFeed = join(d, "bad-feed.json");
    writeFileSync(badFeed, JSON.stringify(feed, null, 2) + "\n");
    const r = run(CLI, REPO, ["--case", REF_A, "--feed", badFeed, "--out", out]);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /tampered feed events not acked/);
  });
});

test("harness: exit 2 on usage error (no --case)", () => {
  const r = run(CLI, REPO, []);
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /usage/);
});

test("webhook: dedup — a redelivered eventId is acked once and never re-applied", () => {
  const ev = (id, seq, status) => ({
    eventId: id,
    sequence: seq,
    type: "submission.received",
    payload: { packageRevision: REV, status },
    payloadHash: "0x" + sha256Canonical({ packageRevision: REV, status }),
  });
  let ledger = emptyLedger();
  const a = consumeEvent({ event: ev("e1", 1, "A"), ledger });
  assert.equal(a.verdict, "APPLIED");
  const dup = consumeEvent({ event: ev("e1", 1, "A"), ledger: a.ledger });
  assert.equal(dup.verdict, "DUPLICATE");
  assert.equal(Object.keys(dup.ledger.appliedByEventId).length, 1, "duplicate must not extend the applied set");
  assert.equal(dup.ledger.cursor, 1);
});

test("webhook: out-of-order and gap events are held, never applied out of sequence", () => {
  const ev = (id, seq) => ({
    eventId: id,
    sequence: seq,
    type: "submission.received",
    payload: { packageRevision: REV },
    payloadHash: "0x" + sha256Canonical({ packageRevision: REV }),
  });
  let ledger = emptyLedger();
  const ooo = consumeEvent({ event: ev("e9", 9, "X"), ledger });
  assert.equal(ooo.verdict, "OUT_OF_ORDER");
  assert.equal(ooo.ledger.cursor, 0, "out-of-order event must not advance the cursor");
  assert.equal(ooo.ledger.outOfOrder.length, 1);
  assert.equal(consumeEvent({ event: ev("e9", 9, "X"), ledger: ooo.ledger }).verdict, "DUPLICATE");
});

test("webhook: a payloadHash mismatch is TAMPERED (fail-closed)", () => {
  const ev = {
    eventId: "e1",
    sequence: 1,
    type: "submission.received",
    payload: { packageRevision: REV },
    payloadHash: "0x" + "0".repeat(64),
  };
  const r = consumeEvent({ event: ev, ledger: emptyLedger() });
  assert.equal(r.verdict, "TAMPERED");
  assert.equal(r.ledger.cursor, 0);
  assert.equal(r.ledger.tampered.length, 1);
});

test("webhook: canonicalJson is idempotent and serializes control chars away from raw bytes", () => {
  const obj = { b: [1, 2, { d: "x", a: true }], a: null, c: "line\nbreak" };
  const one = canonicalJson(obj);
  const two = canonicalJson(JSON.parse(one));
  assert.equal(one, two, "canonical form must be idempotent under parse+recanonicalize");
  assert.ok(!one.includes("\n"), "canonical bytes must never contain a raw newline");
  assert.ok(one.includes("\\n"), "the newline must be escaped as a backslash sequence");
});

test("x402: idempotencyKey is deterministic from the pinned revision", () => {
  assert.equal(deriveIdempotencyKey(REV), deriveIdempotencyKey(REV));
  assert.equal(deriveIdempotencyKey(REV).length, 48);
  assert.notEqual(deriveIdempotencyKey(REV), deriveIdempotencyKey("b".repeat(64)));
});

test("x402: packet builds transport-ready, verifies, and rejects tampering", () => {
  const b = buildX402Prepare({ pkgRevision: REV, authorityGrantId: "ag_001", consentArtifactIds: ["ca_001"] });
  assert.equal(b.ok, true);
  assert.equal(b.packet.method, "adjudication.prepare");
  assert.equal(b.packet.authorityGrantId, "ag_001");
  assert.equal(b.packet.networkCall, "NOT_PERFORMED");

  const v = verifyX402Prepare({ packet: b.packet, expectedDigest: b.digest });
  assert.equal(v.ok, true, JSON.stringify(v.errors));

  const tampered = { ...b.packet, payload: { ...b.packet.payload, partiesBound: false } };
  const v2 = verifyX402Prepare({ packet: tampered, expectedDigest: b.digest });
  assert.equal(v2.ok, false, "a mutated packet must fail digest/schema re-verification");
});

test("x402: dry-run packet defaults to pending-assignment placeholders", () => {
  const b = buildX402Prepare({ pkgRevision: REV });
  assert.equal(b.ok, true);
  assert.equal(b.packet.authorityGrantId, PENDING);
  assert.deepEqual(b.packet.consentArtifactIds, []);
});