#!/usr/bin/env node
/**
 * DEX-GATE/1 — REAL-DEX evidence runner (Stellar mainnet order book).
 *
 * What this is: a committed runner that drives the CoreGuard Stellar DEX
 * gating engine (packages/stellar/dex-gating.mjs) against the REAL live
 * Stellar mainnet order book — no simulation, no mock chain:
 *
 *   1. discover the dominant USDC issuer on mainnet via Horizon /assets
 *      (ordered by accounts — network-derived, not hardcoded),
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

/** Dynamic discovery: probe USDC issuers (desc by adoption) until one has REAL depth on the native pair. */
async function probeIssuer(depthFn) {
  const list = await j(`${HORIZON}/assets?asset_code=USC&order=desc&limit=10`);    const trail = [];
  const LIQUID_THRESHOLD = 10; // real XLM depth on the book must clear this bar for a "dominant liquid pair"
  let best = null;
  for (const rec of list._embedded.records) {
    const asset = { code: rec.asset_code ?? "USDC", issuer: rec.asset_issuer, numAccounts: rec.num_accounts, issuedAmount: rec.amount };
    const book = await j(
      `${HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=${asset.code}&buying_asset_issuer=${asset.issuer}&limit=10`
    );
    const asks = Array.isArray(book.asks) ? book.asks : [];
    const depth = asks.reduce((acc, a) => acc + parseFloat(a.amount), 0);
    trail.push({ issuer: asset.issuer, depth: depth });
    if (depth >= LIQUID_THRESHOLD) return assetIssuerFinalize(asset, trail);
    if (!best || depth > best.depth) best = { asset, depth };
  }
  if (best && best.depth > 0) return assetIssuerFinalize(best.asset, trail);
  throw new Error("No liquid USDC/native pair discovered on Horizon — refusing to fabricate depth (fail-closed)");
}

function assetIssuerFinalize(asset, trail) {
  return {
    ...asset,
    discoveryRule: "Horizon /assets?asset_code=USDC order=desc, probed against the real native order book until REAL depth appeared (network-derived, recorded trail)",
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
