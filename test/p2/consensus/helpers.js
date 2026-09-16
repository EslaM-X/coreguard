/**
 * Phase 2.1 / WS-6 — consensus harness over the REAL three-path parity
 * substrate (identical evidence args -> A/B/C -> byte-identical envelopes,
 * WS-3 parity corpus proven by test/verifier-c/differential.test.js).
 *
 * These helpers fold each real engine envelope into the consensus vocabulary
 * and drive runConsensus — never inventing a fourth engine, never trusting
 * caller-supplied evidence (every engine RECOMPUTES its own evidence keys).
 */

import {
  CONSENSUS_EVIDENCE_KEYS,
  CONSENSUS_TOKEN,
  CONSENSUS_VERDICTS,
  combineConsensus,
  toConsensusVerdict,
} from "../../../packages/consensus/index.js";

import {
  eoaArgs,
  contractArgs,
  verifyRef,
  verifyWasm,
  verifyC,
} from "../../verifier-c/helpers.js";

/** Shared canonical evidence args (the SAME bundle all three paths consume). */
export const canonicalArgs = async (kind = "eoa", overrides = {}) =>
  kind === "contract" ? contractArgs(overrides) : eoaArgs(overrides);

/** The three REAL, INDEPENDENT engine paths, injected (never imported) into
 * the combiner — A=JS SDK, B=Rust/WASM., C=Python-stdlib. */
export const consensusPaths = {
  A: { id: "A", run: (args) => verifyRef(args) },
  B: { id: "B", run: (args) => verifyWasm(args) },
  C: { id: "C", run: (args) => verifyC(args) },
};

const pathsToList = (p) => Object.entries(p).map(([id, { run }]) => ({ id, run }));

/**
 * Byte-normalize a real engine envelope to the consensus fold `evidence`
 * (the RECOMPUTED keys only, byte-identical across A/B/C for identical args —
 * WS-3 parity, never caller-supplied).
 */
export function recomputedEvidenceOf(envelope) {
  const rec =
    (envelope && (envelope.recomputed ?? envelope.evidence ?? envelope.proof)) ?? null;
  if (!rec || typeof rec !== "object") return null;
  const folded = {};
  for (const k of CONSENSUS_EVIDENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rec, k)) folded[k] = rec[k];
  }
  return folded;
}

/**
 * Real three-path consensus: run the SAME canonical args through A/B/C and
 * fold their real envelopes with the fail-closed combiner.
 */
export async function runRealConsensus(kind = "eoa", overrides = {}) {
  const args = await canonicalArgs(kind, overrides);
  const envelopes = {
    A: await verifyRef(args),
    B: await verifyWasm(args),
    C: await verifyC(args),
  };
  const verdicts = Object.entries(envelopes).map(([path, envelope]) =>
    toConsensusVerdict({ verdict: envelope.token ?? "UNVERIFIED", envelope, evidence: recomputedEvidenceOf(envelope) }, path)
  );
  return { args, envelopes, verdicts, combined: combineConsensus(verdicts) };
}
