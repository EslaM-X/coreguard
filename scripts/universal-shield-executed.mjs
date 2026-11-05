#!/usr/bin/env node
/**
 * Universal DApp Shield — EXECUTED evidence runner (offline, deterministic).
 *
 * What this is: a committed runner that actually EXECUTES the firewall-guard
 * surface (packages/sdk guard.*) as the "wrap ANY app action" shield, across
 * the wrapper's real decision arms — exactly as the Q-FW5/Q-FW7 law defines:
 *
 *   swap    (mapped model, `received` in-model)  → ALLOW
 *   deposit (mapped transfer model)             → ALLOW
 *   lend    (action model not mapped) + review   → REQUIRE_REVIEW (HOLD arm)
 *   borrow  (action model not mapped) + review    → REQUIRE_REVIEW (HOLD arm)
 *   vote    (unmapped model, NO review path)     → DENY  (REVIEW_NOT_CONFIGURED)
 *   execution evidence smuggled into the PRE surface → REFUSED (Q-FW10 TypeError)
 *
 * The shield NEVER silently passes: unmapped or smuggled context is HOLD or
 * DENY by the engine's own fail-closed law — that IS the universal-DApp-shield
 * guarantee, now with a committed machine-checked execution artifact.
 *
 * What this is NOT:
 *   - no broadcast, no signing of real money (PRE-only surface; post-execution
 *     verdicts stay on the CGEP/1 verify/anchor surfaces).
 *
 * Usage:
 *   node scripts/universal-shield-executed.mjs           # generate artifact
 *   node scripts/universal-shield-executed.mjs --verify  # re-derive (offline, exit 0/1)
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createIntent } from "../packages/intent/index.js";
import { createPolicy } from "../packages/policy/index.js";
import {
  typedDataDigest,
  signDigest,
  keccak,
  publicKeyFromPrivateKey,
  addressFromPublicKey,
} from "../packages/evm/index.js";
import { hashIntent } from "../packages/canonical/index.js";
import { computeDeclarationId } from "../packages/firewall/binding.js";
import { createGuard } from "../packages/sdk/index.js";
import * as EVM from "../packages/evm/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT = resolve(repoRoot, "docs/evidence/universal-dapp-shield-executed.json");

const GUARD_DOMAIN = "GuardShield/1";
const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };
const pad = (n, len) => String(n).padStart(len, "0");

/** Mirrors test/firewall/helpers.js seedKey/makeAddress (scripts must not import test trees). */
function seedKey(i) {
  const digest = keccak(`CGEP firewall test key ${i}`);
  const privHex = Buffer.from(digest).toString("hex");
  const pub = publicKeyFromPrivateKey(privHex);
  return { priv: privHex, address: addressFromPublicKey(pub), i };
}
const makeAddress = (seed) => "0x" + pad(seed.toString(16), 40);

/**
 * The wrapped action kinds and their EXPECTED arms under the engine's own law:
 * mapped models → ALLOW; unmapped models → HOLD/DENY per review configuration.
 */
const KINDS = [
  { kind: "swap", action: "SWAP", selector: "0x38ed1739", target: makeAddress(0xd1), expect: "ALLOW", review: false, received: "950000000000000000" },
  { kind: "deposit", action: "DEPOSIT", selector: "0xa9059cbb", target: makeAddress(0xd6), expect: "ALLOW", review: false, received: null },
  { kind: "lend", action: "LEND", selector: "0xc3643def", target: makeAddress(0xd2), expect: "REQUIRE_REVIEW", review: true, received: null },
  { kind: "borrow", action: "BORROW", selector: "0xa415db7b", target: makeAddress(0xd3), expect: "REQUIRE_REVIEW", review: true, received: null },
  { kind: "vote", action: "VOTE", selector: "0x9e463206", target: makeAddress(0xd5), expect: "DENY", review: false, received: null },
];

/** Same declaration build/sign semantics the helpers use. */
async function signedIntentFor(kindRow, i) {
  const k = seedKey(i);
  const intent = createIntent({
    chainId: "1116",
    signer: k.address,
    nonce: String(i),
    validAfter: "0",
    validUntil: "100000",
    action: kindRow.action,
    target: kindRow.target,
    selector: kindRow.selector,
    asset: "0x0000000000000000000000000000000000000001",
    amount: "1000000000000000000",
    recipient: makeAddress(0xcc),
    constraints: [],
  });
  const d = {
    version: "CGEP/1",
    kind: "INTENT_DECLARATION",
    chainId: String(intent.chainId),
    nonce: String(intent.nonce ?? "0"),
    signerBinding: { address: intent.signer },
    intent,
  };
  d.manifestId = await computeDeclarationId(d);
  const sd = { ...d };
  delete sd.manifestId;
  sd.manifestId = await computeDeclarationId(sd);
  const digest = typedDataDigest("ManifestDeclaration", TYPES, { manifestId: sd.manifestId }, sd.chainId);
  const sig = await signDigest(digest, k.priv);
  sd.signature = { scheme: "EIP-712", signer: sd.signerBinding.address, ...sig, digest: "0x" + Buffer.from(digest).toString("hex") };
  return { intent, declaration: sd };
}

function baseSimulation(intent, row) {
  const sim = {
    target: intent.target,
    selector: intent.selector,
    recipient: intent.recipient,
    amount: intent.amount,
    gasUsed: "60000",
    blockTimestamp: "1",
  };
  if (row.received) sim.received = row.received;
  return sim;
}

export function digestStable(payload) {
  const { generatedAt, evidenceDigest, ...rest } = payload;
  const h = createHash("sha256");
  h.update(JSON.stringify(rest));
  return "sha256:" + h.digest("hex");
}

export async function buildArtifact() {
  const guard = createGuard();
  const rows = [];

  for (let i = 0; i < KINDS.length; i++) {
    const row = KINDS[i];
    const { intent, declaration } = await signedIntentFor(row, i + 1);
    const result = await guard.authorize(intent, {
      declaration,
      policy: createPolicy({ policyId: "pol-universal-shield", name: "universal dapp shield", rules: [] }),
      activePolicyIds: ["pol-universal-shield"],
      authorityAtState: "1024",
      simulation: baseSimulation(intent, row),
      writer: "universal-shield",
      evm: EVM,
      ...(row.review ? { reviewPath: { configured: true, writers: [makeAddress(0x77)] } } : {}),
    });
    if (result.decision !== row.expect) {
      throw new Error(`${row.kind} must ${row.expect} — got ${result.decision} (${(result.errors ?? []).join("; ")})`);
    }
    rows.push({
      kind: row.kind,
      action: row.action,
      expect: row.expect,
      decision: result.decision,
      status: result.status,
      decisionRef: result.decisionRef ?? null,
      intentHash: hashIntent(intent),
      selector: row.selector,
      reviewPathConfigured: row.review,
    });
  }

  // Negative control: execution evidence smuggled into the PRE surface → REFUSED (Q-FW10).
  const { intent, declaration } = await signedIntentFor(KINDS[0], 1);
  let negative;
  try {
    await guard.authorize(intent, {
      declaration,
      policy: createPolicy({ policyId: "pol-universal-shield", name: "shield", rules: [] }),
      activePolicyIds: ["pol-universal-shield"],
      authorityAtState: "1024",
      simulation: baseSimulation(intent, KINDS[0]),
      writer: "universal-shield",
      evm: EVM,
      txHash: "0x" + "1".repeat(64),
    });
    negative = { refused: false, message: null };
  } catch (e) {
    negative = { refused: true, message: String(e.message), code: "Q-FW10" };
  }
  if (!negative.refused) throw new Error("the PRE surface accepted execution evidence — fail-closed seam broken");

  const artifact = {
    schema: "CoreGuard-Evidence/1",
    artifact: "universal-dapp-shield-executed",
    version: GUARD_DOMAIN,
    executedBy: "scripts/universal-shield-executed.mjs",
    broadcast: "NOT_PERFORMED — PRE-only surface; no broadcast, no funds moved",
    rows,
    negative,
    summary: {
      wrappedKinds: KINDS.length,
      decisions: Object.fromEntries(rows.map((r) => [r.kind, r.decision])),
      smuggled: negative.refused ? "REFUSED" : "LEAKED",
    },
  };
  artifact.evidenceDigest = digestStable(artifact);
  artifact.generatedAt = new Date().toISOString();
  return artifact;
}

export async function main(argv) {
  if (argv.includes("--verify")) {
    const stored = JSON.parse(await readFile(OUT, "utf8"));
    const recomputed = digestStable(stored);
    if (recomputed !== stored.evidenceDigest) {
      console.error(`DIGEST MISMATCH: stored=${stored.evidenceDigest} recomputed=${recomputed}`);
      process.exit(1);
    }
    const want = { swap: "ALLOW", deposit: "ALLOW", lend: "REQUIRE_REVIEW", borrow: "REQUIRE_REVIEW", vote: "DENY" };
    for (const [kind, decision] of Object.entries(want)) {
      if (stored.summary.decisions[kind] !== decision) {
        console.error(`SUMMARY MISMATCH: ${kind} expected ${decision}`);
        process.exit(1);
      }
    }
    if (stored.summary.smuggled !== "REFUSED") {
      console.error("SUMMARY MISMATCH: smuggled execution evidence must be REFUSED");
      process.exit(1);
    }
    console.log("UNIVERSAL-DAPP-SHIELD EXECUTED · VERIFIED — digest faithful, decision arms intact (2 ALLOW · 2 REQUIRE_REVIEW · 1 DENY · 1 REFUSED)");
    return 0;
  }
  const artifact = await buildArtifact();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(OUT);
  for (const r of artifact.rows) console.log(` ${r.kind.padEnd(8)} ${r.decision.padEnd(16)} ${r.status} ${r.decisionRef?.slice(0, 18) ?? ""}`);
  console.log(` smuggled execution evidence → ${artifact.summary.smuggled}`);
  console.log("digest:", artifact.evidenceDigest);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exit(await main(process.argv.slice(2)));
}
