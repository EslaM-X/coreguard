import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/**
 * E2E: an allowlisted endpoint behind a reverse-proxy peer.
 *
 * Real topology over real sockets — one listener, two genuine network peers:
 *
 *   bind "::" (dual-stack) · allowAddresses: ["::1"]
 *
 *   ::1        plays the REVERSE PROXY (the only listed peer — the front door)
 *   127.0.0.1  plays the PUBLIC INTERNET (never listed)
 *
 * The claim under test: forwarded headers NEVER open the gate. The proxy may
 * forward X-Forwarded-For / X-Real-IP freely — its access comes from being the
 * socket peer on the list, not from any header. The public peer can forge the
 * same headers (even claiming the proxy's own address verbatim) and stays
 * outside: 403 fires before the rate limiter, its probes never touch the
 * proxy's budget, and /health is withheld from it too.
 */
test("e2e: allowlisted endpoint behind a proxy peer — forwarded headers never open the gate", async () => {
  const { startDeliveryEndpoint } = await import(pathToFileURL(join(REPO, "packages", "delivery", "http.js")).href);
  const { loadFixtureFromDir } = await import(pathToFileURL(join(REPO, "packages", "delivery", "sdk.js")).href);

  // [C16] the live fixture tree is regenerated in place by the determinism
  // contract during a parallel full-suite run — retry a torn read, never
  // accept partial bytes.
  let fixture;
  for (let i = 0; i < 5 && !fixture; i++) {
    try { ({ fixture } = loadFixtureFromDir(join(REPO, "examples", "delivery-fixture"))); }
    catch { await new Promise((r) => setTimeout(r, 50)); }
  }
  assert.ok(fixture, "fixture could not be loaded intact");
  const body = JSON.stringify(fixture);
  const json = { "content-type": "application/json" };

  const server = await startDeliveryEndpoint({
    port: 0, host: "::",                        // dual-stack: ::1 and 127.0.0.1 are distinct real peers
    rateLimit: { windowMs: 60_000, max: 3 },     // tiny so the budget-exhaustion leg is reachable
    allowAddresses: ["::1"],                     // the proxy's socket address — and nothing else
  });
  const port = server.address().port;
  const proxied = `http://[::1]:${port}`;         // connects from the proxy peer (::1)
  const direct  = `http://127.0.0.1:${port}`;     // connects from the public peer (127.0.0.1)

  try {
    // ---- the proxy peer: forwarded headers are FORWARDED, never DECIDING ----
    const viaProxy = await fetch(proxied + "/verify", { method: "POST", headers: {
      ...json,
      "x-forwarded-for": "203.0.113.9, 10.0.0.2",
      "x-real-ip": "203.0.113.9",
    }, body });
    assert.equal(viaProxy.status, 200, "the listed proxy peer passes WITH its forwarded headers attached");
    const report = await viaProxy.json();
    assert.equal(report.status, "VERIFIED");
    assert.equal(report.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");

    const proxiedHealth = await fetch(proxied + "/health");
    assert.equal(proxiedHealth.status, 200, "/health answers the listed peer");
    assert.equal(proxiedHealth.headers.get("x-dde-boundary"), "DDE-BOUNDARY");

    // ---- the public peer: the same headers, even verbatim-listed, open nothing ----
    for (const xff of ["::1", "::ffff:127.0.0.1", "203.0.113.9, 10.0.0.2", ""]) {
      const r = await fetch(direct + "/verify", { method: "POST", headers: { ...json, "x-forwarded-for": xff }, body });
      assert.equal(r.status, 403, `forged XFF "${xff}" must not mint the proxy's identity for an unlisted peer`);
      assert.equal(r.headers.get("x-dde-boundary"), "DDE-BOUNDARY");
      assert.equal(r.headers.get("retry-after"), null, "allowlist fires before the rate limiter — no retry-after on 403");
      const rej = await r.json();
      assert.equal(rej.status, "REJECTED");
      assert.match(rej.error, /allowlist/);
      // releaseWhen-style named reasons: unified rejection language across
      // every endpoint guard, mirroring the SDK gate's reasons[0] shape.
      assert.ok(Array.isArray(rej.reasons) && rej.reasons.length === 1, "403 must carry one named reason");
      assert.match(rej.reasons[0], /^peer address is not on the endpoint allowlist —/);
    }
    const directHealth = await fetch(direct + "/health");
    assert.equal(directHealth.status, 403, "the allowlist does NOT exempt /health — an unlisted peer learns nothing, not even liveness");

    // ---- the guards compose: the stranger spends nothing, the proxy alone pays ----
    let last;
    for (let i = 0; i < 5; i++) {
      last = await fetch(proxied + "/verify", { method: "POST", headers: json, body });
    }
    assert.equal(last.status, 429, "the proxy peer's own budget exhausts");
    assert.ok(Number(last.headers.get("retry-after")) >= 1, "429 carries retry-after");
    const limited = await last.json();
    assert.ok(Array.isArray(limited.reasons) && limited.reasons.length === 1, "429 must carry one named reason");
    assert.match(limited.reasons[0], /^rate limit exceeded —/);
    assert.match(limited.reasons[0], /retry after \d+s$/);
    // after the flood: an unlisted peer still gets 403 (not 429) AND leaves the
    // proxy's exhausted budget untouched — the next proxy call is still 429.
    const strangerAfter = await fetch(direct + "/verify", { method: "POST", headers: { ...json, "x-forwarded-for": "::1" }, body });
    assert.equal(strangerAfter.status, 403);
    const stillLimited = await fetch(proxied + "/verify", { method: "POST", headers: json, body });
    assert.equal(stillLimited.status, 429, "the stranger's rejected probes consumed zero rate-limit budget");
  } finally {
    await new Promise((res) => server.close(res));
  }
});
