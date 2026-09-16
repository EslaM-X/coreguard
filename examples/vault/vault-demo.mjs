/**
 * CoreGuard Phase 1 — Reference Vault demo (plan-90d-repo §2.3).
 *
 * Ladder:
 *   node examples/vault/vault-demo.mjs --allow    # legit DEPOSIT → ALLOW → VERIFIED → anchor PLAN
 *   node examples/vault/vault-demo.mjs --attack   # re-runs the SAME setup; six attacks BLOCKED
 *
 * Scenario: "Deposit ≤ 1 BTC · Target = Vault A · Recipient = mine · Slippage ≤ 50bps".
 *
 * Runs entirely offline through the public guard.* surface:
 *   guard.authorize(intent, ctx) → ALLOW | DENY | REQUIRE_REVIEW (firewall)
 *   guard.verify({chain, intent, policy, trace}) → VERIFIED | INVALID
 *   guard.anchor(receipt) → CGEP/1:PROOF commitment + CGEP/1:ANCHOR proofId
 */

import { createIntent } from "../../packages/intent/index.js";
import { createPolicy } from "../../packages/policy/index.js";
import * as EVM from "../../packages/evm/index.js";
import { createGuard } from "../../packages/sdk/index.js";

const guard = createGuard();
const CHAIN = "1116";
const ONE_BTC = "100000000"; // 1 BTC in satoshis (notional vault deposit)
const SLIPPAGE_BPS = 50;
const VAULT_A = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0xcccccccccccccccccccccccccccccccccccccccc";
const ASSET = "0x2222222222222222222222222222222222222222";
const SELECTOR = "0xa9059cbb";

// Deterministic demo signer (the Vault depositor).
const priv = EVM.keccakHex("coreguard vault demo owner key");
const pub = EVM.publicKeyFromPrivateKey(priv);
const MINE = EVM.addressFromPublicKey(pub);

const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };

async function signDeclaration(declaration) {
  const d = { ...declaration };
  delete d.manifestId;
  delete d.signature;
  d.manifestId = await computeManifestIdOf(d);
  const digest = EVM.typedDataDigest("ManifestDeclaration", TYPES, { manifestId: d.manifestId }, d.chainId);
  const sig = await EVM.signDigest(digest, priv);
  d.signature = {
    scheme: "EIP-712",
    signer: d.signerBinding.address,
    ...sig,
    digest: "0x" + Buffer.from(digest).toString("hex"),
  };
  return d;
}

async function computeManifestIdOf(declaration) {
  const { computeManifestId } = await import("../../packages/intent/authorization.js");
  return computeManifestId(declaration);
}

function buildIntent(overrides = {}) {
  return createIntent({
    chainId: CHAIN,
    signer: MINE,
    nonce: "1",
    validAfter: "0",
    validUntil: "86400",
    action: "DEPOSIT",
    target: VAULT_A,
    selector: SELECTOR,
    asset: ASSET,
    amount: ONE_BTC,
    recipient: MINE,
    constraints: [],
    ...overrides,
  });
}

function buildPolicy() {
  return createPolicy({
    policyId: "pol-vault-a",
    name: "CoreLaunch Vault A Policy",
    rules: [
      { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: ONE_BTC }, severity: "CRITICAL" },
      { ruleId: "TARGET_001", type: "TARGET_ALLOWLIST", params: { targets: [VAULT_A] }, severity: "CRITICAL" },
      { ruleId: "RECIPIENT_001", type: "RECIPIENT_ALLOWLIST", params: { addresses: [MINE] }, severity: "CRITICAL" },
      { ruleId: "SELECTOR_001", type: "SELECTOR_ALLOWLIST", params: { selectors: [SELECTOR] }, severity: "CRITICAL" },
      { ruleId: "SLIPPAGE_001", type: "SLIPPAGE_BPS", params: { bps: String(SLIPPAGE_BPS) }, severity: "HIGH" },
    ],
  });
}

function buildSimulation(intent, overrides = {}) {
  return {
    target: VAULT_A,
    selector: SELECTOR,
    recipient: MINE,
    amount: ONE_BTC,
    gasUsed: "70230",
    blockTimestamp: "100",
    slippageBps: "10",
    ...overrides,
  };
}

function encodeTransferCalldata(to, amount) {
  return (
    SELECTOR +
    to.slice(2).padStart(64, "0") +
    BigInt(amount).toString(16).padStart(64, "0")
  );
}

function buildTrace(intent) {
  const calldata = encodeTransferCalldata(intent.recipient, intent.amount);
  return {
    version: "CGEP/1",
    txHash: "0x" + "ab".repeat(32),
    from: MINE,
    to: intent.target,
    value: intent.amount,
    calldata,
    status: "SUCCESS",
    gasUsed: "70230",
    blockNumber: "123456",
    blockHash: "0x" + "cd".repeat(32),
    blockTimestamp: "100",
    calls: [{ depth: 0, from: MINE, to: intent.target, value: "0x0", calldata, returnData: "0x", status: "SUCCESS", gasUsed: "70000" }],
    events: [{ address: intent.target, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"], data: "0x" }],
    balanceChanges: [],
    storageChanges: [],
  };
}

async function signedIntent(overrides = {}) {
  const intent = buildIntent(overrides);
  const declaration = {
    version: "CGEP/1",
    kind: "INTENT_DECLARATION",
    chainId: intent.chainId,
    nonce: String(intent.nonce),
    signerBinding: { address: intent.signer },
    intent,
  };
  return { intent, declaration: await signDeclaration(declaration) };
}

async function authorize(signed, simulation, policy) {
  return guard.authorize(signed.intent, {
    declaration: signed.declaration,
    policy,
    activePolicyIds: [policy.policyId],
    authorityAtState: "11600000",
    simulation,
    writer: "vault-demo",
    evm: EVM,
  });
}

async function allowLadder() {
  const signed = await signedIntent();
  const policy = buildPolicy();
  const simulation = buildSimulation(signed.intent);

  console.log("setup: deposit 1 BTC -> Vault A, recipient = mine, slippage <= 50bps");
  console.log("  signer (mine):   " + MINE);
  console.log("  target (Vault A):" + VAULT_A);
  console.log("  asset:           " + ASSET);
  console.log("  amount:          " + ONE_BTC + " (1 BTC)");

  console.log("\n[1/3] guard.authorize(intent, signed declaration, policy vault-a)");
  const pre = await authorize(signed, simulation, policy);
  console.log("  decision:  " + pre.decision + "  (status=" + pre.status + ")");
  if (pre.decision !== "ALLOW") {
    console.error("expected ALLOW, got " + pre.decision);
    process.exit(1);
  }

  console.log("\n[2/3] guard.verify({ chain, intent, policy, trace })");
  const trace = buildTrace(signed.intent);
  const v = await guard.verify({ chain: CHAIN, intent: signed.intent, policy, trace });
  console.log("  verdict:   " + v.verdict + "  (level=" + v.verificationLevel + ")");
  console.log("  receiptId: " + v.receiptId);
  if (v.verdict !== "VERIFIED") {
    console.error("expected VERIFIED, got " + v.verdict);
    process.exit(1);
  }

  console.log("\n[3/3] guard.anchor(receipt)  ->  on-chain commitment plan (offline)");
  const plan = await guard.anchor(v.receipt);
  console.log("  commitment: " + plan.commitment);
  console.log("  proofId:    " + plan.proofId);

  console.log("\nresult: deposit authorized, execution VERIFIED, anchor planned.");
  console.log("next on-chain: commit proofId on EvidenceRegistry.commitIntent");
}

async function attackLadder() {
  const signed = await signedIntent();
  const policy = buildPolicy();
  const legit = buildSimulation(signed.intent);

  const cases = [];

  // 1. target substitution
  cases.push([
    "target substitution",
    "simulation routes the deposit to an attacker contract",
    await authorize(signed, { ...legit, target: ATTACKER }, policy),
  ]);

  // 2. recipient substitution
  cases.push([
    "recipient substitution",
    "simulation credits the deposit to the attacker's address",
    await authorize(signed, { ...legit, recipient: ATTACKER }, policy),
  ]);

  // 3. amount inflation
  cases.push([
    "amount inflation",
    "simulated deposit doubles to 2 BTC (over the 1 BTC limit)",
    await authorize(signed, { ...legit, amount: String(BigInt(ONE_BTC) * 2n) }, policy),
  ]);

  // 4. expired intent
  cases.push([
    "expired intent",
    "simulation timestamp 90000 > validUntil 86400",
    await authorize(signed, { ...legit, blockTimestamp: "90000" }, policy),
  ]);

  // 5. calldata mutation (PRE: selector does not match the intent)
  cases.push([
    "calldata mutation",
    "simulated selector 0x23b872dd != declared 0xa9059cbb",
    await authorize(signed, { ...legit, selector: "0x23b872dd" }, policy),
  ]);

  // 6. unexpected callback (unmodeled PRE channel)
  cases.push([
    "unexpected callback",
    "simulation carries an unmodeled callback channel (fail-closed)",
    await authorize(signed, { ...legit, callback: ATTACKER }, policy),
  ]);

  console.log("setup: same vault deposit intent; re-running against six attacks");
  console.log("  attacker:        " + ATTACKER);
  console.log("  target (Vault A):" + VAULT_A);
  console.log("");
  console.log("attack                              guard decision      outcome");
  console.log("----------------------------------------------------------------");

  let blocked = 0;
  for (const [name, detail, res] of cases) {
    const guarded = res.decision === "DENY";
    blocked += guarded ? 1 : 0;
    console.log(
      (name + " ".repeat(35)).slice(0, 35) +
        (String(res.decision) + " ".repeat(7)).slice(0, 16) +
        (guarded ? "[BLOCKED]" : "[FAILED-FAIL-CLOSED]")
    );
    void detail;
  }

  console.log("\npost-execution: mutated calldata (attacker calldata) does NOT verify");
  const mutatedTrace = { ...buildTrace(signed.intent), calldata: encodeTransferCalldata(ATTACKER, ONE_BTC) };
  const v = await guard.verify({ chain: CHAIN, intent: signed.intent, policy, trace: mutatedTrace });
  const postBlocked = v.verdict === "INVALID";
  blocked += postBlocked ? 1 : 0;
  console.log("  guard.verify on mutated trace -> verdict=" + v.verdict);

  console.log("");
  console.log("result: " + blocked + "/7 blocked (6 PRE + 1 POST).");
  process.exit(blocked === 7 ? 0 : 1);
}

const mode = process.argv.includes("--attack") ? "attack" : "allow";
if (mode === "attack") {
  await attackLadder();
} else {
  await allowLadder();
}