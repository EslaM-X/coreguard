/**
 * CoreGuard Deterministic Replay (P1, L2 tier)
 *
 * Re-derive, from the committed execution evidence alone, the STRUCTURAL rule
 * book the chain MUST have followed if those frames really executed in that
 * order — and pin it as a deterministic digest. Fully offline, zero-dependency,
 * no chain state required.
 *
 * What it validates (the "plan" is the flattened, depth-ordered call tree):
 *   1. The frame list is a well-formed depth-first tree:
 *        - frame 0 is a root at depth 0;
 *        - consecutive depth never rises by more than 1 (a child sits directly
 *          under its parent — a "depth jump" is structurally impossible);
 *        - depth never goes negative.
 *   2. Root identity: the root frame's from/to/calldata-selector must equal the
 *      transaction-level from/to/calldata in the same trace (the trace is
 *      ONE claim — it cannot disagree with itself).
 *   3. Gas coherence: no frame may report more gas than the transaction used,
 *      and a nested frame may not report more gas than its parent reporting it
 *      (gasUsed is additive by construction).
 *   4. Integer hygiene: every numeric field must be a canonical CGEP/1 uint —
 *      non-canonical integers in evidence are a contradiction on their face.
 *   5. Call-graph orderings are deterministic: the plan digest is the
 *      canonical hash of the normalised, sorted frame plan, so the same
 *      evidence re-derives the SAME digest every time.
 *
 * The verifier uses this as the optional REPLAY_CONSISTENCY check: a trace
 * whose plan is invalid is INVALID (the ignored claim is self-contradictory);
 * a valid plan yields a digest that downstream tools can commit or compare
 * without re-executing the chain.
 */

import { canonicalize, domainHash, canonicalUintString, uintToBigInt } from "../canonical/index.js";

export const REPLAY_DOMAIN = "CGEP/1:REPLAY";

function selectorOf(calldata) {
  const cd = String(calldata || "").toLowerCase();
  return cd.length >= 10 ? cd.slice(0, 10) : null;
}

function toBigIntOrNull(value) {
  try {
    return uintToBigInt(value);
  } catch {
    return null;
  }
}

/**
 * Deterministic structural replay of a normalized trace.
 *
 * Returns:
 *   {
 *     valid: boolean,
 *     errors: string[],           // structural contradictions ([] when valid)
 *     frames: number,             // frame count
 *     root: { from, to, selector, gasUsed, value },
 *     digestHex: "0x…",           // domain-separated plan digest (await-able)
 *   }
 */
export async function planTraceReplay(trace) {
  if (!trace || typeof trace !== "object") {
    return { valid: false, errors: ["trace missing"], frames: 0, root: null };
  }

  const errors = [];
  const frames = Array.isArray(trace.calls) ? trace.calls : [];
  const txFrom = String(trace.from || "").toLowerCase();
  const txTo = String(trace.to || "").toLowerCase();
  const txSelector = selectorOf(trace.calldata);
  const txGas = toBigIntOrNull(trace.gasUsed);
  const txGasLimit = toBigIntOrNull(trace.gasLimit);

  // 4. Integer hygiene for the transaction-level numerics.
  if (txGas === null) errors.push(`non-canonical tx gasUsed ${JSON.stringify(trace.gasUsed)}`);
  if (txGasLimit !== null && txGas !== null && txGasLimit < txGas) {
    errors.push(`gasUsed exceeds committed gasLimit`);
  }

  // Call-graph legality (DFS flattened: depth must be stable / +1 / -any).
  let prevDepth = null;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame || typeof frame !== "object") {
      errors.push(`frame[${i}] is not an object`);
      continue;
    }

    let d = null;
    try {
      d = uintToBigInt(frame.depth ?? "0");
      if (typeof frame.depth === "number" && !Number.isInteger(frame.depth)) d = null;
    } catch {
      d = null;
    }
    if (d === null) {
      errors.push(`frame[${i}] non-canonical depth ${JSON.stringify(frame.depth)}`);
      continue;
    }

    if (prevDepth === null) {
      if (d !== 0n) errors.push(`frame[0] must be root at depth 0, got depth ${d}`);
    } else if (d > prevDepth + 1n) {
      errors.push(`depth jump at frame[${i}]: depth ${d} after ${prevDepth} (child must nest directly)`);
    }
    prevDepth = d;

    const fFrom = String(frame.from || "").toLowerCase();
    const fTo = String(frame.to || "").toLowerCase();
    const fSel = selectorOf(frame.calldata);
    const fGas = toBigIntOrNull(frame.gasUsed);
    const fValue = toBigIntOrNull(frame.value);

    if (fGas === null) errors.push(`frame[${i}] non-canonical gasUsed ${JSON.stringify(frame.gasUsed)}`);
    if (fValue === null) errors.push(`frame[${i}] non-canonical value ${JSON.stringify(frame.value)}`);

    if (d === 0n) {
      // 2. Root identity: the trace claim must agree with its own root frame.
      if (fFrom && txFrom && fFrom !== txFrom) errors.push(`root frame from ${fFrom} != trace from ${txFrom}`);
      if (fTo && txTo && fTo !== txTo) errors.push(`root frame to ${fTo} != trace to ${txTo}`);
      if (txSelector && fSel && txSelector !== fSel) {
        errors.push(`root frame selector ${fSel} != trace calldata selector ${txSelector}`);
      }
    }

    // 3. Gas coherence (only when comparable).
    if (fGas !== null) {
      if (fGas < 0n) errors.push(`frame[${i}] negative gasUsed`);
      if (txGas !== null && fGas > txGas) errors.push(`frame[${i}] gasUsed ${fGas} exceeds tx gasUsed ${txGas}`);
    }
    if (fValue !== null && fValue < 0n) errors.push(`frame[${i}] negative value`);
  }

  // Canonical plan: strip nothing — normalize numeric order + identities.
  const plan = {
    trace: {
      from: txFrom,
      to: txTo,
      selector: txSelector,
      gasUsed: txGas === null ? null : String(txGas),
      gasLimit: txGasLimit === null ? null : String(txGasLimit),
    },
    frames: frames.map((f, i) => ({
      i,
      depth: Number((f.depth ?? 0)),
      from: String(f.from || "").toLowerCase(),
      to: String(f.to || "").toLowerCase(),
      selector: selectorOf(f.calldata),
      value: String(toBigIntOrNull(f.value) ?? ""),
      gasUsed: String(toBigIntOrNull(f.gasUsed) ?? ""),
      status: f.status || "SUCCESS",
    })),
  };

  const digestHex = await domainHash(REPLAY_DOMAIN, plan);
  const root = frames.length > 0 ? plan.frames[0] : null;

  return {
    valid: errors.length === 0,
    errors,
    frames: frames.length,
    root,
    digestHex,
  };
}

/**
 * Convenience: deterministic plan digest for a trace (commit/compare target).
 */
export async function replayPlanDigest(trace) {
  const plan = await planTraceReplay(trace);
  return plan.digestHex;
}

export { canonicalize };