import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFixture, loadFixtureFromDir } from "../../packages/delivery/sdk.js";

/**
 * AIE-1 contract — the agent-incident-evidence spec may not lie.
 *
 * docs/agent-incident-evidence.md is the investor-facing claim sheet: identity
 * from the socket, commit-anchored evidence, byte-anchored verdicts,
 * deterministic replay. Every quoted output in it is re-produced here against
 * the live engine, and the doc's registration in the doc-curl contract is
 * itself asserted — so the runnable fences keep executing in CI.
 *
 * Drift this catches: a renamed decision string, a changed E3 mismatch
 * format, a determinism regression (two replays no longer byte-identical),
 * an unregistered doc (fences silently stop executing).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DOC = join(REPO, "docs", "agent-incident-evidence.md");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");

const EXPECTED_DECISION =
  "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE";
const MISMATCH_FORMAT = /logo\.svg: recorded 0x[0-9a-f]{8}… != actual 0x[0-9a-f]{8}…/;

/** C16-safe load: the determinism test may regenerate the live fixture dir
 *  mid-read under node --test parallelism; retry a parse-broken load. */
async function loadLiveFixture() {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const loaded = loadFixtureFromDir(FIXTURE_DIR);
      if (loaded && loaded.fixture && loaded.fixture.delivery) return loaded.fixture;
      lastErr = new Error("fixture dir read returned an incomplete object");
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw lastErr;
}

test("AIE-1: the spec is registered in the doc-curl contract (its fences execute in CI)", () => {
  const doc = readFileSync(DOC, "utf8");
  assert.match(doc, /^# Agent Incident Evidence — AIE-1/m, "spec header present");

  const docCurlSource = readFileSync(
    join(HERE, "doc-curl-contract.test.js"),
    "utf8",
  );
  assert.match(
    docCurlSource,
    /["']docs\/agent-incident-evidence\.md["']/,
    "the spec must be listed in doc-curl DOC_FILES so its runnable claims are executed, not trusted",
  );
});

test("AIE-1: quoted verdict language matches the live engine byte-for-byte", async () => {
  const fixture = await loadLiveFixture();
  const report = await verifyFixture({ fixture });

  assert.equal(report.status, "VERIFIED");
  assert.equal(report.decision, EXPECTED_DECISION);

  const doc = readFileSync(DOC, "utf8");
  assert.ok(
    doc.includes(EXPECTED_DECISION),
    "the doc must quote the exact admissible decision string the engine produces",
  );
  assert.match(
    doc,
    MISMATCH_FORMAT,
    "the doc must quote the E3 mismatch format the engine emits on tamper",
  );
});

test("AIE-1: deterministic replay — two independent runs are byte-identical", async () => {
  const fixture = await loadLiveFixture();
  const a = JSON.stringify(await verifyFixture({ fixture }));
  const b = JSON.stringify(await verifyFixture({ fixture }));
  assert.equal(a, b, "same bytes in → byte-identical verdict out (the replay property)");
  assert.equal(JSON.parse(a).decision, EXPECTED_DECISION);
});

test("AIE-1: tamper replay names the flipped byte in the documented format", async () => {
  const fixture = await loadLiveFixture();
  const pin = fixture.delivery.artifacts[0].sha256;
  fixture.delivery.artifacts[0].sha256 = pin.slice(0, 2) + "4" + pin.slice(3);

  const report = await verifyFixture({ fixture });
  assert.equal(report.status, "REJECTED");
  assert.equal(report.decision, "FIXTURE_REJECTED");

  const e3 = report.checks.find((c) => c.name === "DELIVERY_INTEGRITY_REPLAY");
  assert.equal(e3.result, "FAIL");
  assert.match(
    e3.mismatches[0],
    MISMATCH_FORMAT,
    "engine output must match the format the spec quotes (8-nibble truncation with ellipsis): recorded pin != re-computed hash",
  );
});
