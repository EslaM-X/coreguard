import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { pathToFileURL, fileURLToPath } from "node:url";

// RAER contract — the Replayable Agent-Incident Evidence Registry is a claim,
// not prose. docs/raer/registry.json says "any party can replay any bundle and
// get the recorded verdict, and an unparsable submission is UNKNOWN, never a
// rejection". This contract pins that claim: schema/statuses/counts stay
// coherent, the submission template validates, the replayable-status claim is
// proven ON THE WIRE through AIE-1's own documented channel (spawned server +
// direct HTTP, mirroring the proven doc-curl harness — spawnSync against a
// live server deadlocks, so readiness is polled asynchronously), and the
// neutrality language (fail-closed matrix) is chained to the AIE-1 spec it
// inherits.

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAER_DIR = join(REPO, "docs", "raer");
const AIE1 = join(REPO, "docs", "agent-incident-evidence.md");

const registry = () => JSON.parse(readFileSync(join(RAER_DIR, "registry.json"), "utf8"));
const template = () => JSON.parse(readFileSync(join(RAER_DIR, "submission-template.json"), "utf8"));

/** Extract the double-quoted JS body of a documented `node --input-type=module
 *  -e "…"` line. The doc lines carry no inner double quotes, so a greedy
 *  capture to the closing quote is exact. */
function evalBody(docLine) {
  const m = docLine.match(/-e "([^"]+)"/);
  assert.ok(m, `documented line must carry a quoted -e body: ${docLine.slice(0, 80)}`);
  return m[1];
}

function validateSub(sub) {
  const { validateSubmission } = registry();
  const errors = [];
  for (const req of validateSubmission.requiredPaths) {
    const parts = req.split(".");
    let cur = sub;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object" || !(p in cur)) {
        errors.push(`missing required path: ${req}`);
        cur = undefined;
        break;
      }
      cur = cur[p];
    }
    if (cur !== undefined && (cur === null || cur === "")) errors.push(`empty required path: ${req}`);
  }
  for (const [enumPath, values] of Object.entries(validateSubmission.enumPaths)) {
    const parts = enumPath.split(".");
    let cur = sub;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object" || !(p in cur)) { cur = undefined; break; }
      cur = cur[p];
    }
    if (cur !== undefined && !values.includes(cur)) errors.push(`invalid enum at ${enumPath}: ${JSON.stringify(cur)} (allowed: ${values.join(", ")})`);
  }
  return errors;
}

test("raer registry is valid JSON under schema CG-RAER/1 with coherent statuses and counts", () => {
  const r = registry();
  assert.equal(r.schema, "CG-RAER/1");
  for (const key of ["statuses", "statusSemantics", "validationMatrix", "entries", "counts", "honestyNote", "validateSubmission"]) {
    assert.ok(r[key] !== undefined, `registry missing ${key}`);
  }
  assert.deepEqual(Object.keys(r.counts.byStatus).sort(), [...r.statuses].sort(), "counts.byStatus keys must equal statuses exactly");
  const sum = Object.values(r.counts.byStatus).reduce((a, b) => a + b, 0);
  assert.equal(sum, r.counts.total, "byStatus counts must sum to total");
  assert.equal(r.entries.length, r.counts.total, "entries array length must equal counts.total");
  const byStatus = {};
  for (const e of r.entries) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  // The registry may omit zero-count statuses from counts.byStatus; every
  // status must agree with the per-entry tallies either way.
  for (const s of r.statuses) {
    assert.equal(r.counts.byStatus[s] ?? 0, byStatus[s] ?? 0, `counts.byStatus.${s} must match the per-entry tallies`);
  }
  assert.ok(Object.keys(r.counts.byStatus).every((k) => r.statuses.includes(k)), "counts.byStatus must not name unknown statuses");
  for (const e of r.entries) {
    assert.ok(r.statuses.includes(e.status), `entry ${e.id}: unknown status ${e.status}`);
    if (e.status === "DEMO") {
      assert.equal(e.demo, true, `entry ${e.id}: DEMO must carry demo:true`);
      assert.equal(e.realIncident, false, `entry ${e.id}: DEMO must carry realIncident:false`);
    } else {
      assert.equal(e.realIncident, true, `entry ${e.id}: non-DEMO entries must be realIncident:true`);
    }
  }
  assert.equal(r.counts.realIncidents, r.entries.filter((e) => e.realIncident).length, "realIncidents count must match entries");
});

test("AWAITING_BUNDLE entries: publicly reported incidents recorded without asserting a single fact about them", () => {
  const r = registry();
  const awaiting = r.entries.filter((e) => e.status === "AWAITING_BUNDLE");
  assert.ok(awaiting.length > 0, "the registry must carry the AWAITING_BUNDLE entries (the standing public invitation)");
  for (const e of awaiting) {
    assert.equal(e.realIncident, true, `${e.id}: a real reported incident`);
    // The honesty spine: the registry records the report, never the facts.
    assert.ok(e.reportedBy?.includes("ATTRIBUTED"), `${e.id}: reportedBy must carry the ATTRIBUTED marker`);
    assert.equal(e.evidenceBundle?.bundleSha256 ?? null, null, `${e.id}: no bundle means no bundle hash — ever`);
    assert.equal(e.claimedVerdict ?? null, null, `${e.id}: an unfiled incident carries no claimed verdict`);
    assert.match(e.summary ?? "", /asserts no fact|asserts nothing/, `${e.id}: the summary must state the non-assertion policy`);
    // Source discipline: at least one committed, CI-verifiable source record.
    const sources = e.publicSources ?? [];
    assert.ok(sources.length > 0, `${e.id}: at least one public source record is required`);
    for (const s of sources) {
      assert.equal(s.kind, "committed-source-record", `${e.id}: sources must be committed records (CI-checked), not bare URLs`);
      assert.match(s.url ?? "", /^https:\/\//, `${e.id}: source url must be https`);
      assert.equal(s.ciVerified, true, `${e.id}: the committed source must be CI-verified`);
    }
    // Deep links land WITH the bundle, never before (a 404 deep-link would
    // be a second lie channel).
    assert.equal(e.thirdPartySource?.deepLink ?? null, null, `${e.id}: third-party deep links are bundle-time, not registry-time`);
    assert.match(e.thirdPartySource?.policy ?? "", /deep link/i, `${e.id}: the deep-link policy must be stated`);
  }
  // The demo must remain the only entry that is not a real incident.
  assert.equal(r.entries.filter((e) => !e.realIncident).length, 1, "exactly one non-realIncident entry (the labeled demo)");
});

test("the AIE-1 adoption map carries the sourceable pattern the AWAITING_BUNDLE entries point at", () => {
  const map = readFileSync(join(REPO, "docs", "aie1-adoption-map.md"), "utf8");
  assert.match(map, /15\+ incidents/, "the adoption map must state the 15+ incident record");
  assert.match(map, /leaking[\s\n]*user images/, "the adoption map must state the leaked-images report");
  assert.match(map, /Hugging Face platform account/, "the adoption map must state the Hugging Face platform compromise");
  const r = registry();
  for (const e of r.entries.filter((x) => x.status === "AWAITING_BUNDLE")) {
    const s = (e.publicSources ?? []).find((x) => (x.url ?? "").includes("aie1-adoption-map.md"));
    assert.ok(s, `${e.id}: must point at the committed adoption-map source record`);
    assert.ok(map.includes(s.anchor), `${e.id}: the recorded anchor must exist verbatim in the map`);
  }
});

test("the incubator demo case stays honestly labeled and never upgrades itself", () => {
  const r = registry();
  assert.ok(r.incubatorDemoCase, "registry must carry the incubatorDemoCase block");
  assert.equal(r.incubatorDemoCase.demo, true);
  assert.equal(r.incubatorDemoCase.realIncident, false);
  assert.equal(r.incubatorDemoCase.verdict, "UNKNOWN", "a demo has no verdict to certify");
  assert.equal(r.incubatorDemoCase.evidenceBundleSha256, null, "a demo registers no evidence hash");
  assert.match(r.honestyNote, /zero REPLAYED entries/i, "the registry must state its no-replay-yet truth in prose");
});

test("submission template validates structurally; an unparsable one records UNKNOWN, never a rejection", () => {
  const t = template();
  assert.equal(t.schema, "CG-RAER-SUB/1");
  assert.deepEqual(validateSub(t), [], `the template itself must pass its own validation: ${validateSub(t).join("; ")}`);
  // Negative control 1: drop a required path → validation must notice.
  const missing = JSON.parse(JSON.stringify(t));
  delete missing.verdict.claimedVerdict;
  const errs1 = validateSub(missing);
  assert.ok(errs1.some((e) => e.includes("verdict.claimedVerdict")), "dropping a required path must fail validation");
  // Negative control 2: an off-language verdict → enum must bite.
  const badEnum = JSON.parse(JSON.stringify(t));
  badEnum.verdict.claimedVerdict = "TOTALLY_FINE_TRUST_US";
  const errs2 = validateSub(badEnum);
  assert.ok(errs2.some((e) => e.includes("invalid enum")), "an off-language verdict must fail validation");
});

test("every raer file is valid JSON and the directory carries exactly the registry, the template, and the derived feed", () => {
  const files = readdirSync(RAER_DIR).filter((f) => f.endsWith(".json"));
  assert.deepEqual([...files].sort(), ["feed.json", "registry.json", "submission-template.json"].sort(), "raer dir holds exactly the registry, the template, and the derived feed");
  for (const f of files) assert.doesNotThrow(() => JSON.parse(readFileSync(join(RAER_DIR, f), "utf8")), `${f} must parse`);
});

test("the replayable-status claim is proven on the wire — a bundle replays byte-identical through AIE-1's documented channel", async () => {
  const doc = readFileSync(AIE1, "utf8");
  const startLine = doc.match(/node --input-type=module -e "import \{ startDeliveryEndpoint \}[^\n]+/)?.[0];
  const assemble = doc.match(/node --input-type=module -e "import \{ loadFixtureFromDir \}[^\n]+/)?.[0];
  assert.ok(startLine && assemble, "AIE-1 doc must keep its documented start and assembly lines (RAER rides the same wire)");

  // Windows ESM loader needs file:// URLs for absolute imports (the same
  // platform trap the doc-curl harness flags in its header); pathToFileURL
  // percent-encodes spaces in the checkout path.
  const importBase = pathToFileURL(REPO).href;
  const startJs = evalBody(startLine).replace("'./packages/", `'${importBase}/packages/`);
  const assembleJs = evalBody(assemble).replace("./examples/delivery-fixture", join(REPO, "examples", "delivery-fixture").split("\\").join("/"));

  // Ephemeral port, picked by bind-then-release (the doc-curl harness's own trick).
  const port = await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });

  const tmp = mkdtempSync(join(tmpdir(), "raer-replay-"));
  let child = null;
  try {
    child = spawn(process.execPath, ["--input-type=module", "-e", startJs.replace(/port: 8787/, `port: ${port}`)], {
      cwd: REPO,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let childErr = "";
    child.stderr.on("data", (d) => (childErr += d));
    // Readiness: poll /health asynchronously — spawnSync here is the exact
    // deadlock the doc-curl contract documents (and solved) before us.
    let up = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !up) {
      await new Promise((r) => setTimeout(r, 100));
      if (child.exitCode !== null || child.signalCode) break;
      up = await new Promise((resolve) => {
        const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 2000 }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on("timeout", () => { req.destroy(); resolve(false); });
        req.on("error", () => resolve(false));
      });
    }
    assert.ok(up, `documented start line must produce a live /health — stderr: ${childErr.slice(0, 300)}`);

    const assembled = spawnSync(process.execPath, ["--input-type=module", "-e", assembleJs], { encoding: "utf8", cwd: REPO, timeout: 30_000 });
    assert.equal(assembled.status, 0, `documented assembly must run: ${assembled.stderr.slice(0, 300)}`);
    assert.ok(assembled.stdout.trim().startsWith("{"), "assembly must emit the fixture JSON on stdout");
    const fixturePath = join(tmp, "fixture.json");
    writeFileSync(fixturePath, assembled.stdout);

    const post = () => {
      const body = readFileSync(fixturePath);
      return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path: "/verify", method: "POST", headers: { "content-type": "application/json", "content-length": body.length }, timeout: 30_000 }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
    };
    const report1 = await post();
    const report2 = await post();
    assert.equal(report1, report2, "two independent replays of the same bundle must be byte-identical — the property a REPLAYED status certifies");
    assert.ok(report1.includes("EXECUTION_EVIDENCE_ADMISSIBLE"), "the honest demo bundle must replay to AIE-1's admissible verdict language");
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, timeout: 10_000 });
      else child.kill("SIGKILL");
    }
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("negative controls: UNKNOWN stays 'not evidence of anything' and validation fails closed", () => {
  const r = registry();
  const unknownRow = r.validationMatrix.matrix.find((m) => m.verdict === "UNKNOWN");
  assert.ok(unknownRow, "the matrix must carry the UNKNOWN row");
  assert.match(unknownRow.reviewerOutcome, /not evidence of anything|never a verdict|NOT counted/i, "UNKNOWN must be pinned as 'not evidence of anything', never a rejection");
  const stripped = { schema: "CG-RAER-SUB/1" };
  assert.ok(validateSub(stripped).length > 0, "a stripped submission fails validation (missing required paths)");
});

test("the fail-closed matrix is chained to the AIE-1 verdict language it inherits", () => {
  const r = registry();
  const aie = readFileSync(AIE1, "utf8");
  for (const row of r.validationMatrix.matrix) {
    if (row.verdict === "UNKNOWN") continue; // registry-level state, not a wire verdict
    assert.ok(aie.includes(row.verdict), `matrix verdict "${row.verdict}" must appear verbatim in the AIE-1 spec`);
  }
  const rejectedRow = r.validationMatrix.matrix.find((m) => m.verdict === "FIXTURE_REJECTED");
  assert.match(rejectedRow.reviewerOutcome, /flipped byte/, "the rejection row must promise the named-byte property");
});

test("README neutrality claims match the registry's semantics (no cross-file drift)", () => {
  const readme = readFileSync(join(RAER_DIR, "README.md"), "utf8");
  const r = registry();
  for (const s of r.statuses) assert.ok(readme.includes(s), `README must name status ${s}`);
  assert.match(readme, /never deleted/i, "README must carry the never-destroyed rule");
  assert.match(readme, /zero replays/i, "README must state the zero-replay truth");
  assert.match(readme, /AWAITING_BUNDLE/, "README must document the awaiting-bundle posture");
  assert.match(readme, /feed\.json/, "README must document the derived feed (the addressable surface)");
});

test("the derived feed is byte-fresh: raer-feed.mjs --check regenerates it identically from the registry", () => {
  const r = spawnSync(process.execPath, [join(REPO, "scripts", "raer-feed.mjs"), "--check"], { encoding: "utf8", cwd: REPO, timeout: 60_000 });
  assert.equal(r.status, 0, `feed drifted from the registry (run: node scripts/raer-feed.mjs):\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /CHECK OK/);
});

test("the feed is addressable: bilingual citation, honest counts, sorted statuses, no timestamps", () => {
  const feed = JSON.parse(readFileSync(join(RAER_DIR, "feed.json"), "utf8"));
  const r = registry();
  assert.equal(feed.schema, "CG-RAER-FEED/1");
  assert.deepEqual(feed.statuses, [...r.statuses].sort(), "feed statuses must be the sorted registry statuses");
  assert.deepEqual(feed.counts, r.counts, "feed counts must equal the registry counts verbatim");
  for (const lang of ["en", "ar"]) {
    assert.ok(feed.citation?.[lang]?.length > 80, `citation.${lang} must carry a real snippet`);
    assert.ok(feed.citation[lang].includes("/raer/"), `citation.${lang} must carry the registry URL`);
  }
  assert.match(feed.citation.en, /replay/i, "the EN snippet must carry the replay question");
  assert.match(feed.citation.ar, /إعادة تشغيل/, "the AR snippet must carry the replay question");
  assert.equal(feed.verify.neverDeleted, true, "the feed must carry the never-destroyed rule");
  // Determinism law: a derived feed has no measurement timestamps — two runs
  // over the same registry are byte-identical (that is what --check pins); a
  // timestamped field here would silently break byte-freshness.
  assert.ok(!/measuredAt|generatedAt|timestamp/i.test(JSON.stringify(feed)), "the feed must not embed timestamps");
});
