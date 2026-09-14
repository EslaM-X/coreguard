/**
 * CoreGuard WS-3 — Independent Verifier (Verifier B): ESM transport/marshalling
 * wrapper around the Rust/WASM module.
 *
 * DESIGN BOUNDARY (Q-W3-3): this file is transport AND MARSHALLING ONLY. It
 * loads the committed WASM binary, moves JSON bytes across the ABI, performs
 * the EIP-1271 read steps the WASM cannot do alone (I/O via an injected
 * transport bound to the verifier's own digest+calldata), and rejects
 * post-execution evidence at the pre-execution seam (Q-W3-6). It NEVER
 * canonicalizes, hashes, recovers a signer, or evaluates any protocol fact
 * itself; those live in the WASM so an independent implementation (not an
 * independent wrapper) is what confirms them.
 *
 * The WASM is a self-contained module: zero function imports, memory exported,
 * `verify`/`canon`/`alloc`/`dealloc`/`output_ptr`/`output_len` exports only.
 * Loading it as this module's sole dependency keeps the verifier hermetic on
 * Node >= 18 with no Rust toolchain (`npm test` consumes the committed
 * artifact; `scripts/build-verifier.mjs` is the drift/HOLD gate).
 */

import { readFileSync } from "node:fs";

/** Post-execution evidence — structurally refused at the pre-execution seam
 * (Q-W3-6 / Q-FW10), an exact mirror of the WASM's internal refusal list. */
export const EXECUTION_EVIDENCE_KEYS = Object.freeze([
  "executionRef",
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionBlock",
  "txHash",
  "receipt",
]);

export const WASM_PATH = new URL("./wasm/independent-verifier.wasm", import.meta.url);

function guardSeam(input) {
  if (!input || typeof input !== "object") return;
  const present = EXECUTION_EVIDENCE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(input, k));
  if (present.length > 0) {
    throw new TypeError(
      `independent-verifier: pre-execution verification must NOT receive post-execution evidence (${present.join(", ")}) — Q-W3-6/Q-FW10 seam`
    );
  }
}

/** Load and instantiate the committed WASM module (cached after first load). */
export async function loadIndependentVerifier({ wasmPath = WASM_PATH } = {}) {
  const bytes = readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports;
  const mem = () => ex.memory;

  const withInput = (fn, input) => {
    const json = JSON.stringify(input);
    const bytes = new TextEncoder().encode(json);
    const ptr = ex.alloc(bytes.length);
    if (!ptr) throw new Error("independent-verifier: alloc returned null");
    try {
      new Uint8Array(mem().buffer, ptr, bytes.length).set(bytes);
      const outLen = fn(ptr, bytes.length);
      const outPtr = ex.output_ptr();
      const view = new Uint8Array(mem().buffer, outPtr, outLen);
      return new TextDecoder().decode(view);
    } finally {
      ex.dealloc(ptr, bytes.length);
    }
  };

  const callVerify = (fn, input) => withInput(fn, input);

  const verifyRaw = (input) => {
    const out = callVerify(ex.verify, input);
    const parsed = JSON.parse(out);
    if (parsed && parsed.kind === "throw") {
      const e = new Error(parsed.message);
      e.name = parsed.type || "Error";
      throw e;
    }
    if (parsed && parsed.kind === "input_error") {
      throw new Error(parsed.message);
    }
    return parsed;
  };

  const canonRaw = (input) => JSON.parse(callVerify(ex.canon, input));

  /** Wrap a provider call into the verifier's witness result shape, mirroring
   * the reference probe's try/catch semantics (throw ⇒ {ok:false, error}). */
  const perform = async (fn, opts) => {
    try {
      const value = await fn(opts);
      return value === undefined ? { ok: true, value: null } : { ok: true, value };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  /**
   * Independently verify a signed intent (SDK-compatible surface, WS-3 §4).
   *
   * @param {object} args
   * @param {object} args.intent            canonical intent (recomputed by WASM)
   * @param {object} args.declaration       signed declaration (recomputed by WASM)
   * @param {object} args.frozenRecord      authoritative frozen DECISION record
   * @param {string} [args.callerBindingRef] reference-only bindingRef (FSR-2)
   * @param {*}      [args.authorityAtState] authority/decision block (GEP-1 decimal string)
   * @param {object} [args.contractAuth]     injected { ethCall, getCode } providers
   *                                          (EIP-1271 transport; WASM binds the
   *                                          response to its own digest+calldata)
   * @param {string} [args.from]             EIP-1271 eth_call caller context ONLY
   * @param {object} [args.evm]              accepted for surface compatibility; the
   *                                          WASM implements EIP-712 digest + secp
   *                                          recovery itself and never calls it
   * @returns {Promise<object>} same envelope shape as verifyBinding
   */
  async function run(args = {}) {
    guardSeam(args);
    const {
      intent,
      declaration,
      frozenRecord,
      callerBindingRef,
      authorityAtState,
      from,
      contractAuth,
    } = args;

    const transportAvailable =
      Boolean(contractAuth) &&
      typeof contractAuth.getCode === "function" &&
      typeof contractAuth.ethCall === "function";

    const base = {
      intent,
      declaration,
      frozenRecord,
      ...(callerBindingRef !== undefined ? { callerBindingRef } : {}),
      ...(authorityAtState !== undefined ? { authorityAtState } : {}),
      ...(from !== undefined ? { from } : {}),
      transport: { available: transportAvailable },
    };

    const step1 = verifyRaw(base);
    if (
      step1 &&
      step1.mode === "needs_witness" &&
      step1.need &&
      step1.need.kind === "getCode"
    ) {
      const r1 = await perform(contractAuth.getCode, {
        address: step1.need.address,
        block: step1.need.block,
      });
      const step2 = verifyRaw({
        ...base,
        witness: { code: { request: step1.need, result: r1 } },
      });
      if (
        step2 &&
        step2.mode === "needs_witness" &&
        step2.need &&
        step2.need.kind === "ethCall"
      ) {
        const ethOpts = {
          to: step2.need.to,
          data: step2.need.data,
          block: step2.need.block,
        };
        if (step2.need.from !== undefined) ethOpts.from = step2.need.from;
        let ethRes;
        try {
          ethRes = await contractAuth.ethCall(ethOpts);
        } catch (e) {
          ethRes = { error: true, message: e && e.message ? e.message : String(e) };
        }
        const r2 =
          ethRes && ethRes.error
            ? { ok: false, error: ethRes.message }
            : { ok: true, response: ethRes };
        return verifyRaw({
          ...base,
          witness: { ethCall: { request: step2.need, result: r2 } },
        });
      }
      return step2;
    }
    return step1;
  }

  return {
    run,
    verifyRaw,
    canonRaw,
    exports: ex,
    artifact: { bytes, size: bytes.length },
  };
}