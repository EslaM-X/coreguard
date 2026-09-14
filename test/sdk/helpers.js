/**
 * WS-2 — SDK test fixtures.
 *
 * Builds production-identical frozen DECISION records (via the Firewall's own
 * freezeDecisionRecord) and EOA / EIP-1271 authorization fixtures, then runs
 * verifyBinding against them. The SDK code itself never touches the Firewall;
 * the fixtures construct the record exactly as the Firewall would so the
 * content-addressing is exercised against the real convention.
 */

import * as EVM from "../../packages/evm/index.js";
import {
  computeIntentRef,
  computeManifestId,
  computeBindingRef,
  scopeOfIntent,
} from "../../packages/intent/authorization.js";
import { freezeDecisionRecord, DECISION_RECORD_VERSION } from "../../packages/firewall/decision-record.js";
import { computeDeclarationId } from "../../packages/firewall/binding.js";
import { verifyBinding } from "../../packages/sdk/index.js";
import {
  makeIntent,
  makeDeclaration,
  signDeclaration,
  seedKey,
  makeAddress,
} from "../firewall/helpers.js";
import {
  providersFor,
  contractDeclaration,
  CONTRACT_ADDR,
} from "../firewall/attack-lab/helpers.js";

export { EVM, CONTRACT_ADDR, makeAddress };

const WRONG_MAGIC = "0xffffffff" + "00".repeat(28);

/** Build a frozen DECISION record consistent with the pair (content-addressed
 * exactly like production; `overrides` are patched into the body BEFORE
 * freezing, so a tampered scope still yields a canonically valid ref). */
export async function decisionRecordFor({ intent, declaration, ...overrides }) {
  const intentRef = await computeIntentRef(intent);
  const manifestId = await computeManifestId(declaration);
  const bindingRef = await computeBindingRef({ intentRef, manifestId, signature: declaration.signature });
  const body = {
    version: DECISION_RECORD_VERSION,
    kind: "DECISION",
    decision: "ALLOW",
    reason: null,
    writer: "W2-fixture",
    chainId: String(intent.chainId || ""),
    nonce: String(intent.nonce ?? ""),
    decisionBlock: "1024",
    blockTimestamp: "1",
    policy: { policyId: "pol-default", policyHash: null, label: null },
    authorityInputs: { path: "EOA", atState: "1024", status: "OK", label: "RECOVERED_SIGNER", reason: null },
    binding: { intentRef, manifestId, bindingRef, executionScope: scopeOfIntent(intent) },
    simSummary: null,
    simConsistent: true,
    unmodelable: false,
    reviewObligation: false,
    reviewPathConfigured: false,
    ...overrides,
  };
  const { record, decisionRef } = await freezeDecisionRecord(body);
  return { record, decisionRef };
}

/** EOA authorization fixture + frozen record, ready for verifyBinding. */
export async function eoaArgs(overrides = {}) {
  const intent = makeIntent(overrides.intent || {});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), overrides.signWith ?? seedKey(1).priv);
  const { record } = await decisionRecordFor({ intent, declaration, ...(overrides.record || {}) });
  return {
    intent,
    declaration,
    frozenRecord: record,
    authorityAtState: overrides.authorityAtState ?? "1024",
    evm: overrides.evm !== undefined ? overrides.evm : EVM,
    ...(overrides.rest || {}),
  };
}

/** EIP-1271 authorization fixture + frozen record. */
export async function contractArgs(overrides = {}) {
  const { intent, declaration } = await contractDeclaration();
  const { record } = await decisionRecordFor({ intent, declaration, ...(overrides.record || {}) });
  const manifestId = await computeDeclarationId(declaration);
  return {
    intent,
    declaration,
    frozenRecord: record,
    authorityAtState: overrides.authorityAtState ?? "1024",
    evm: EVM,
    contractAuth: overrides.contractAuth ?? providersFor(declaration.chainId, manifestId),
    ...(overrides.rest || {}),
  };
}

export async function verifyEOA(extra = {}) {
  return verifyBinding({ ...(await eoaArgs()), ...extra });
}

export async function verifyContract(extra = {}) {
  return verifyBinding({ ...(await contractArgs()), ...extra });
}

/** Provider whose eth_call returns magic ONLY at a pinned block (else wrong). */
export function statePinnedProviders(acceptChain, manifestId, atBlock) {
  const base = providersFor(acceptChain, manifestId);
  return {
    ethCall: async (opts) => {
      if (!opts.block || String(opts.block) !== String(atBlock)) {
        return { ok: true, data: WRONG_MAGIC };
      }
      return base.ethCall(opts);
    },
    getCode: base.getCode,
  };
}

/** Provider whose eth_call returns magic ONLY when the caller context matches. */
export function callerContextProviders(acceptChain, manifestId, caller) {
  const base = providersFor(acceptChain, manifestId);
  return {
    ethCall: async (opts) => {
      const from = opts.from !== undefined ? String(opts.from).toLowerCase() : "";
      if (from === String(caller).toLowerCase()) return base.ethCall(opts);
      return { ok: true, data: WRONG_MAGIC };
    },
    getCode: base.getCode,
  };
}

/** Flip a hex char so a reference cannot accidentally match the recomputed. */
export function flipRef(ref) {
  const b = ref.endsWith("a") ? "b" : "a";
  return ref.slice(0, -1) + b;
}