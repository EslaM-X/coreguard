/**
 * adapters.mjs — the honest integration registry.
 *
 * Every adapter mirrors a REAL surface in this repository and every `state` is
 * the true current one. No entry may describe a live step: integrationStatus
 * stays NOT_BUILT and networkCall stays NOT_PERFORMED until an authorized,
 * owner-approved step records a confirmation fixture (state-machine.mjs).
 *
 * This file is the single source the evidence-passport and the adoption
 * dashboard read; edit only here, never hand-edit the generated JSON.
 */

/** Per-adapter records: id, name, surface (repo path), standard it serves. */
export const ADAPTER_REGISTRY = Object.freeze([
  {
    id: "PEOPLES_COURT_ADAPTER",
    name: "People's Court attestation adapter",
    surface: "packages/peoples-court-adapter",
    standard: ["ADAL/1", "EVP/1"],
    state: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    networkCall: "NOT_PERFORMED",
    lastVerification: "NOT_RECORDED",
    capabilities: "per-party evidence attestation, derived tri-state modeled consent, recorded-feed live-submission harness",
    limitations: "synthetic fixtures only; no credential stored; recording surface only",
  },
  {
    id: "AGENTIC_ESCROW_ARBITRATION_ADAPTER",
    name: "Agentic Escrow & Arbitration adapter",
    surface: "packages/agentic-escrow-arbitration",
    standard: ["AEA/1", "ADAL/1"],
    state: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    networkCall: "NOT_PERFORMED",
    lastVerification: "NOT_RECORDED",
    capabilities: "ties a verified ADAL/1 dispute package to an escrow-contract reference and a tribunal submission boundary record",
    limitations: "escrow referenced, never executed; adapter template only",
  },
  {
    id: "REFERENCE_TRIBUNAL",
    name: "Reference tribunal (offline synthetic adjudicator)",
    surface: "examples/reference-tribunal",
    standard: ["ADAL/1"],
    state: "DRY_RUN",
    integrationStatus: "NOT_BUILT",
    networkCall: "NOT_PERFORMED",
    lastVerification: "NOT_RECORDED",
    capabilities: "named offline deterministic adjudicator: award only on FULL bilateral assent + pins verify; scenarios A–E fail-closed",
    limitations: "synthetic, local, never a live authority; mock escrow refuses anything not authority-bound",
  },
]);

/** Outreach tracks (the six Phase B rails). NOT_STARTED until a letter passes
 *  the owner gate and a reply becomes a recorded external result. */
export const TRACK_REGISTRY = Object.freeze([
  {
    id: "TRACK_INTERNET_COURT_ECOSYSTEM",
    name: "Internet-Court ecosystem",
    letter: "B1",
    state: "NOT_STARTED",
    target: "GenLayer / Internet Court contacts",
  },
  {
    id: "TRACK_AGENTIC_TRIBUNALS",
    name: "Agentic-court systems",
    letter: "B2",
    state: "NOT_STARTED",
    target: "tribunal / Polycourt / QE-Court",
  },
  {
    id: "TRACK_LEGACY_ODR_RAILS",
    name: "Legacy ODR rails",
    letter: "B3",
    state: "NOT_STARTED",
    target: "Kleros / UMA / Reality.eth",
  },
  {
    id: "TRACK_AGENT_COMMERCE",
    name: "Agent-commerce",
    letter: "B4",
    state: "NOT_STARTED",
    target: "x402 / A2A / marketplaces / escrows",
  },
  {
    id: "TRACK_CORE_ECOSYSTEM",
    name: "Core ecosystem",
    letter: "B5",
    state: "NOT_STARTED",
    target: "Core DAO (inquire@coredao.org sent earlier; Core Ventures NOT ACTIVATED — separate owner decision)",
  },
  {
    id: "TRACK_ACCELERATORS_GRANTS",
    name: "Accelerators / grants",
    letter: "B6",
    state: "NOT_STARTED",
    target: "application programs (per-application owner gate)",
  },
]);

export function adapterState(adapters, id) {
  const a = (adapters || ADAPTER_REGISTRY).find((x) => x.id === id);
  return a ? a.state : "NOT_STARTED";
}

export function registrySummary(adapters = ADAPTER_REGISTRY) {
  return {
    adapters: adapters.length,
    dryRun: adapters.filter((a) => a.state === "DRY_RUN").length,
    started: adapters.filter((a) => a.state !== "NOT_STARTED").length,
    live: adapters.filter((a) => a.state !== "DRY_RUN" && a.state !== "NOT_STARTED" && a.state !== "DESIGNED").length,
    notBuilt: adapters.filter((a) => a.integrationStatus === "NOT_BUILT").length,
  };
}