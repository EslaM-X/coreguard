/**
 * CoreGuard — Verifier C: ESM transport/marshalling wrapper around the
 * stdlib-only Python re-derivation (Verifier B mirror, Dec-C-*).
 *
 * DESIGN BOUNDARY: this file is transport AND MARSHALLING ONLY. It spawns the
 * Python bridge, moves JSON text across newline-delimited protocol messages,
 * drives the EIP-1271 witness read steps the pipeline cannot do alone (I/O
 * via an injected transport bound to the verifier's own digest+calldata), and
 * rejects post-execution evidence at the pre-execution seam (Q-W3-6/Q-FW10) —
 * an exact mirror of Verifier B's index.js (Q-W3-3 boundary).
 *
 * The Python side is a self-contained stdlib-only package; nothing here
 * canonicalizes, hashes, recovers a signer, or evaluates any protocol fact
 * itself. The wrapper pins the interpreter version and the verifier source
 * checksums against METADATA.json as REPRODUCIBILITY METADATA ONLY (Dec-C-9 —
 * not a cryptographic attestation of the interpreter/runtime itself).
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Post-execution evidence — structurally refused at the pre-execution seam
 * (Q-W3-6 / Q-FW10), an exact mirror of Verifier B's internal refusal list. */
export const EXECUTION_EVIDENCE_KEYS = Object.freeze([
  "executionRef",
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionBlock",
  "txHash",
  "receipt",
]);

export const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));

function guardSeam(input) {
  if (!input || typeof input !== "object") return;
  const present = EXECUTION_EVIDENCE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(input, k));
  if (present.length > 0) {
    throw new TypeError(
      `verifier-c: pre-execution verification must NOT receive post-execution evidence (${present.join(", ")}) — Q-W3-6/Q-FW10 seam`
    );
  }
}

/** Load the METADATA.json reproducibility record (best-effort; see Dec-C-9). */
function loadMetadata() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "METADATA.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Load the bridge-backed Verifier C (one persistent Python process). */
export async function loadVerifierC({ pythonPath = process.env.PYTHON ?? "python" } = {}) {
  const metadata = loadMetadata();
  const child = spawn(pythonPath, [join(PACKAGE_ROOT, "bridge.py"), "--bridge"], {
    cwd: PACKAGE_ROOT,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buf = "";
  let pending = null;
  let stderr = "";
  let exited = false;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (pending) {
        const p = pending;
        pending = null;
        p.resolve(JSON.parse(line));
      }
    }
  });
  child.on("error", (err) => {
    exited = true;
    if (pending) {
      pending.reject(err);
      pending = null;
    }
  });
  child.on("exit", (code) => {
    exited = true;
    if (pending) {
      pending.reject(new Error(`verifier-c: bridge exited (${code}): ${stderr.trim()}`));
      pending = null;
    }
  });

  const request = (obj) => {
    if (exited || !child.stdin.writable) {
      return Promise.reject(new Error(`verifier-c: bridge not available (${stderr.trim()})`));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending) {
          pending = null;
          reject(new Error("verifier-c: bridge request timeout"));
        }
      }, 30000);
      pending = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      child.stdin.write(JSON.stringify(obj) + "\n");
    });
  };

  const callOp = async (op, input) => {
    const rep = await request({ op, input });
    if (!rep || rep.ok !== true) {
      throw new Error((rep && rep.error) || "verifier-c: bridge error");
    }
    return rep;
  };

  const hello = await callOp("hello");

  if (!/^3\.14\./.test(hello.python)) {
    throw new Error(
      `verifier-c: python version pin violation (Dec-C-9): got ${hello.python}, expected ^3.14`
    );
  }
  if (metadata) {
    const expected = metadata.sources || {};
    const got = hello.sources || {};
    for (const file of Object.keys(expected)) {
      if (got[file] !== expected[file]) {
        throw new Error(
          `verifier-c: source checksum mismatch (Dec-C-9) for ${file}: got ${got[file]}, expected ${expected[file]}`
        );
      }
    }
  }

  const withInput = async (op, input) => {
    const json = JSON.stringify(input);
    const rep = await callOp(op, json);
    return rep.out;
  };

  const verifyRaw = async (input) => {
    const out = await withInput("verify", input);
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

  const canonRaw = async (input) => JSON.parse(await withInput("canon", input));

  const perform = async (fn, opts) => {
    try {
      const value = await fn(opts);
      return value === undefined ? { ok: true, value: null } : { ok: true, value };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  /**
   * Independently verify a signed intent (SDK-compatible surface — byte-for-byte
   * mirror of Verifier B's run(), transport bound to injected providers).
   *
   * @param {object} args
   * @param {object} args.intent            canonical intent (recomputed by pipeline)
   * @param {object} args.declaration       signed declaration (recomputed by pipeline)
   * @param {object} args.frozenRecord      authoritative frozen DECISION record
   * @param {string} [args.callerBindingRef] reference-only bindingRef (FSR-2)
   * @param {*}      [args.authorityAtState] authority/decision block (GEP-1 decimal string)
   * @param {object} [args.contractAuth]     injected { ethCall, getCode } providers
   *                                          (EIP-1271 transport; the pipeline binds the
   *                                          response to its own digest+calldata)
   * @param {string} [args.from]             EIP-1271 eth_call caller context ONLY
   * @param {object} [args.evm]              accepted for surface compatibility; the
   *                                          pipeline implements EIP-712 digest + secp
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

    const step1 = await verifyRaw(base);
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
      const step2 = await verifyRaw({
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

  /** Close the bridge process (exit on stdin EOF). */
  const close = async () => {
    try {
      if (child.stdin.writable) child.stdin.end();
    } catch {
      /* already gone */
    }
  };

  return {
    run,
    verifyRaw,
    canonRaw,
    close,
    metadata: hello,
    artifact: { kind: "python-bridge", python: hello.python },
  };
}