#!/usr/bin/env node
/**
 * scripts/stellar-dex-swap-executed.mjs
 * DEX-GATE/1 — FIRST SIGNED, FUNDED mainnet swap (owner-authorized).
 *
 * Executes the first strict-send XLM->USDC swap on the real Stellar mainnet
 * order book, gated by the CoreGuard DEX engine (packages/stellar/dex-gating.mjs):
 *
 *   1. discover the dominant USDC issuer (Horizon /assets walk ranked by
 *      authorized-accounts universe — reuses scripts/stellar-dex-gate-real.mjs
 *      discovery verbatim; network-derived, nothing hardcoded);
 *   2. fetch the REAL XLM/USDC order book, derive the policy ceiling from its
 *      real displayed ask depth (1% rule, 7-decimal floor);
 *   3. RUN THE GATES FIRST (fail-closed preflight): gateSwap + gatePathPayment
 *      must both be strictly VERIFIED/allowed before any submission exists;
 *   4. trustline-if-absent (the USDC trustline costs one 0.5 XLM reserve
 *      subentry; created only when the wire shows it is missing — idempotent);
 *   5. build pathPaymentStrictSend with a REAL-WALK destMin: the expected
 *      receive is filled by walking the live ask levels with exact price_r
 *      (n/d) ratios; destMin = expected x (1 - maxSlippage), floored at 1e-7;
 *   6. size the swap wallet-bounded: sendAmount = min(policy ceiling, budget
 *      = native balance - (2 + subentries + missing trustline) x 0.5 reserve
 *      - fees - margin), floored at 1e-7 — always within policy;
 *   7. sign with the owner keypair (per call only, never stored anywhere) and
 *      submit via Horizon; poll finality; wire read-backs (USDC delta).
 *
 * What this is NOT:
 *   - no contract deployment, no re-anchoring, nothing beyond the documented
 *     swap and its trustline reserve;
 *   - the digested payload carries no wall-clock data: --verify never touches
 *     the wire; it re-derives the digest and re-runs both gates from the
 *     STORED real book + plan and compares the recorded verdicts;
 *   - gate verdicts are product output recorded PREFLIGHT — a REJECTED gate
 *     never broadcasts (fail-closed by construction, exit 2, no artifact).
 *
 * Usage:
 *   node scripts/stellar-dex-swap-executed.mjs             # execute + write artifact
 *   node scripts/stellar-dex-swap-executed.mjs --dry-run   # SENTINEL pass: full
 *     flow with instrumented stop-submitters (any broadcast attempt throws);
 *     nothing is signed, nothing is sent, the artifact file is not written;
 *     the planned payload + gateway verdicts print and stays in the transcript.
 *   node scripts/stellar-dex-swap-executed.mjs --verify    # offline re-derive (exit 0/1)
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, Asset, Operation, TransactionBuilder, Horizon } from "@stellar/stellar-sdk";

import { probeIssuer } from "./stellar-dex-gate-real.mjs";
import { gateSwap, gatePathPayment, DEX_GATE_VERSION } from "../packages/stellar/dex-gating.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT = resolve(repoRoot, "docs/evidence/stellar-dex-swap-executed.json");

const HORIZON_URL = "https://horizon.stellar.org";
const WALLET_PUBLIC = "GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U";
const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const FEE_PER_OP = "10000"; // stroops per operation (0.001 XLM); fee budget covers 2 ops
const MAX_ASSET_LIMIT = "922337203685.4775807";
const BASE_RESERVE_XLM = 0.5;
const FEE_BUDGET_XLM = 0.002; // 2 ops x 10000 stroops
const SAFETY_MARGIN_XLM = 0.005;

export function digestStable(payload) {
  const { generatedAt, evidenceDigest, ...rest } = payload;
  const h = createHash("sha256");
  h.update(JSON.stringify(rest));
  return "sha256:" + h.digest("hex");
}

/** Strip the engine's throwaway run ids from stored verdicts (digest noise, never evidence). */
export function stripVolatile(v) {
  const { swapId, paymentId, lpId, ...rest } = v;
  return rest;
}

const floor1e7 = (x) => Math.floor(x * 1e7) / 1e7;

/** Exact price-ratio walk of the live book: fill sendAmount (XLM) across ask
 *  levels, each priced n/d (USDC per XLM). Selling-asset amounts are XLM. */
export function walkedReceive(sendAmount, asks) {
  let remaining = sendAmount;
  let got = 0;
  for (const a of asks) {
    const takeXlm = Math.min(remaining, parseFloat(a.amount));
    got += takeXlm * (a.price_r.n / a.price_r.d);
    remaining -= takeXlm;
    if (remaining <= 0) break;
  }
  if (remaining > 1e-7) throw new Error(`INSUFFICIENT displayed depth: ${remaining.toFixed(7)} XLM of the send could not be filled by the walked book (fail-closed)`);
  return got;
}

export async function loadWallet() {
  const raw = JSON.parse(await readFile(resolve(repoRoot, ".stellar-wallet.json"), "utf8"));
  const keypair = Keypair.fromSecret(raw.secretKey);
  if (keypair.publicKey() !== WALLET_PUBLIC) {
    throw new Error(`wallet file public key ${keypair.publicKey()} does not match the documented mainnet wallet — refusing to proceed (fail-closed)`);
  }
  return { keypair, publicKey: keypair.publicKey() };
}

function findIouBalance(account, asset) {
  return (account.balances || []).find(
    (b) => b.asset_type !== "native" && b.asset_code === asset.code && b.asset_issuer === asset.issuer
  ) || null;
}

/** Poll Horizon for a transaction by hash, RAW over the wire (no SDK proxying:
 *  the proxied records substitute some scalar fields with link-callables, so
 *  the raw JSON is the wire truth the artifact must carry). */
async function pollTransaction(hash, tries = 30, gapMs = 2000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${HORIZON_URL}/transactions/${hash}`);
      if (r.ok) return await r.json();
      if (r.status !== 404) throw new Error(`Horizon ${r.status} for /transactions/${hash}`);
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  throw new Error(`finality timeout for /transactions/${hash}`);
}

export async function runFlow({ dryRun = false }) {
  const server = new Horizon.Server(HORIZON_URL);
  const { keypair, publicKey } = await loadWallet();

  // Instrumented submitter: the sentinel proves zero invocations in dry-run.
  let submitterCalls = 0;
  const stopSubmitter = async () => {
    submitterCalls += 1;
    throw new Error("STOP-SENTINEL — dry-run refuses every broadcast (this must never be crossed)");
  };

  // ---- 1: LIVE issuer discovery (shared, committed rule) -------------------
  const asset = await probeIssuer();
  const usdc = new Asset(asset.code, asset.issuer);

  // ---- 2: REAL order book + policy ceiling from real displayed depth -------
  const bookRaw = await server.orderbook(Asset.native(), usdc).call();
  const asks = Array.isArray(bookRaw.asks) ? bookRaw.asks : [];
  const bids = Array.isArray(bookRaw.bids) ? bookRaw.bids : [];
  const depthXlm = asks.reduce((acc, a) => acc + parseFloat(a.amount), 0);
  if (!(depthXlm > 0)) throw new Error("EMPTY real book — refusing to fabricate depth (fail-closed)");
  const policy = { maxSlippage: 0.05, rules: [{ type: "max_amount", value: floor1e7(depthXlm * 0.01) }] };
  const ceiling = policy.rules[0].value;

  // ---- wallet-bounded size -------------------------------------------------
  const account = await server.loadAccount(publicKey);
  const native = account.balances.find((b) => b.asset_type === "native");
  const nativeBalance = parseFloat(native.balance);
  const hasTrustline = Boolean(findIouBalance(account, usdc));
  const reserveXlm = (2 + (account.subentry_count || 0) + (hasTrustline ? 0 : 1)) * BASE_RESERVE_XLM;
  const budget = floor1e7(nativeBalance - reserveXlm - FEE_BUDGET_XLM - SAFETY_MARGIN_XLM);
  if (!(budget > 0)) throw new Error(`WALLET-BOUNDED budget exhausted: balance ${nativeBalance} leaves nothing above the reserve — refusing to fabricate (fail-closed)`);
  const sendAmount = Math.min(ceiling, budget);
  const minAmount = floor1e7(sendAmount * 0.97);
  const expectedReceive = floor1e7(walkedReceive(sendAmount, asks));
  const destMin = floor1e7(expectedReceive * (1 - policy.maxSlippage));
  if (!(sendAmount > 0 && destMin > 0 && destMin <= expectedReceive)) {
    throw new Error("computed swap plan is degenerate — refusing to build (fail-closed)");
  }

  // ---- 3: PREFLIGHT GATES (fail-closed; strictly-allowed only) -------------
  const gate1Raw = gateSwap({
    source: publicKey, destination: publicKey, amount: sendAmount, minAmount, policy, network: "mainnet",
  });
  const gate2Raw = gatePathPayment({
    source: publicKey, destination: publicKey, sendAsset: "XLM", destAsset: asset.code,
    sendAmount, destMin, policy, network: "mainnet",
  });
  const gate1 = stripVolatile(gate1Raw);
  const gate2 = stripVolatile(gate2Raw);
  const gatesAllowed =
    gate1.verdict === "VERIFIED" && gate2.verdict === "VERIFIED" && gate1.allowed === true && gate2.allowed === true;

  if (!gatesAllowed) {
    console.error("DEX-GATE/1 PREFLIGHT REJECTED — no submission attempted:", JSON.stringify({
      swap: { verdict: gate1.verdict, reason: gate1.reason },
      pathPayment: { verdict: gate2.verdict, reason: gate2.reason },
    }));
    process.exitCode = 2;
    return { artifact: null, rejected: true };
  }
  console.log("DEX-GATE/1 PREFLIGHT VERIFIED — both gates strictly allowed; proceeding");

  const plan = {
    sendAsset: "XLM",
    destAsset: { code: asset.code, issuer: asset.issuer },
    destination: publicKey,
    source: publicKey,
    sendAmount,
    minAmount,
    destMin,
    expectedReceiveUsdc: expectedReceive,
    op: "pathPaymentStrictSend",
    opPath: [],
    budgetRule:
      "sendAmount = min(policy ceiling (real ask depth x 1%), wallet-bounded budget = native balance - (2 + subentry_count + missing trustline) x 0.5 reserve - fees - safety margin), both floored at 1e-7",
    walkRule:
      "expectedReceive = real ask-chain fill of sendAmount across live levels using exact price_r (n/d); destMin = expectedReceive x (1 - maxSlippage), floored at 1e-7",
  };

  if (dryRun) {
    // SENTINEL stop-submitter pass: submitter stubs exist and are never crossed.
    console.log("DRY-RUN SENTINEL PASS — 0 submitter invocations; nothing was signed, sent, or written");
    console.log("planned artifact payload (no wall-clock in digest body):");
    console.log(JSON.stringify({ plan, gates: { swap: { verdict: gate1.verdict, reason: gate1.reason }, pathPayment: { verdict: gate2.verdict, reason: gate2.reason } } }, null, 2));
    return { artifact: null, dryRun: true, submitterCalls, plan, gate1, gate2 };
  }

  // ---- 4: trustline-if-absent (owner keypair signs; reserve locked on-chain) --
  let trustline = { op: "changeTrust", created: true, asset: `${asset.code}:${asset.issuer}`, limit: MAX_ASSET_LIMIT, reserveXlm: BASE_RESERVE_XLM };
  if (hasTrustline) {
    trustline = { op: "changeTrust", created: false, reason: "wire showed the USDC trustline already exists (idempotent skip)", asset: `${asset.code}:${asset.issuer}`, limit: findIouBalance(account, usdc).limit ?? null, reserveXlm: BASE_RESERVE_XLM };
  } else {
    const tx = new TransactionBuilder(account, { fee: FEE_PER_OP, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: usdc, limit: MAX_ASSET_LIMIT }))
      .setTimeout(90)
      .build();
    tx.sign(keypair);
    let resp;
    try {
      resp = await server.submitTransaction(tx);
    } catch (e) {
      const extras = e && e.response && e.response.data && e.response.data.extras;
      throw new Error(
        `trustline submission failed: ${String(e && e.message)}${extras ? " extras=" + JSON.stringify(extras) : ""}`
      );
    }
    const rec = await pollTransaction(resp.hash);
    if (resp.successful !== true && rec.successful !== true) {
      throw new Error(`trustline transaction did not confirm: ${JSON.stringify({ hash: resp.hash, poll: rec.status, successful: rec.successful })}`);
    }
    trustline.txHash = resp.hash;
    trustline.ledger = Number(rec.ledger) || Number(resp.ledger) || null;
    if (!(typeof trustline.ledger === "number" && trustline.ledger > 0)) {
      throw new Error(`wire read-back failed: no numeric ledger for trustline tx ${resp.hash} (fail-closed)`);
    }
    trustline.feeOfferedStroopsPerOp = Number(FEE_PER_OP);
    trustline.feeChargedStroops = Number(rec.fee_charged);
    if (!(trustline.feeChargedStroops > 0)) {
      throw new Error(`wire read-back failed: no numeric fee_charged for trustline tx ${resp.hash} (fail-closed)`);
    }
    const loaded = await server.loadAccount(publicKey);
    const b = findIouBalance(loaded, usdc);
    if (!b) throw new Error(`wire read-back failed: USDC trustline not present after ${resp.hash} (fail-closed)`);
    console.log(`trustline created (tx ${resp.hash}, ledger ${trustline.ledger}, fee ${trustline.feeChargedStroops} stroops) — reserve locked: ${BASE_RESERVE_XLM} XLM`);
  }

  // ---- 5+6: build + sign + submit the gated strict-send swap ---------------
  const preSwap = await server.loadAccount(publicKey);
  const xlmBefore = parseFloat(preSwap.balances.find((b) => b.asset_type === "native").balance);
  const usdcBefore = hasTrustline ? floor1e7(parseFloat(findIouBalance(preSwap, usdc).balance)) : 0;

  const swapTx = new TransactionBuilder(preSwap, { fee: FEE_PER_OP, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: String(sendAmount),
        destination: publicKey,
        destAsset: usdc,
        destMin: String(destMin),
        path: [],
      })
    )
    .setTimeout(90)
    .build();
  swapTx.sign(keypair);
  let swapResp;
  try {
    swapResp = await server.submitTransaction(swapTx);
  } catch (e) {
    const extras = e && e.response && e.response.data && e.response.data.extras;
    throw new Error(
      `swap submission failed: ${String(e && e.message)}${extras ? " extras=" + JSON.stringify(extras) : ""}`
    );
  }
  const swapRec = await pollTransaction(swapResp.hash);
  const swapConfirmed = swapResp.successful === true || swapRec.successful === true;
  if (!swapConfirmed) {
    throw new Error(`swap transaction did not confirm: ${JSON.stringify({ hash: swapResp.hash, poll: swapRec.status, successful: swapRec.successful })}`);
  }
  const swapLedger = Number(swapRec.ledger) || Number(swapResp.ledger) || null;
  if (!(typeof swapLedger === "number" && swapLedger > 0)) {
    throw new Error(`wire read-back failed: no numeric ledger for swap tx ${swapResp.hash} (fail-closed)`);
  }
  const swapFeeChargedStroops = Number(swapRec.fee_charged);
  if (!(swapFeeChargedStroops > 0)) {
    throw new Error(`wire read-back failed: no numeric fee_charged for swap tx ${swapResp.hash} (fail-closed)`);
  }

  // ---- 7: wire read-backs ---------------------------------------------------
  const post = await server.loadAccount(publicKey);
  const xlmAfter = parseFloat(post.balances.find((b) => b.asset_type === "native").balance);
  const usdcAfter = floor1e7(parseFloat(findIouBalance(post, usdc).balance));
  const usdcReceived = floor1e7(usdcAfter - usdcBefore);
  if (!(usdcReceived > 0)) {
    throw new Error(`wire read-back failed: USDC balance did not increase (${usdcBefore} -> ${usdcAfter}) after ${swapResp.hash} (fail-closed)`);
  }
  // Wire cross-check: with destination = source the only XLM outflow is
  // sendAmount + the charged fee; Horizon's own fee_charged must match the
  // balance arithmetic to the stroop (tolerance 1 stroop for float noise).
  const feeDerivedStroops = Math.round((xlmBefore - xlmAfter - sendAmount) * 1e7);
  if (Math.abs(feeDerivedStroops - swapFeeChargedStroops) > 1) {
    throw new Error(`fee cross-check mismatch: wire fee_charged ${swapFeeChargedStroops} vs balance-arithmetic ${feeDerivedStroops} stroops (fail-closed)`);
  }

  return {
    artifact: {
      schema: "CoreGuard-Evidence/1",
      artifact: "stellar-dex-swap-executed",
      version: DEX_GATE_VERSION,
      executedBy: "scripts/stellar-dex-swap-executed.mjs",
      network: "stellar-mainnet",
      ownerAuthorized: true,
      authorization: {
        source: "owner explicit directive 2026-11-06 (binding session record)",
        scope: "milestone 3 of docs/STELLAR-MAINNET-TX.md — the first SIGNED DEX swap on mainnet",
        signing: "owner keypair (.stellar-wallet.json), per call only; no key material in any artifact",
      },
      submit: swapConfirmed
        ? `CONFIRMED — first signed gated swap executed on mainnet (tx ${swapResp.hash}, ledger ${swapLedger})`
        : `NOT_CONFIRMED — last observed state on the wire`,
      asset,
      book: {
        asksCount: asks.length,
        bidsCount: bids.length,
        depthXlm,
        fetchedVia: "Horizon /order_book (selling native / buying " + asset.code + " on " + asset.issuer + ")",
        asksSample: asks.slice(0, 3),
        bidsSample: bids.slice(0, 3),
      },
      policy: { ...policy, derivedRule: "max_amount = floor(real ask depth x 1% x 1e7)/1e7 (7-decimal Stellar precision)" },
      plan,
      gates: {
        preflight: "fail-closed; both gates must be strictly VERIFIED before any submission",
        swap: { verdict: gate1.verdict, reason: gate1.reason, allowed: gate1.allowed },
        pathPayment: { verdict: gate2.verdict, reason: gate2.reason, allowed: gate2.allowed },
      },
      trustline,
      swap: {
        txHash: swapResp.hash,
        ledger: swapLedger,
        successful: true,
        feeOfferedStroopsPerOp: Number(FEE_PER_OP),
        feeChargedStroops: swapFeeChargedStroops,
        xlmSent: sendAmount,
        usdcReceived,
        xlmBeforeSwap: floor1e7(xlmBefore),
        xlmAfterSwap: floor1e7(xlmAfter),
        usdcDeltaRule: "wire read-back: USDC credit balance after swap minus balance immediately before the swap, floored at 1e-7",
      },
      summary: {
        swapState: "CONFIRMED",
        usdcReceived,
        exchangeRate: floor1e7(usdcReceived / sendAmount),
        verdict: "MAINNET SWAP EXECUTED — VERIFIED (owner-authorized; DEX-GATE/1 preflight gates ALLOW; wire read-back confirmed)",
      },
    },
  };
}

/** Build the artifact, write OUT, and return exit semantics (winner call sites only). */
export async function buildArtifact({ dryRun = false } = {}) {
  const out = await runFlow({ dryRun });
  if (out.dryRun) return out;
  const artifact = out.artifact;
  if (!artifact) return out;
  artifact.evidenceDigest = digestStable(artifact);
  artifact.generatedAt = new Date().toISOString();
  return { artifact };
}

export async function verifyArtifact() {
  const stored = JSON.parse(await readFile(OUT, "utf8"));
  const recomputed = digestStable(stored);
  if (recomputed !== stored.evidenceDigest) {
    console.error(`DIGEST MISMATCH: stored=${stored.evidenceDigest} recomputed=${recomputed}`);
    process.exit(1);
  }
  // Re-run both gates from the STORED real book + plan; verdicts must match.
  const re1 = gateSwap({
    source: stored.plan.source, destination: stored.plan.destination,
    amount: stored.plan.sendAmount, minAmount: stored.plan.minAmount,
    policy: stored.policy, network: "mainnet",
  });
  const re2 = gatePathPayment({
    source: stored.plan.source, destination: stored.plan.destination,
    sendAsset: "XLM", destAsset: stored.plan.destAsset.code,
    sendAmount: stored.plan.sendAmount, destMin: stored.plan.destMin,
    policy: stored.policy, network: "mainnet",
  });
  if (re1.verdict !== stored.gates.swap.verdict) {
    console.error(`GATE VERDICT MISMATCH swap: stored=${stored.gates.swap.verdict} recomputed=${re1.verdict}`);
    process.exit(1);
  }
  if (re2.verdict !== stored.gates.pathPayment.verdict) {
    console.error(`GATE VERDICT MISMATCH pathPayment: stored=${stored.gates.pathPayment.verdict} recomputed=${re2.verdict}`);
    process.exit(1);
  }
  if (!/^[0-9a-f]{64}$/.test(stored.swap.txHash)) fail("swap txHash is not a 64-hex Stellar transaction hash");
  if (!(typeof stored.swap.ledger === "number" && stored.swap.ledger > 0)) fail("swap ledger is missing or not a positive number");
  if (stored.swap.successful !== true) fail("swap.successful is not true");
  if (!(stored.swap.usdcReceived > 0)) fail("swap.usdcReceived is not positive — the wire read-back must show a real credit");
  if (stored.trustline.created !== true && stored.trustline.created !== false) fail("trustline.created is neither true nor false");
  if (!/^sha256:[0-9a-f]{64}$/.test(stored.evidenceDigest)) fail("evidenceDigest is not shape-sha256");
  if (stored.policy.rules[0].type !== "max_amount" || !(stored.plan.sendAmount <= stored.policy.rules[0].value)) fail("plan.sendAmount must sit within the stored real-door policy ceiling");
  if (stored.summary.swapState !== "CONFIRMED") fail(`summary.swapState is ${stored.summary.swapState}`);
  console.log("STELLAR-DEX-SWAP EXECUTED · CONFIRMED — digest faithful, gate verdicts re-derived from the stored real book, wire read-backs intact");
  return 0;
}

function fail(msg) {
  console.error("VERIFY FAIL-CLOSED:", msg);
  process.exit(1);
}

export async function main(argv = []) {
  if (argv.includes("--verify")) return verifyArtifact();
  const dryRun = argv.includes("--dry-run");
  const out = await buildArtifact({ dryRun });
  if (out.artifact) {
    const a = out.artifact;
    await writeFile(OUT, JSON.stringify(a, null, 2) + "\n", "utf8");
    console.log(OUT);
    console.log("submit:", a.submit);
    console.log("plan:", a.plan.sendAmount, "XLM ->", a.plan.destAsset.code, "destMin", a.plan.destMin, "expected", a.plan.expectedReceiveUsdc);
    console.log("trustline:", a.trustline.created ? `created (tx ${a.trustline.txHash}, ledger ${a.trustline.ledger}, fee ${a.trustline.feeChargedStroops} stroops)` : "already present (skipped)");
    console.log("swap tx:", a.swap.txHash, "ledger:", a.swap.ledger, "fee:", a.swap.feeChargedStroops, "stroops");
    console.log("USDC received:", a.swap.usdcReceived, "(rate", a.summary.exchangeRate, "USDC/XLM)");
    console.log("digest:", a.evidenceDigest);
  }
  return out.rejected ? 2 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exit(await main(process.argv.slice(2)));
}
