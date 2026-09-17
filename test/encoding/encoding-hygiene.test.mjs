import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const BOM = [0xef, 0xbb, 0xbf];
const REPLACEMENT = String.fromCharCode(0xfffd);

const CP1252_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  0x009d, 0x00a0, 0x00a7, 0x00b7, 0x00a9, 0x00ae,
]);

const bomAllowed = (rel) => rel.endsWith(".ps1") || rel === "scripts/verify-live.json";

function hasMojibake(text) {
  for (let i = 0; i < text.length - 1; i++) {
    const a = text.codePointAt(i);
    const b = text.codePointAt(i + 1);
    if (a === 0x00e2 && CP1252_HIGH.has(b)) return true;
    if (a === 0x00c2 && CP1252_HIGH.has(b)) return true;
    if (a === 0x00c3 && b >= 0x0080 && b <= 0x00bf) return true;
  }
  return false;
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function trackedTextFiles() {
  const listed = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const files = [];
  for (const rel of listed) {
    let buf;
    try {
      buf = readFileSync(join(repoRoot, rel));
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    files.push({ rel, buf, text: buf.toString("utf8") });
  }
  return files;
}

const TRACKED = trackedTextFiles();

test("no UTF-8 BOM outside the frozen/PowerShell allowlist", () => {
  const offenders = TRACKED.filter(
    ({ rel, buf }) =>
      buf.length >= 3 &&
      buf[0] === BOM[0] &&
      buf[1] === BOM[1] &&
      buf[2] === BOM[2] &&
      !bomAllowed(rel)
  ).map(({ rel }) => rel);
  assert.deepEqual(offenders, []);
});

test("no U+FFFD replacement characters in tracked text", () => {
  const offenders = TRACKED.filter(({ text }) => text.includes(REPLACEMENT)).map(({ rel }) => rel);
  assert.deepEqual(offenders, []);
});

test("no double-encoded (mojibake) sequences in tracked text", () => {
  const offenders = TRACKED.filter(({ text }) => hasMojibake(text)).map(({ rel }) => rel);
  assert.deepEqual(offenders, []);
});
