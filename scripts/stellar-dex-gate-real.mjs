#!/usr/bin/env node
/**
 * DEX-GATE/1 — REAL-DEX evidence runner (Stellar mainnet order book).
 *
 * What this is: a committed runner that drives the CoreGuard Stellar DEX
 * gating engine (packages/stellar/dex-gating.mjs) against the REAL live
 * Stellar mainnet order book — no simulation, no mock chain:
 *
 *   1. discover the dominant USDC issuer on mainnet by walking Horizon
 *      /assets?asset_code=USDC (paging order, hard page cap), ranking every
 *      variant by its real authorized-accounts universe, then order-book
 *      probing the top variants — network-derived, nothing hardcoded;
 *   2. fetch the real XLM/USDC order book via Horizon /order_book,
 *   3. derive the policy ceiling FROM the real displayed depth,
 *   4. execute gate paths and record every verdict:
 *      swap in-policy → ALLOW · swap far over ceiling → REJECTED ·
 *      swap deny-listed destination → REJECTED · path payment → ALLOW ·
 *      liquidity provision → ALLOW.
 *
 * What this is NOT:
 *   - it does NOT sign or broadcast anything (no funds move; Horizon is read-only).
 *   - it does NOT claim a signed mainnet swap happened: the artifact honestly
 *     records `broadcast: NOT_PERFORMED — signing is a funded owner decision`.
 *   - the digested payload contains no wall-clock data: `--verify` re-derives
 *     every verdict deterministically from the stored real book snapshot.
 *
 * Usage:
 *   node scripts/stellar-dex-gate-real.mjs           # generate artifact (1 live read)
 *   node scripts/stellar-dex-gate-real.mjs --verify  # re-derive from stored book (offline, exit 0/1)
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  gateSwap,
  gatePathPayment,
  gateProvideLiquidity,
  DEX_GATE_VERSION,
} from "../packages/stellar/dex-gating.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT = resolve(repoRoot, "docs/evidence/stellar-dex-gate-executed.json");

const HORIZON = "https://horizon.stellar.org";
const MAINNET_WALLET = "GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U";
/** A policy deny-list caller surface (policy-listed constant, never a real party). */
const DENY_LISTED = "GDNGRAMZLCXVSNLIB5RFRYYXYAWEQVPWFND5CEDX25S6E4MOLNRTOSXM";

function stripVolatile(o) {
  const { swapId, generatedAt, evidenceDigest, ...rest } = o;
  return rest;
}

/** Explicit deterministic derivation: 1% of the real displayed depth is the ceiling — carried as a RULE (the engine reads rules[]). */
function derivePolicy(depthXlm) {
  const maxAmount = Math.floor(depthXlm * 0.01 * 1e7) / 1e7; // 7-decimal floor (Stellar precision)
  return { maxSlippage: 0.05, rules: [{ type: "max_amount", value: maxAmount }] };
}

async function j(HttpUrl) {
  const r = await fetch(HttpUrl);
  if (!r.ok) throw new Error(`Horizon ${r.status} for ${HttpUrl.slice(0, 90)}…`);
  return r.json();
}

/** Dynamic discovery: rank every real USDC variant on Horizon by its authorized-accounts
 *  universe (network-derived, nothing hardcoded), order-book-probe the top variants, and
 *  select the first whose REAL native-pair ask depth clears the liquid bar. Fail-closed:
 *  if no candidate clears the bar, this run refuses to fabricate depth and exits nonzero. */
export async function probeIssuer() {
  const LIQUID_THRESHOLD = 10; // real XLM ask depth the selected book must clear
  const ASSET_PAGES = 6; // hard cap on the /assets walk (each page carries <= 200 variants)
  const PROBE_TOP = 3; // order-book probes are spent only on the top variants by accounts

  const variants = [];
  let url = `${HORIZON}/assets?asset_code=USDC&limit=200`;
  let pagesWalked = 0;
  while (url && pagesWalked < ASSET_PAGES) {
    const d = await j(url);
    pagesWalked += 1;
    for (const rec of Array.isArray(d._embedded?.records) ? d._embedded.records : []) {
      variants.push({
        code: rec.asset_code ?? "USDC",
        issuer: rec.asset_issuer,
        authorizedAccounts: rec.accounts?.authorized ?? 0,
      });
    }
    url = (d._links?.next?.href || null);
  }
  if (variants.length === 0) {
    throw new Error("No USDC assets discovered on Horizon — refusing to fabricate depth (fail-closed)");
  }
  variants.sort((a, b) => b.authorizedAccounts - a.authorizedAccounts);
  const trail = [];
  for (const cand of variants.slice(0, PROBE_TOP)) {
    const book = await j(
      `${HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${cand.code}&buying_asset_issuer=${cand.issuer}&limit=10`
    );
    const asks = Array.isArray(book.asks) ? book.asks : [];
    const depth = asks.reduce((acc, a) => acc + parseFloat(a.amount), 0);
    trail.push({ issuer: cand.issuer, authorizedAccounts: cand.authorizedAccounts, askDepthXlm: depth });
    if (depth >= LIQUID_THRESHOLD) {
      return assetIssuerFinalize({ code: cand.code, issuer: cand.issuer, authorizedAccounts: cand.authorizedAccounts }, trail, pagesWalked);
    }
  }
  throw new Error(
    `No USDC/native pair clears the ${LIQUID_THRESHOLD} XLM displayed ask-depth bar — refusing to fabricate depth (fail-closed)`
  );
}

function assetIssuerFinalize(asset, trail, pagesWalked) {
  return {
    ...asset,
    discoveryRule:
      "Horizon /assets?asset_code=USDC walked in paging order under a hard page cap, ranked by authorized-accounts universe, top variants order-book-probed; the selected pair's REAL native ask depth must clear the liquid bar or the run fails closed (network-derived, recorded trail)",
    pagesWalked,
    probeTrail: trail,
  };
}

export function verifiedFromSnapshot(stored) {
  /** Offline verification: re-derive every verdict deterministically from the stored real book. */
  const depth = stored.book.depthXlm;
  const policy = derivePolicy(depth);
  const ceiling = policy.rules[0].value;
  const small = Math.floor(ceiling * 0.001 * 1e7) / 1e7;
  const over = ceiling * 100;
  const cases = [];

  cases.push({
    id: "swap-in-policy",
    verdict: gateSwap({
      source: MAINNET_WALLET,
      destination: MAINNET_WALLET,
      amount: small,
      minAmount: Math.floor(small * 0.97 * 1e7) / 1e7,
      policy,
      network: "mainnet",
    }),
  });
  cases.push({
    id: "swap-over-ceiling",
    verdict: gateSwap({ source: MAINNET_WALLET, destination: MAINNET_WALLET, amount: over, policy, network: "mainnet" }),
  });
  cases.push({
    id: "swap-deny-listed",
    verdict: gateSwap({
      source: MAINNET_WALLET,
      destination: DENY_LISTED,
      amount: small,
      minAmount: Math.floor(small * 0.97 * 1e7) / 1e7,
      policy: { ...policy, rules: [{ type: "deny_destination", value: DENY_LISTED }] },
      network: "mainnet",
    }),
  });
  cases.push({
    id: "path-payment",
    verdict: gatePathPayment({
      source: MAINNET_WALLET,
      destination: MAINNET_WALLET,
      sendAsset: "XLM",
      destAsset: stored.asset.code,
      sendAmount: small,
      destMin: Math.floor(small * 0.97 * 1e7) / 1e7,
      policy,
      network: "mainnet",
    }),
  });
  cases.push({
    id: "provide-liquidity",
    verdict: gateProvideLiquidity({
      source: MAINNET_WALLET,
      pool: `native<->${stored.asset.code}`,
      amountA: small,
      amountB: small,
      minA: Math.floor(small * 0.97 * 1e7) / 1e7,
      minB: Math.floor(small * 0.97 * 1e7) / 1e7,
      policy,
      network: "mainnet",
    }),
  });

  return cases.map((c) => ({
    id: c.id,
    verdict: c.verdict.verdict ?? null,
    reason: c.verdict.reason ?? null,
    allowed: c.verdict.allowed ?? null,
  }));
}

/** Deterministic sha256 over the digest-stable canonical body. */
export function digestStable(payload) {
  const h = createHash("sha256");
  h.update(JSON.stringify(stripVolatile(payload)));
  return "sha256:" + h.digest("hex");
}

export function buildArtifact() {
  return (async () => {
    const asset = await probeIssuer();
    const bookRaw = await j(
      `${HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${asset.code}&buying_asset_issuer=${asset.issuer}&limit=10`
    );
    const asks = Array.isArray(bookRaw.asks) ? bookRaw.asks : [];
    const depthXlm = asks.reduce((acc, ask) => acc + parseFloat(ask.amount), 0);
    if (!(depthXlm > 0)) throw new Error("EMPTY real book — refusing to fabricate depth (fail-closed)");
    const policy = derivePolicy(depthXlm);
    const ceiling = policy.rules[0].value;
    const small = Math.floor(ceiling * 0.001 * 1e7) / 1e7;
    const over = ceiling * 100;

    const swapped = stripVolatile(
      gateSwap({ source: MAINNET_WALLET, destination: MAINNET_WALLET, amount: small, minAmount: Math.floor(small * 0.97 * 1e7) / 1e7, policy, network: "mainnet" })
    );
    const swappedOver = stripVolatile(gateSwap({ source: MAINNET_WALLET, destination: MAINNET_WALLET, amount: over, policy, network: "mainnet" }));
    const swappedDeny = stripVolatile(
      gateSwap({
        source: MAINNET_WALLET,
        destination: DENY_LISTED,
        amount: small,
        minAmount: Math.floor(small * 0.97 * 1e7) / 1e7,
        policy: { ...policy, rules: [{ type: "deny_destination", value: DENY_LISTED }] },
        network: "mainnet",
      })
    );
    const pathP = stripVolatile(
      gatePathPayment({ source: MAINNET_WALLET, destination: MAINNET_WALLET, sendAsset: "XLM", destAsset: asset.code, sendAmount: small, destMin: Math.floor(small * 0.97 * 1e7) / 1e7, policy, network: "mainnet" })
    );
    const liquidity = stripVolatile(
      gateProvideLiquidity({ source: MAINNET_WALLET, pool: `native<->${asset.code}`, amountA: small, amountB: small, minA: Math.floor(small * 0.97 * 1e7) / 1e7, minB: Math.floor(small * 0.97 * 1e7) / 1e7, policy, network: "mainnet" })
    );

    const artifacts = {
      schema: "CoreGuard-Evidence/1",
      artifact: "stellar-dex-gate-executed",
      version: DEX_GATE_VERSION,
      executedBy: "scripts/stellar-dex-gate-real.mjs",
      network: "stellar-mainnet",
      broadcast: "NOT_PERFORMED — signing/broadcast is a funded owner decision (no key material, no funds moved)",
      asset,
      book: {
        asksCount: asks.length,
        bidsCount: (bookRaw.bids ?? []).length,
        depthXlm,
        asksSample: asks.slice(0, 3),
        bidsSample: (bookRaw.bids ?? []).slice(0, 3),
      },
      policy: { ...policy, derivedRule: "max_amount = floor(real ask depth × 1% × 1e7)/1e7 (7-decimal Stellar precision)" },
      cases: [
        { id: "swap-in-policy", ...swapped },
        { id: "swap-over-ceiling", ...swappedOver },
        { id: "swap-deny-listed", ...swappedDeny },
        { id: "path-payment", ...pathP },
        { id: "provide-liquidity", ...liquidity },
      ],
    };
    artifacts.evidenceDigest = digestStable(artifacts);
    artifacts.generatedAt = new Date().toISOString();
    return artifacts;
  })().then((a) => a);
}

function assetIssuer(asset) {
  return asset.issuer;
}

export async function main(argv) {
  if (argv.includes("--verify")) {
    const stored = JSON.parse(await readFile(OUT, "utf8"));
    const recomputedDigest = digestStable(stored);
    if (recomputedDigest !== stored.evidenceDigest) {
      console.error(`DIGEST MISMATCH: stored=${stored.evidenceDigest} recomputed=${recomputedDigest}`);
      process.exit(1);
    }
    const reDerived = verifiedFromSnapshot(stored);
    for (const row of reDerived) {
      const match = stored.cases.find((c) => c.id === row.id);
      if (!match || match.verdict !== (row.verdict ?? null)) {
        console.error(`VERDICT MISMATCH on ${row.id}: stored=${match?.verdict} recomputed=${row.verdict}`);
        process.exit(1);
      }
    }
    console.log("STELLAR-DEX-GATE REAL-MAINNET · VERIFIED — digest faithful, verdict matrix re-derived from the stored real book");
    return 0;
  }
  const artifact = await buildArtifact().catch((e) => {
    console.error("REFUSED (fail-closed):", e.message);
    return null;
  });
  if (!artifact) process.exit(3);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(OUT);
  for (const c of artifact.cases) console.log(` ${c.id.padEnd(20)} ${String(c.verdict).padEnd(10)} ${c.reason}`);
  console.log("digest:", artifact.evidenceDigest);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exit(await main(process.argv.slice(2)));
}
