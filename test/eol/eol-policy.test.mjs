import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ============================================================================
// EOL POLICY TEST — executable form of docs/eol-policy.md
// ----------------------------------------------------------------------------
// Verifier-c carries a Dec-C-9 self-checksum: the loader re-hashes its own
// sources at import and fails closed on any byte change. A Windows clone with
// core.autocrlf=true once rewrote LF -> CRLF in a fresh clone and broke that
// checksum (proven failure: expected 0xd4c2fa2e… got 0xe8a29936…).
//
// Policy contract (docs/eol-policy.md):
//   .gitattributes behavior  -> packages/verifier-c/** -text
//   frozen-byte policy       -> assurance/quarantine trees stay -text
//   Unix behavior            -> no conversion, native LF (trivially true)
//   Windows behavior         -> proven below WITHOUT touching global config,
//                               by simulating the poison config per-invocation
// Classification: CLOSED (was: open advisory).
// ============================================================================

const repoRoot = fileURLToPathSafe(new URL("../../", import.meta.url));

function fileURLToPathSafe(url) {
  // keep imports minimal; derive repo root from import.meta.url
  return decodeURIComponent(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "buffer", maxBuffer: 2e7, ...opts });

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

test("policy: .gitattributes pins verifier-c and the frozen evidence trees to -text", () => {
  const attrs = readFileSync(join(repoRoot, ".gitattributes"), "utf8");
  assert.match(attrs, /packages\/verifier-c\/\*\*\s+-text/);
  assert.match(attrs, /coreguard-assurance-v4\.2\.2-remediation\/\*\*\s+-text/);
  assert.match(attrs, /legacy-quarantine\/\*\*\s+-text/);
  assert.match(attrs, /examples\/delivery-fixture\/\*\*\s+-text/);
});

test("policy: -text rules are actually IN EFFECT (check-attr, not just present on disk)", () => {
  for (const path of [
    "packages/verifier-c/index.js",
    "packages/verifier-c/verifier_c/__init__.py",
    "coreguard-assurance-v4.2.2-remediation/release/freeze/freeze-record-4.2.6.json",
    "examples/delivery-fixture/hashes.json",
  ]) {
    const out = git(["check-attr", "text", "--", path]).toString();
    assert.match(out, /text: unset/, `expected 'text: unset' for ${path}, got: ${out.trim()}`);
  }
});

test("windows behavior: checkout under autocrlf=true is byte-exact for verifier-c (the proven failure mode)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cg-eol-"));
  try {
    const file = "packages/verifier-c/verifier_c/__init__.py";
    // Simulate the poison config exactly as a Windows clone would experience,
    // scoped to this single invocation (global config is never modified).
    git(["-c", "core.autocrlf=true", "checkout-index", "-f", `--prefix=${tmp}/`, file]);
    const checkedOut = readFileSync(join(tmp, file));
    const repoBlob = git(["cat-file", "blob", `HEAD:${file}`]);
    assert.equal(
      sha(checkedOut), sha(repoBlob),
      "verifier-c source bytes changed under autocrlf=true checkout — Dec-C-9 would fail on Windows clones"
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("windows behavior: checkout under autocrlf=true is byte-exact for the frozen freeze record", () => {
  const tmp = mkdtempSync(join(tmpdir(), "cg-eol-"));
  try {
    const file = "coreguard-assurance-v4.2.2-remediation/release/freeze/freeze-record-4.2.6.json";
    git(["-c", "core.autocrlf=true", "checkout-index", "-f", `--prefix=${tmp}/`, file]);
    const checkedOut = readFileSync(join(tmp, file));
    const repoBlob = git(["cat-file", "blob", `HEAD:${file}`]);
    assert.equal(sha(checkedOut), sha(repoBlob), "frozen evidence bytes changed under autocrlf=true checkout");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("windows behavior: checkout under autocrlf=true is byte-exact for the DDE delivery fixture (record + its pin file)", () => {
  // Proven failure (2026-09-24): autocrlf=true rewrote the fixture records
  // LF->CRLF on a Windows checkout, so verify-fixture.mjs failed fail-closed
  // on the hashes.json pins — locally only, invisible to Linux CI. The rule
  // examples/delivery-fixture/** -text must keep a fresh clone byte-exact.
  const tmp = mkdtempSync(join(tmpdir(), "cg-eol-"));
  try {
    const files = [
      "examples/delivery-fixture/execution-attestation.json",
      "examples/delivery-fixture/hashes.json",
    ];
    git(["-c", "core.autocrlf=true", "checkout-index", "-f", `--prefix=${tmp}/`, ...files]);
    for (const file of files) {
      const checkedOut = readFileSync(join(tmp, file));
      const repoBlob = git(["cat-file", "blob", `HEAD:${file}`]);
      assert.equal(
        sha(checkedOut), sha(repoBlob),
        `delivery-fixture bytes changed under autocrlf=true checkout — the pins would fail on Windows clones (${file})`
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
