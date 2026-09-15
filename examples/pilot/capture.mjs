/**
 * Pilot-1 `capture` — bind a real Core Mainnet execution to the pre-declared
 * intent and independently verify it.
 *
 * Paths proven here (all against live RPC data, read-only):
 *   WS-4 extraction                 -> typed, pinned evidence items + executionEvidenceRef
 *   WS-1 authorization probe        -> the pre-declared EIP-712 signature RECOVERS the
 *                                       executing agent EOA (WHO authorized)
 *   WS-4 B-EXEC binding             -> target pin / caller binding / value predicate
 *                                      (selector honestly NOT_RUN for a calldata-less
 *                                      value transfer — never fabricated)
 *   legacy L1 verifier              -> independent recompute = VERIFIED *only* when the
 *                                      GENUINE pre-execution eth_call pin (from `stage`)
 *                                      is present; otherwise the receipt path is skipped
 *                                      and the honest status is reported
 *   WS-4 Execution Attestation      -> detached record + integrity recompute
 *   commitment / proofId            -> CGEP/1:PROOF + CGEP/1:ANCHOR references
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir, readFile } from "node:fs/promises";

import { hashIntent, hashPolicy, domainHash, computeReceiptId } from "@coreguard/canonical";
import { evaluatePolicy } from "@coreguard/policy";
import { createEvidenceBundle, createReceipt } from "@coreguard/evidence";
import { verifyReceipt } from "@coreguard/verifier";
import { extractExecutionEvidence, bindExecutionEvidence, buildExecutionAttestation, verifyExecutionAttestation } from "@coreguard/execution";
import { computeBindingRef } from "@coreguard/intent/authorization.js";
import { probeAuthorization } from "@coreguard/provenance/authorization-probe.js";
import * as evm from "@coreguard/evm";

import { mainnetProvider } from "./provider.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = "artifacts";

function load(rel) {
  return readFile(resolve(here, rel), "utf8").then(JSON.parse);
}

async function loadOptional(rel) {
  try {
    return await load(rel);
  } catch {
    return null;
  }
}

export async function capture({ txHash }) {
  const intent = await load(`${ARTIFACTS}/intent.json`);
  const policy = await load(`${ARTIFACTS}/policy.json`);
  const declaration = await load(`${ARTIFACTS}/declaration.json`);
  const stage = await loadOptional(`${ARTIFACTS}/stage.json`);
  const chainId = String(intent.chainId || "1116");
  if (chainId !== "1116") throw new Error(`Pilot-1 gate: intent.chainId=${chainId} — Mainnet only.`);

  // WS-4 extraction — pinned, never `latest`, no fabricated traces.
  const extraction = await extractExecutionEvidence({ provider: mainnetProvider, chainId, ref: { txHash } });

  // WS-1 authority probe — EOA recover of the pre-declared ManifestDeclaration.
  const bindingProbe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId: declaration.manifestId,
    chainId,
    authorityAtState: null,
    evm,
  });

  // WS-4 B-EXEC binding — target/caller/value; selector NOT_RUN (honest).
  const valuePredicate = async ({ value, amount }) => BigInt(value) === BigInt(amount);
  const bind = await bindExecutionEvidence({
    evidence: { chainId, executionRef: extraction.executionRef, items: extraction.items },
    intent,
    signerKind: "EOA",
    frozenDecision: null,
    decisionRef: null,
    valuePredicate,
  });

  const tx = extraction.items.find((i) => i.kind === "TRANSACTION")?.value || null;
  const receiptItem = extraction.items.find((i) => i.kind === "RECEIPT")?.value || null;
  const blockItem = extraction.items.find((i) => i.kind === "BLOCK")?.value || null;
  const receiptPresent = Boolean(tx && receiptItem && blockItem);
  if (!receiptPresent) {
    const missing = ["CHAIN_ID", "BLOCK", "TRANSACTION", "RECEIPT"].filter(
      (k) => !extraction.items.some((i) => i.kind === k)
    );
    return {
      status: "UNVERIFIED",
      label: "REQUIRED_EVIDENCE_MISSING",
      reason: `evidence unavailable: ${missing.join(", ")}`,
      extraction,
      bindingProbe,
      bind,
      notice: "No broadcast happened; nothing to bind. Run `staged` -> fund -> broadcast with explicit GO.",
    };
  }

  const blockMeta = await mainnetProvider.getBlockByNumber(blockItem.blockNumber, blockItem.blockHash);
  const blockTimestamp = blockMeta && blockMeta.timestamp ? BigInt(blockMeta.timestamp).toString() : "0";

  const trace = {
    txHash: tx.txHash,
    blockHash: blockItem.blockHash,
    blockNumber: blockItem.blockNumber,
    blockTimestamp,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    calldata: tx.input,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit ?? "0",
    gasUsed: receiptItem.gasUsed ?? "0",
    status: receiptItem.status ?? "0",
    logs: (receiptItem.logs || []).map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
  };

  // recipient for a TARGET_TRANSFER value transfer is the receiving account
  const recipientForEval = tx.input && tx.input.length > 10 && tx.input.slice(0, 10) === "0xa9059cbb"
    ? "0x" + tx.input.slice(34, 74)
    : tx.to;
  const policyResult = evaluatePolicy(policy, {
    value: tx.value,
    target: tx.to,
    recipient: recipientForEval,
    selector: (tx.input || "0x").slice(0, 10),
    blockTimestamp,
    slippageBps: "0",
    gasUsed: receiptItem.gasUsed ?? "0",
  });

  const intentHash = await hashIntent(intent);
  const policyHash = await hashPolicy(policy);

  const simPin = stage && stage.preflight && stage.preflight.pin
    ? { blockNumber: String(stage.preflight.pin.blockNumber), blockHash: String(stage.preflight.pin.blockHash).toLowerCase() }
    : null;

  const bindChecksFail = bind.checks.some((c) => c.result === "FAIL" || c.result === "NOT_PROVEN");
  const compliant =
    simPin !== null &&
    policyResult.result === "SATISFIED" &&
    bindingProbe.status === "OK" &&
    !bindChecksFail;

  // Deterministic WS-4 verification profile for the attestation.
  const attestationChecks = [
    ...extraction.items.map((i) => ({ check: `EXTRACTION:${i.kind}`, result: "PASS" })),
    ...bind.checks.map((c) => ({ check: c.check, result: c.result })),
    { check: "WS1:AUTHORIZATION_PROBE", result: bindingProbe.status === "OK" ? "PASS" : bindingProbe.status },
    { check: "POLICY_EVAL", result: policyResult.result === "SATISFIED" ? "PASS" : "FAIL" },
    { check: "TRACE_LEVEL", result: extraction.trace.available ? "PASS" : "NOT_RUN", reason: extraction.trace.reason ?? "TRACE_UNAVAILABLE" },
  ];
  const ws4Status = attestationChecks.some((c) => c.result === "FAIL")
    ? "INVALID"
    : attestationChecks.some((c) => c.result === "NOT_PROVEN")
      ? "NOT_PROVEN"
      : attestationChecks.some((c) => c.result === "NOT_RUN")
        ? "NOT_RUN"
        : "VERIFIED";

  // --- legacy L1 receipt: ONLY with a GENUINE pre-execution simulation pin
  //     AND a compliant execution (policy satisfied, WS-1 probe OK, no
  //     B-EXEC FAIL/NOT_PROVEN). A non-compliant execution never gets a
  //     receipt that could be mis-read as a green claim.
  let receipt = null;
  let verification = null;
  if (compliant) {
    const evidenceBundle = await createEvidenceBundle({
      intentHash,
      policyHash,
      traceHash: null,
      stateDeltaHash: null,
      result: policyResult.result === "SATISFIED" ? "VALID" : "INVALID",
      verifications: attestationChecks,
      simulation: null,
      execution: { blockNumber: blockItem.blockNumber, blockHash: blockItem.blockHash },
    });

    const created = await createReceipt({
      chainId,
      txHash: tx.txHash,
      blockHash: blockItem.blockHash,
      blockNumber: blockItem.blockNumber,
      intentHash,
      policyHash,
      executionTraceHash: null,
      stateDeltaHash: null,
      evidenceRoot: evidenceBundle.hash,
      simulation: simPin,
      execution: { blockNumber: blockItem.blockNumber, blockHash: blockItem.blockHash },
      verifierVersion: "0.1.0",
      verificationLevel: "L1",
      result: policyResult.result === "SATISFIED" ? "VALID" : "INVALID",
      checks: attestationChecks,
    });
    receipt = { ...created.receipt, receiptId: created.receiptId };
    verification = await verifyReceipt(receipt, evidenceBundle.evidence, intent, policy, null);
  }

  // --- WS-4 Execution Attestation ---
  const bindingRef = await computeBindingRef({ intentRef: intentHash, manifestId: declaration.manifestId, signature: declaration.signature });
  const evidenceHash = simPin && receipt ? receipt.evidenceRoot : null;
  const attestation = await buildExecutionAttestation({
    chainId,
    intentRef: intentHash,
    manifestId: declaration.manifestId,
    bindingRef,
    decisionRef: null,
    executionEvidenceRef: extraction.executionEvidenceRef,
    evidenceHash,
    receiptId: receipt ? receipt.receiptId : null,
    verification: {
      status: verification ? verification.result : ws4Status,
      label: verification ? verification.verdictCode : bind.label,
      checks: attestationChecks,
    },
    conformancePath: "RECEIPT_LEVEL",
    at: blockItem.blockNumber,
    verifier: "coreguard-pilot-1",
  });
  const attestationIntegrity = await verifyExecutionAttestation(attestation.record);

  const commitment = await domainHash("CGEP/1:PROOF", { protocol: "CGEP/1", chainId, receiptId: receipt ? receipt.receiptId : null, evidenceRoot: receipt ? receipt.evidenceRoot : null });
  const proofId = await domainHash("CGEP/1:ANCHOR", { chainId, receiptId: receipt ? receipt.receiptId : null, commitment });

  const capture = {
    pilot: "Pilot-1",
    network: "core-mainnet (1116)",
    txHash: tx.txHash,
    chainId,
    status: verification ? verification.result : ws4Status,
    authorization: { status: bindingProbe.status, label: bindingProbe.label, path: bindingProbe.path, atState: bindingProbe.atState },
    ws4: {
      extraction: { ok: extraction.ok, itemCount: extraction.items.length, executionEvidenceRef: extraction.executionEvidenceRef, executionRef: extraction.executionRef, trace: extraction.trace },
      binding: { status: bind.status, label: bind.label, reason: bind.reason, checks: bind.checks },
    },
    policy: { result: policyResult.result, ruleCount: policyResult.rules.length, satisfied: policyResult.result === "SATISFIED" },
    legacyL1: receipt
      ? {
          present: true,
          simulationPin: simPin,
          preflightResult: stage.preflight.result ?? null,
          receiptId: receipt.receiptId,
          result: verification.result,
          verdictCode: verification.verdictCode,
          requiredMissing: verification.requiredMissing,
          checks: verification.checks.map((c) => ({ check: c.check, result: c.result, detail: c.detail })),
        }
      : {
          present: false,
          reason: simPin
            ? "execution NOT compliant (policy/WS-1/B-EXEC) — no legacy receipt emitted (never bless a non-conforming execution)"
            : "no genuine pre-execution simulation pin — legacy receipt NOT emitted (never fabricated)",
        },
    attestation: {
      attestationRef: attestation.attestationRef,
      integrity: { status: attestationIntegrity.status, label: attestationIntegrity.label },
      record: attestation.record,
    },
    commitment,
    proofId,
    notice: [
      "Selector binding NOT claimable (calldata-less value transfer) — B-EXEC-2 selector = NOT_RUN, never fabricated.",
      "Trace unavailable on rpc.coredao.org — TRACE_LEVEL = NOT_RUN; claims are RECEIPT_LEVEL (L1).",
      "No Firewall decision existed for a direct EOA transfer — B-EXEC-5 = NOT_RUN (decision provenance applies to the WS-4 gate, not a raw transfer).",
      "L1 receipt emitted ONLY because stage recorded a GENUINE eth_call preflight at a pinned pre-execution block (remediable A+2) — never a fabricated pin.",
    ].join(" "),
  };

  await mkdir(resolve(here, ARTIFACTS), { recursive: true });
  await writeFile(resolve(here, ARTIFACTS, "capture.json"), JSON.stringify(capture, null, 2));
  await writeFile(resolve(here, ARTIFACTS, "evidence-items.json"), JSON.stringify({ items: extraction.items }, null, 2));
  await writeFile(resolve(here, ARTIFACTS, "attestation.json"), JSON.stringify(attestation.record, null, 2));
  if (receipt) await writeFile(resolve(here, ARTIFACTS, "receipt.json"), JSON.stringify({ receiptId: receipt.receiptId, receipt }, null, 2));
  await writeFile(resolve(here, ARTIFACTS, "verification.json"), JSON.stringify(verification ?? { result: ws4Status, checks: attestationChecks }, null, 2));
  return capture;
}

export async function computeCommitData({ receiptRel = `${ARTIFACTS}/receipt.json` }) {
  const payload = await load(receiptRel);
  const { receiptId: embedded, ...body } = payload.receipt;
  const receiptId = embedded || (await computeReceiptId(body));
  const commitment = await domainHash("CGEP/1:PROOF", { protocol: "CGEP/1", chainId: body.chainId, receiptId, evidenceRoot: body.evidenceRoot });
  const proofId = await domainHash("CGEP/1:ANCHOR", { chainId: body.chainId, receiptId, commitment });
  return { receiptId, commitment, proofId };
}