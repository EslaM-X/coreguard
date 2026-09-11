/**
 * CoreGuard — Anchor Verdict Semantics (P0)
 *
 * Single source of truth for the anchor-verification verdict. Used by both
 * verify-anchor.ps1 and verify-anchor.sh so the two scripts can never drift
 * on the semantics of VERIFIED / INVALID / INCONCLUSIVE / UNVERIFIED.
 *
 * Core rule (P0):
 *   - A level claim requires the FULL evidence profile for that level.
 *   - Missing (never-run / unreachable) REQUIRED evidence => UNVERIFIED.
 *     Missing evidence can NEVER reach VERIFIED.
 *   - Any RUN check that FAILs (contradiction) => INVALID (dominates).
 *   - VERIFIED only when every required check PASSes AND every run check
 *     (required or optional) PASSes.
 *   - INCONCLUSIVE is reserved for post-v0.1 levels (L3 partial disclosure);
 *     it has no runtime path in v0.1.
 *
 * Zero dependencies, deterministic, pure. Importable for tests and callable
 * as a CLI:  node scripts/anchor-verdict.mjs --level L2 --states <json>
 */

import { readFileSync } from "node:fs";

export const CHECKS = {
  C_recompute: "offline recompute of receiptId/commitment/proofId from artifact",
  A_deploy: "code present at registry on chain",
  A_deployTx: "deploy tx receipt: status 0x1 + contractAddress == registry",
  B_anchor: "verifyCommitment(proofId, commitment) == true on chain",
  B_commitIntentTx: "commitIntent tx: status 0x1 + to == registry + IntentCommitted[receiptId, commitment]",
  B_anchorTx: "anchorProof tx: status 0x1 + to == registry + ProofAnchored[proofId, commitment, result]",
  B_storageIntent: "storage slot keccak256(receiptId || 0) == commitment",
  B_storageAnchor: "storage slot keccak256(proofId || 0) == commitment",
  bytecode: "deployed runtime bytecode matches local compiled artifact",
  crossRpc: "all chain reads repeated from an independent RPC source",
};

function isCheck(name) {
  return Object.prototype.hasOwnProperty.call(CHECKS, name);
}

const BASE_L0 = ["C_recompute", "A_deploy", "B_anchor"];
const BASE_L1 = BASE_L0.concat(["A_deployTx", "B_commitIntentTx"]);
const BASE_L2 = BASE_L1.concat(["B_anchorTx"]);

export const PROFILE = {
  L0: {
    claimable: true,
    description: "Commitment anchor: offline recompute + registry deployment + on-chain verifyCommitment(proofId, commitment)",
    required: BASE_L0,
  },
  L1: {
    claimable: true,
    description: "Receipt anchor: L0 + commit tx deep evidence (IntentCommitted binds receiptId + commitment)",
    required: BASE_L1,
  },
  L2: {
    claimable: true,
    description: "Proof anchor: L1 + anchor tx deep evidence (ProofAnchored binds proofId + commitment + result)",
    required: BASE_L2,
  },
  L3: {
    claimable: false,
    description: "Merkle evidence (post-v0.1): partial disclosure — INCONCLUSIVE path reserved",
    required: [],
  },
  L4: {
    claimable: false,
    description: "Zero-knowledge proof (post-v0.1)",
    required: [],
  },
};

export const OPTIONAL_CHECKS = ["B_storageIntent", "B_storageAnchor", "bytecode", "crossRpc"];

export const LEVELS = Object.keys(PROFILE);

const PASS = "PASS";
const FAIL = "FAIL";
const NOT_RUN = "NOT_RUN";

/**
 * Normalize a raw state map into { checkName: PASS|FAIL|NOT_RUN }, mapping
 * any value that is not exactly PASS or FAIL to NOT_RUN (unknown/missing).
 */
export function normalizeStates(states = {}) {
  const out = {};
  for (const [name, value] of Object.entries(states)) {
    if (!isCheck(name)) continue;
    out[name] = value === PASS || value === FAIL ? value : NOT_RUN;
  }
  return out;
}

function requiredFor(level) {
  return PROFILE[level]?.required ?? [];
}

/**
 * Evaluate the anchor verdict for a claimed level.
 *
 * Returns {
 *   level, claimable, verdict, code, required, requiredMissing,
 *   failing, states (normalized), reason
 * }
 *
 * verdict codes: "VERIFIED" | "INVALID" | "INCONCLUSIVE" | "UNVERIFIED"
 */
export function evaluateVerdict(level, rawStates = {}) {
  const profile = PROFILE[level];
  if (!profile) {
    return {
      level,
      claimable: false,
      verdict: "UNVERIFIED",
      code: "UNSUPPORTED_LEVEL",
      required: [],
      requiredMissing: [level],
      failing: [],
      states: {},
      reason: `Unknown level ${level}`,
    };
  }
  if (!profile.claimable) {
    return {
      level,
      claimable: false,
      verdict: "INCONCLUSIVE",
      code: "LEVEL_UNAVAILABLE",
      required: [],
      requiredMissing: [],
      failing: [],
      states: normalizeStates(rawStates),
      reason: `${level} is not claimable in v0.1 (${profile.description})`,
    };
  }

  const states = normalizeStates(rawStates);
  const required = requiredFor(level);

  // Contradiction dominates: any check that RAN and FAILed.
  const failing = Object.entries(states)
    .filter(([, v]) => v === FAIL)
    .map(([k]) => k);

  if (failing.length > 0) {
    return {
      level,
      claimable: true,
      verdict: "INVALID",
      code: "CONTRADICTION",
      required,
      requiredMissing: [],
      failing,
      states,
      reason: `Contradiction detected in ${failing.join(", ")}. A failed check can never be upgraded to VERIFIED.`,
    };
  }

  // Missing required evidence => UNVERIFIED, never VERIFIED.
  const requiredMissing = required.filter((c) => states[c] !== PASS);

  if (requiredMissing.length > 0) {
    return {
      level,
      claimable: true,
      verdict: "UNVERIFIED",
      code: "MISSING_REQUIRED_EVIDENCE",
      required,
      requiredMissing,
      failing: [],
      states,
      reason: `Missing required evidence: ${requiredMissing.join(", ")}. Unverified — never VERIFIED.`,
    };
  }

  // Whatever ran must have PASSed; leftover NOT_RUN is optional, allowed.
  const unexpected = Object.entries(states)
    .filter(([, v]) => v === NOT_RUN)
    .map(([k]) => k);
  const unexpectedRequired = unexpected.filter((c) => required.includes(c));

  if (unexpectedRequired.length > 0) {
    return {
      level,
      claimable: true,
      verdict: "UNVERIFIED",
      code: "MISSING_REQUIRED_EVIDENCE",
      required,
      requiredMissing: unexpectedRequired,
      failing: [],
      states,
      reason: `Missing required evidence: ${unexpectedRequired.join(", ")}. Unverified — never VERIFIED.`,
    };
  }

  return {
    level,
    claimable: true,
    verdict: "VERIFIED",
    code: "ANCHOR_INTEGRITY",
    required,
    requiredMissing: [],
    failing: [],
    states,
    reason: "All required evidence present and PASS; no contradicting FAIL. VERIFIED ANCHOR INTEGRITY.",
  };
}

function cliArg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : "";
}

function cliJsonArg(name) {
  const file = cliArg(`${name}-file`);
  if (file) {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  }
  const raw = cliArg(name);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

if (process.argv[1] && process.argv[1].endsWith("anchor-verdict.mjs")) {
  const level = cliArg("--level") || "L2";
  const states = cliJsonArg("--states");
  const result = evaluateVerdict(level, states);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}