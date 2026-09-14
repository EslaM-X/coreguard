#!/usr/bin/env node
/**
 * WS-3 build/artifact gate script.
 *
 * Default (gate):   regenerates from source, FAILS on byte drift (= HOLD).
 * --update:         regenerate and promote the committed artifact (dev only).
 *
 * Hermetic on Node >= 18; no Rust required when the committed artifact is
 * already correct.  When no Rust toolchain is available, gate mode still
 * verifies the committed SHA-256 (tamper detector).
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "packages", "independent-verifier");
const RUST = join(ROOT, "rust");
const WASM = join(ROOT, "wasm");
const WASM_FILE = join(WASM, "independent-verifier.wasm");
const SHA_FILE = join(WASM, "independent-verifier.sha256");
const LOCK_FILE = join(WASM, "Cargo.lock");
const RUST_LOCK = join(RUST, "Cargo.lock");

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex").toUpperCase();
}

let rustAvailable = false;
try {
  execFileSync("cargo", ["--version"], { stdio: "ignore" });
  rustAvailable = true;
} catch {
  rustAvailable = false;
}

const committedBytes = readFileSync(WASM_FILE);
const committedSha = sha256(committedBytes);
const recordedSha = readFileSync(SHA_FILE, "utf8").trim();

let fail = false;
const log = (ok, ...args) => {
  console.log(ok ? "PASS" : "FAIL", ...args);
  if (!ok) fail = true;
};

log(committedSha === recordedSha, "artifact SHA-256 matches recorded hash");

if (rustAvailable) {
  console.log("Rust toolchain detected — attempting regeneration…");
  try {
    execFileSync("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown"], {
      cwd: RUST,
      stdio: "inherit",
    });
  } catch {
    log(false, "cargo build failed — cannot regenerate artifact");
  }
  const rebuilt = readFileSync(join(RUST, "target", "wasm32-unknown-unknown", "release", "independent_verifier.wasm"));
  if (!UPDATE && Buffer.compare(rebuilt, committedBytes) !== 0) {
    log(false, "WASM BYTE DRIFT — committed artifact differs from regeneration (= HOLD per WS-3 §7)");
  } else if (UPDATE) {
    copyFileSync(join(RUST, "target", "wasm32-unknown-unknown", "release", "independent_verifier.wasm"), WASM_FILE);
    writeFileSync(SHA_FILE, sha256(rebuilt), "utf8");
    if (existsSync(RUST_LOCK)) copyFileSync(RUST_LOCK, LOCK_FILE);
    console.log("Updated committed artifact + SHA + Cargo.lock");
  } else {
    console.log("Artifact byte-identical to regeneration — no drift");
  }
} else {
  console.log("No Rust toolchain — regeneration skipped; committed artifact + SHA verified only");
}

if (fail) process.exit(1);
console.log("Build gate PASS");
