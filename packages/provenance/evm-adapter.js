/**
 * CoreGuard AgentProof — optional EVM signer adapter gate.
 *
 * The zero-dependency provenance core (canonicalization, manifest model,
 * state machine) never imports @coreguard/evm statically. EVM-dependent
 * checks go through this gate: when the adapter is unavailable the verifier
 * reports NOT_RUN — it never invents a cryptographic result.
 *
 * Dependency rule (recorded in docs/dependency-gate.md):
 *   @coreguard/crypto (zero-dep) → @coreguard/provenance (zero-dep core
 *   + optional EVM adapter) → @coreguard/evm (isolated sekpg256k1/Keccak).
 */

let cached = null;
let attempted = false;

/**
 * Load the @coreguard/evm signer adapter once, memoized.
 * @returns {Promise<object|null>} the EVM adapter module, or null when the
 *   isolated dependency package is unavailable (NOT_RUN semantics).
 */
export async function loadEvmAdapter() {
  if (attempted) return cached;
  attempted = true;
  try {
    cached = await import("@coreguard/evm");
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Force a reload replay for tests / package managers that snapshot import
 * maps (not used in hot paths).
 */
export async function reloadEvmAdapter() {
  attempted = false;
  cached = null;
  return loadEvmAdapter();
}