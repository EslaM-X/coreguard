/**
 * CoreGuard — WS-6 / Phase 2.1 — THREE-INDEPENDENT-VERIFIER CONSENSUS.
 *
 * Vocabulary + fail-closed combiner over the three engines' envelopes
 * (A = JS canonical SDK, B = Rust/WASM independent verifier,
 *  C = Python-stdlib verifier-c). All three consume the SAME evidence `args`
 * and recompute (never caller-supplied) byte-identical evidence envelopes.
 *
 * Non-negotiable (WS-6; fail-closed, no majority rule):
 *   1. Any path INVALID => combined INVALID (contradiction dominates; a VERIFIED
 *      majority can never convert it).
 *   2. Combined VERIFIED requires EVERY path VERIFIED AND byte-identical
 *      recomputed evidence across all paths.
 *   3. Any disagreement / unavailable / UNVERIFIED / INCONCLUSIVE / mismatch =>
 *      combined INCONCLUSIVE — never promoted up by a majority.
 *   4. NO majority vote exists. 2 VERIFIED + 1 INVALID => INVALID;
 *      2 VERIFIED + 1 UNVERIFIED => INCONCLUSIVE. Failure is never converted
 *      into VERIFIED.
 */

export const CONSENSUS_VERDICTS = Object.freeze({
  INVALID: 0,
  INCONCLUSIVE: 1,
  UNVERIFIED: 2,
  VERIFIED: 3,
});

export const CONSENSUS_TOKEN = Object.freeze({
  [0]: "INVALID",
  [1]: "INCONCLUSIVE",
  [2]: "UNVERIFIED",
  [3]: "VERIFIED",
});

export const CONSENSUS_LABEL = Object.freeze({
  INVALID: "CONTRADICTION",
  INCONCLUSIVE: "DISAGREEMENT",
  UNVERIFIED: "NOT_PROVEN",
  VERIFIED: "THREE_PATH_CONSENSUS",
});

export const ENGINE_VERDICT_TOKENS = Object.freeze([
  "VERIFIED",
  "INVALID",
  "INCONCLUSIVE",
  "UNVERIFIED",
]);

export const CONSENSUS_EVIDENCE_KEYS = Object.freeze([
  "intentRef",
  "manifestId",
  "bindingRef",
  "policyId",
  "executionScope",
  "decisionRef",
  "executionRef",
  "traceHash",
]);

export function toConsensusVerdict(envelope, pathId) {
  const token = String(envelope?.verdict ?? envelope?.token ?? "");
  if (!CONSENSUS_TOKEN[token] && !Object.values(ENGINE_VERDICT_TOKENS).includes(token)) {
    return {
      path: pathId,
      verdict: CONSENSUS_VERDICTS.UNVERIFIED,
      token: "UNVERIFIED",
      label: CONSENSUS_LABEL.UNVERIFIED,
      envelope: envelope ?? null,
      ok: false,
    };
  }
  const verdict = CONSENSUS_VERDICTS[token];
  return {
    path: pathId,
    verdict,
    token,
    label: CONSENSUS_LABEL[token] ?? token,
    envelope: envelope ?? null,
    ok: verdict === CONSENSUS_VERDICTS.VERIFIED,
  };
}

/**
 * Fold per-path consensus verdicts into ONE fail-closed combined verdict.
 * WS-6 — no majority rule.
 */
export function combineConsensus(verdicts = []) {
  const present = verdicts.filter((v) => v && typeof v === "object");

  const invalid = present.find((v) => v.token === "INVALID");
  if (invalid) {
    return {
      combined: "INVALID",
      token: "INVALID",
      verdict: CONSENSUS_VERDICTS.INVALID,
      label: CONSENSUS_LABEL.INVALID,
      reason: `contradiction dominates — path ${invalid.path} INVALID; a VERIFIED majority can NEVER convert it (WS-6/2, no majority rule)`,
    };
  }

  if (present.length === 0 || present.some((v) => v.token !== "VERIFIED")) {
    const tokens = present.map((v) => `${v.path}:${v.token}`).join(", ");
    return {
      combined: "INCONCLUSIVE",
      token: "INCONCLUSIVE",
      verdict: CONSENSUS_VERDICTS.INCONCLUSIVE,
      label: CONSENSUS_LABEL.INCONCLUSIVE,
      reason: present.length
        ? `disagreement — not every path VERIFIED (${tokens}); combined INCONCLUSIVE, never promoted up by majority (WS-6/2)`
        : "no path produced a verdict — combined INCONCLUSIVE (fail-closed)",
    };
  }

  const evidences = present.map((v) => v.envelope?.recomputed ?? v.envelope?.evidence ?? null);
  const byteIdentical =
    evidences.length > 0 &&
    evidences.every((e) => e !== null && JSON.stringify(e) === JSON.stringify(evidences[0]));
  if (!byteIdentical) {
    return {
      combined: "INCONCLUSIVE",
      token: "INCONCLUSIVE",
      verdict: CONSENSUS_VERDICTS.INCONCLUSIVE,
      label: CONSENSUS_LABEL.INCONCLUSIVE,
      reason: "all paths VERIFIED but recomputed evidence NOT byte-identical across paths — combined INCONCLUSIVE; byte-identity required for VERIFIED (WS-3/WS-6)",
    };
  }

  return {
    combined: "VERIFIED",
    token: "VERIFIED",
    verdict: CONSENSUS_VERDICTS.VERIFIED,
    label: CONSENSUS_LABEL.VERIFIED,
    reason: "all three paths VERIFIED with byte-identical recomputed evidence — THREE_PATH_CONSENSUS (WS-6)",
    byteIdentical: true,
  };
}

/**
 * Run the SAME canonical args through all three injected engine paths and fold
 * their envelopes via toConsensusVerdict + combineConsensus.
 *
 * @param {object} options
 * @param {object} options.args  canonical evidence args for ALL paths (identical)
 * @param {Array<{id: string, run: (args)=>Promise<object>}>} options.paths
 *        engine adapters (A/B/C). A path that throws => UNVERIFIED (never
 *        promoted). The consensus folds the BYTE-IDENTICAL recomputed evidence
 *        recomputed by each engine — caller-supplied values are never trusted.
 */
export async function runConsensus({ args, paths = [] }) {
  const envelopes = await Promise.all(
    paths.map(async (p) => {
      try {
        const envelope = await p.run(args);
        return toConsensusVerdict(envelope, p.id);
      } catch (e) {
        return {
          path: p.id,
          verdict: CONSENSUS_VERDICTS.UNVERIFIED,
          token: "UNVERIFIED",
          label: CONSENSUS_LABEL.UNVERIFIED,
          envelope: null,
          ok: false,
          error: `path ${p.id} threw — fail-closed UNVERIFIED: ${e?.message ?? String(e)}`,
        };
      }
    })
  );
  const combined = combineConsensus(envelopes);
  return {
    ...combined,
    token: combined.token,
    verdict: combined.verdict,
    paths: envelopes.map((v) => ({ path: v.path, token: v.token })),
  };
}

export const consensus = Object.freeze({
  CONSENSUS_VERDICTS,
  CONSENSUS_TOKEN,
  CONSENSUS_LABEL,
  ENGINE_VERDICT_TOKENS,
  CONSENSUS_EVIDENCE_KEYS,
  toConsensusVerdict,
  combineConsensus,
  runConsensus,
});
