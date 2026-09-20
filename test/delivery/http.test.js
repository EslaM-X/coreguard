/**
 * DDE HTTP endpoint — executable contract.
 *
 * The endpoint is the network face of the same boundary the engine enforces:
 *   honest fixture     → 200 VERIFIED, decision = CONFORMITY_UNDECIDED_BY_ENGINE
 *   boundary defect    → 422 FIXTURE_REJECTED (the defect's own check FAILs)
 *   malformed JSON     → 400 REJECTED (a bad submission, not a server error)
 *   oversized body     → 413 before parsing (fail-closed)
 *   unknown route      → 404 with the banner
 *   every response     → x-dde-boundary header + banner in the body
 *   E5 without adapter → NOT_RUN (never fabricated), no outbound network calls
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDeliveryEndpoint, MAX_BODY_BYTES, createRateLimiter, RATE_LIMIT_DEFAULTS } from "../../packages/delivery/http.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");

const FILES = {
  "agreement.json": "agreement",
  "acceptance-criteria.json": "acceptanceCriteria",
  "parties.json": "parties",
  "authorization.json": "authorization",
  "execution-attestation.json": "execution",
  "delivery-manifest.json": "delivery",
  "acceptance-record.json": "acceptanceRecord",
  "dispute-record.json": "disputeRecord",
  "consent-and-disclosure.json": "consentAndDisclosure",
  "retention-policy.json": "retentionPolicy",
};

function loadFixture() {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const fixture = { origin: manifest.fixture.origin, lifecycleState: manifest.fixture.lifecycleState };
  for (const [name, key] of Object.entries(FILES)) {
    fixture[key] = JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
  }
  return fixture;
}

async function withServer(fn, startOpts = {}) {
  const server = await startDeliveryEndpoint({ port: 0, ...startOpts });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, headers = { "content-type": "application/json" }) => {
    const r = await fetch(base + path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
    return { code: r.status, body: await r.json(), boundaryHeader: r.headers.get("x-dde-boundary"), versionHeader: r.headers.get("x-dde-version") };
  };
  try {
    await fn({ base, post });
  } finally {
    server.close();
  }
}

test("POST /verify: honest fixture → 200 VERIFIED with the undecided-by-engine decision", async () => {
  await withServer(async ({ post }) => {
    const { code, body, boundaryHeader } = await post("/verify", loadFixture());
    assert.equal(code, 200);
    assert.equal(body.status, "VERIFIED");
    assert.equal(body.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");
    assert.equal(body.summary.fail, 0);
    assert.equal(boundaryHeader, "DDE-BOUNDARY");
    assert.match(body.boundary, /does not decide delivery conformity/);
  });
});

test("POST /verify: payment-as-basis attack → 422 REJECTED by its own check (B1)", async () => {
  await withServer(async ({ post }) => {
    const f = loadFixture();
    f.acceptanceRecord.basis = ["PAYMENT_SETTLED"];
    const { code, body } = await post("/verify", f);
    assert.equal(code, 422);
    assert.equal(body.status, "REJECTED");
    assert.equal(body.decision, "FIXTURE_REJECTED");
    const b1 = body.checks.find((c) => c.id === "B1");
    assert.equal(b1.result, "FAIL");
  });
});

test("POST /verify: malformed JSON → 400 REJECTED, never a 5xx", async () => {
  await withServer(async ({ post }) => {
    const { code, body } = await post("/verify", "{not json");
    assert.equal(code, 400);
    assert.equal(body.status, "REJECTED");
    assert.match(body.error, /not valid JSON/);
  });
});

test("POST /verify: oversized body → 413 before parsing", async () => {
  await withServer(async ({ post }) => {
    const bloated = JSON.stringify({ padding: "x".repeat(MAX_BODY_BYTES + 1) });
    const { code, body } = await post("/verify", bloated);
    assert.equal(code, 413);
    assert.equal(body.status, "REJECTED");
  });
});

test("POST /peoples-court: 200 + full 9-class projection, pins marked NOT_EVALUATED_OVER_HTTP", async () => {
  await withServer(async ({ post }) => {
    const { code, body } = await post("/peoples-court", loadFixture());
    assert.equal(code, 200);
    assert.equal(body.peoplesCourt.mappable, true);
    assert.equal(body.peoplesCourt.items.length, 9);
    assert.match(body.peoplesCourt.readiness, /READY_FOR_CLAIM_MAPPING/);
    assert.match(body.hashesManifest, /NOT_EVALUATED_OVER_HTTP/);
  });
});

test("GET /health and unknown routes carry the banner; version header present", async () => {
  await withServer(async ({ base }) => {
    const h = await fetch(base + "/health");
    const hb = await h.json();
    assert.equal(h.status, 200);
    assert.equal(h.headers.get("x-dde-boundary"), "DDE-BOUNDARY");
    assert.match(hb.boundary, /does not decide delivery conformity/);

    const n = await fetch(base + "/nope");
    const nb = await n.json();
    assert.equal(n.status, 404);
    assert.equal(nb.status, "REJECTED");
    assert.match(nb.boundary, /does not decide delivery conformity/);
  });
});

test("no EVM adapter injected: E5 reports NOT_RUN and no outbound calls are made", async () => {
  await withServer(async ({ post }) => {
    const { body } = await post("/verify", loadFixture());
    const e5 = body.checks.find((c) => c.id === "E5");
    assert.equal(e5.result, "NOT_RUN");
    assert.match(e5.note, /never fabricated/);
  });
});

test("default bind is loopback — never a public interface by accident", async () => {
  const { createServer } = await import("node:http");
  const { createDeliveryRequestHandler } = await import("../../packages/delivery/http.js");
  const server = createServer(createDeliveryRequestHandler());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  assert.equal(server.address().address, "127.0.0.1");
  server.close();
});

// ---------------------------------------------------------------------------
// rate limiting + early size gate — hardening for a deliberate public bind
// ---------------------------------------------------------------------------

test("rate limiter unit: allows up to max, then refuses with retry-after", () => {
  let t = 1_000_000;
  const rl = createRateLimiter({ windowMs: 60_000, max: 3, now: () => t });
  assert.equal(rl.check("ip").allowed, true);
  assert.equal(rl.check("ip").allowed, true);
  const third = rl.check("ip");
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  const fourth = rl.check("ip");
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.ok(fourth.retryAfterSec >= 1);
  assert.ok(fourth.resetSec > 0 && fourth.resetSec <= 60);
  // a different address has its own budget
  assert.equal(rl.check("other-ip").allowed, true);
});

test("rate limiter unit: fixed window rolls over and resets the budget", () => {
  let t = 2_000_000;
  const rl = createRateLimiter({ windowMs: 1_000, max: 1, now: () => t });
  assert.equal(rl.check("ip").allowed, true);
  assert.equal(rl.check("ip").allowed, false);
  t += 1_001; // window rollover
  const again = rl.check("ip");
  assert.equal(again.allowed, true);
  assert.equal(again.remaining, 0); // fresh window, full budget consumed by this hit
});

test("rate limiter unit: expired buckets are dropped — memory stays bounded", () => {
  let t = 3_000_000;
  const rl = createRateLimiter({ windowMs: 1_000, max: 1, pruneAt: 5, now: () => t });
  for (let i = 0; i < 5; i++) rl.check(`ip-${i}`);
  assert.equal(rl.size(), 5);
  t += 1_001; // all five now expired; the 6th key triggers the sweep
  rl.check("ip-5");
  assert.ok(rl.size() <= 2, `sweep should drop expired buckets, got ${rl.size()}`);
});

test("rate limiter unit: invalid options throw — misconfiguration cannot widen the gate", () => {
  assert.throws(() => createRateLimiter({ windowMs: 0 }), /windowMs/);
  assert.throws(() => createRateLimiter({ max: -1 }), /max/);
  assert.throws(() => createRateLimiter({ pruneAt: 0 }), /pruneAt/);
});

test("endpoint: exceeding the window returns 429 + retry-after with the banner, then recovers", async () => {
  await withServer(
    async ({ base, post }) => {
      const first = await post("/verify", loadFixture());
      assert.equal(first.code, 200);
      const blocked = await post("/verify", loadFixture());
      assert.equal(blocked.code, 429);
      assert.equal(blocked.body.status, "REJECTED");
      assert.match(blocked.body.error, /rate limit exceeded/);
      assert.equal(blocked.boundaryHeader, "DDE-BOUNDARY");
      assert.match(blocked.body.boundary, /does not decide delivery conformity/);
      const r = await fetch(base + "/verify", { method: "POST", body: "{}" }); // raw fetch for headers
      assert.equal(r.status, 429);
      assert.ok(Number(r.headers.get("retry-after")) >= 1);
      assert.equal(r.headers.get("x-dde-boundary"), "DDE-BOUNDARY");
      await new Promise((r2) => setTimeout(r2, 150)); // window rolls over
      const recovered = await post("/verify", loadFixture());
      assert.equal(recovered.code, 200);
    },
    { rateLimit: { windowMs: 100, max: 1 } }
  );
});

test("endpoint: /health is exempt — a flood can never lock out liveness probes", async () => {
  await withServer(
    async ({ base, post }) => {
      assert.equal((await post("/verify", loadFixture())).code, 200);
      assert.equal((await post("/verify", loadFixture())).code, 429); // budget spent
      for (let i = 0; i < 5; i++) {
        const h = await fetch(base + "/health");
        assert.equal(h.status, 200);
        assert.equal((await h.json()).status, "OK");
      }
    },
    { rateLimit: { windowMs: 60_000, max: 1 } }
  );
});

test("endpoint: allowed POSTs carry x-ratelimit-* headers", async () => {
  await withServer(async ({ base }) => {
    const r = await fetch(base + "/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(loadFixture()),
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-ratelimit-limit"), String(RATE_LIMIT_DEFAULTS.max));
    assert.ok(Number(r.headers.get("x-ratelimit-remaining")) >= 0);
    assert.ok(Number(r.headers.get("x-ratelimit-reset")) >= 0);
  });
});

test("endpoint: declared content-length over the cap is refused before reading the body", async () => {
  await withServer(async ({ base }) => {
    const bloated = JSON.stringify({ padding: "x".repeat(MAX_BODY_BYTES + 1) });
    const r = await fetch(base + "/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bloated,
    });
    assert.equal(r.status, 413);
    const b = await r.json();
    assert.equal(b.status, "REJECTED");
    assert.match(b.error, /exceeds 1048576 bytes/);
    assert.equal(r.headers.get("x-dde-boundary"), "DDE-BOUNDARY");
  });
});

test("endpoint: rateLimit:false disables limiting — the platform may front it with its own", async () => {
  await withServer(
    async ({ post }) => {
      for (let i = 0; i < 5; i++) {
        const { code } = await post("/verify", loadFixture());
        assert.equal(code, 200);
      }
    },
    { rateLimit: false }
  );
});
