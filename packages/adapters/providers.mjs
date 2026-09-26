#!/usr/bin/env node
/**
 * providers.mjs — the provider inventory built on the adapter contract.
 *
 * Four surfaces are declared today; every one runs in DRY_RUN with no
 * credentials, so status() is UNKNOWN / NOT_BUILT and nothing claims a live
 * step (packages/adapters/contract.mjs). The only external part that stays
 * gated on a real counterparty is actual authorization/execution.
 *
 * Usage:
 *   node packages/adapters/providers.mjs --status
 */

import { createAdapter, adapterContractConformance } from "./contract.mjs";

export const PROVIDER_SPECS = Object.freeze([
  {
    id: "PEOPLES_COURT",
    name: "People's Court attestation provider",
    standard: ["ADAL/1", "EVP/1"],
    surface: "packages/peoples-court-adapter",
    runMode: "DRY_RUN",
    lifecycle: { hasCredentials: false, authorized: false, executed: false, receiptCaptured: false },
  },
  {
    id: "REFERENCE_TRIBUNAL",
    name: "Reference tribunal provider",
    standard: ["ADAL/1"],
    surface: "examples/reference-tribunal",
    runMode: "DRY_RUN",
    lifecycle: { hasCredentials: false, authorized: false, executed: false, receiptCaptured: false },
  },
  {
    id: "AGENTIC_ESCROW",
    name: "Agentic escrow & arbitration provider",
    standard: ["AEA/1", "ADAL/1"],
    surface: "packages/agentic-escrow-arbitration",
    runMode: "DRY_RUN",
    lifecycle: { hasCredentials: false, authorized: false, executed: false, receiptCaptured: false },
  },
  {
    id: "X402",
    name: "x402 commercial-request provider",
    standard: ["X402/1"],
    surface: "packages/x402",
    runMode: "DRY_RUN",
    lifecycle: { hasCredentials: false, authorized: false, executed: false, receiptCaptured: false },
  },
]);

export function buildProviders(specs = PROVIDER_SPECS) {
  return specs.map((s) => {
    const adapter = createAdapter(s);
    return {
      id: adapter.id,
      name: adapter.name,
      standard: adapter.standard,
      contract: adapterContractConformance(adapter).status,
      status: adapter.status(),
      lifecycle: { ...adapter.lifecycle },
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--status")) {
    const providers = buildProviders();
    const rows = providers.map((p) => {
      const s = p.status;
      return `${p.id.padEnd(26)} ${String(p.contract).padEnd(12)} runMode=${s.runMode.padEnd(8)} status=${s.status.padEnd(10)} integration=${s.integrationStatus}`;
    });
    console.log("ADAPTER PROVIDERS — DRY_RUN, no credentials, no live claim");
    console.log(rows.join("\n"));
    process.exit(0);
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(buildProviders(), null, 2));
    process.exit(0);
  }
  console.log("usage: node packages/adapters/providers.mjs --status | --json");
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith("providers.mjs")) main();