import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { commit, verifyReceipt } from "../../scripts/ladder/verification-levels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const RULES = [{ id: "VALUE_001" }];
const TX = "0x" + "ab".repeat(32);
const BLOCK = "0x" + "cd".repeat(32);
const chainOk = { getReceipt: (tx) => (tx === TX ? { txHash: TX, blockHash: BLOCK } : null) };

// CRLF is the checkout default on Windows and the file is read raw, so normalize
// once here rather than trusting a template that happens to match this machine.
const readDoc = (rel) => readFileSync(join(REPO, rel), "utf8").replace(/\r\n/g, "\n");

// Every surface that states the L1 chain rule. Each one is a reviewer-facing
// claim about what the machine does, so each is bound below to the machine.
const SURFACES = [
  "README.md",
  "docs/verification-and-integration-platform-2026-09-26.md",
  "docs/owner-decisions-and-claimable-facts-2026-09.md",
  "docs/live-integration-and-adoption-ladder-2026-09-25.md",
];

test("the three L1 outcomes this contract binds are the ones the code actually returns", () => {
  const commitment = commit({ subject: "alice", chainId: "1116", policy: RULES });
  const good = { status: "VERIFIED", blockHash: BLOCK, txHash: TX, chainId: "1116" };

  // 1. nobody was asked
  const unasked = verifyReceipt(good, commitment);
  assert.equal(unasked.verdict, "UNKNOWN");
  assert.equal(unasked.verdictCode, "NO_CHAIN_EVIDENCE");

  // 2. asked, and the chain does not know the hash - the only contradiction
  const unknown = "0x" + "ee".repeat(32);
  const asked = verifyReceipt({ ...good, txHash: unknown }, commitment, chainOk);
  assert.equal(asked.verdict, "MISMATCH");
  assert.equal(asked.verdictCode, "TX_NOT_FOUND");

  // 3. too malformed to even ask with
  const malformed = verifyReceipt({ ...good, txHash: "0xdead", chainId: "9999" }, commitment, chainOk);
  assert.equal(malformed.verdict, "UNKNOWN");
  assert.equal(malformed.verdictCode, "EVIDENCE_INCONSISTENT");

  // 4. asked, and the chain confirms a different block - also a contradiction
  const wrongBlock = verifyReceipt({ ...good, blockHash: "0x" + "ff".repeat(32) }, commitment, chainOk);
  assert.equal(wrongBlock.verdict, "MISMATCH");
  assert.equal(wrongBlock.verdictCode, "BLOCK_HASH_MISMATCH");
});

// Paragraph-scoped, on purpose. A document-wide substring check is the [C32]
// defect: the codes also occur in OTHER passages of the same file, so deleting
// them from the L1 rule leaves the document-wide check green. The negative
// control that proved this ("drop the asked-hinge wording from the ladder doc"
// reported DID NOT BITE) is why this is paragraph-scoped.
const paragraphs = (rel) =>
  readDoc(rel).split(/\n[ \t]*\n/).map((p) => p.replace(/\r/g, ""));

const ruleParagraphs = (rel) => paragraphs(rel).filter((p) => p.includes("NO_CHAIN_EVIDENCE"));

const HINGE = /whether anyone was asked|while no chain authority has been|no authority is UNKNOWN|an authority that does not know the/;

test("every doc surface that states the L1 rule names all three verdict codes in the SAME passage", () => {
  for (const rel of SURFACES) {
    const found = ruleParagraphs(rel).filter(
      (p) => p.includes("TX_NOT_FOUND") && p.includes("EVIDENCE_INCONSISTENT")
    );
    assert.ok(
      found.length > 0,
      `${rel}: no passage names NO_CHAIN_EVIDENCE, TX_NOT_FOUND and EVIDENCE_INCONSISTENT together ` +
        `(passages naming the first: ${ruleParagraphs(rel).length}, complete: ${found.length})`
    );
  }
});

test("the L1 rule is stated as a question of WHO WAS ASKED, in the passage that states it", () => {
  // The defect this binds: every surface used to reduce the rule to
  // "unconfirmed => UNKNOWN", which is false for the asked-and-contradicted case
  // and hides the system's strongest signal behind its weakest one.
  for (const rel of SURFACES) {
    const found = ruleParagraphs(rel).filter(
      (p) => p.includes("TX_NOT_FOUND") && p.includes("EVIDENCE_INCONSISTENT") && HINGE.test(p)
    );
    assert.ok(
      found.length > 0,
      `${rel}: the L1 rule passage states the three codes but never hinges them on whether an authority was asked`
    );
  }
});

test("the README rule does not reduce the L1 rule to two outcomes", () => {
  const readme = readDoc("README.md");
  const bullet = readme
    .split("\n")
    .findIndex((l) => l.includes("requires a chain authority"));
  assert.ok(bullet >= 0, "README no longer states the L1 chain rule");
  // The claim plus the two following lines is the whole bullet.
  const claim = readme.split("\n").slice(bullet, bullet + 3).join("\n");
  assert.ok(claim.includes("MISMATCH"), "README's L1 rule omits MISMATCH");
  assert.ok(claim.includes("NO_CHAIN_EVIDENCE"), "README's L1 rule omits NO_CHAIN_EVIDENCE");
  assert.ok(claim.includes("TX_NOT_FOUND"), "README's L1 rule omits the TX_NOT_FOUND code");
});

test("no surface asserts that an unconfirmed receipt is simply UNKNOWN", () => {
  // The exact wrong sentence, in either of its two homes.
  const wrong = [
    "A format-valid receipt nobody\n  confirmed is `UNKNOWN`, never `VERIFIED`.",
    "A format-valid receipt without a chain confirmation is UNKNOWN.",
  ];
  for (const rel of SURFACES) {
    const doc = readDoc(rel);
    for (const w of wrong) assert.ok(!doc.includes(w), `${rel} still states the two-outcome rule`);
  }
});
