/**
 * CoreGuard Signed Intent SDK — public surface (WS-2, spec/signed-intent-sdk.md).
 *
 * Consumer surface only. It independently re-derives the WS-1 binding chain
 * (intentRef → manifestId → bindingRef → executionScope from the frozen decision
 * record → authority probe) and NEVER ratifies a caller-supplied authorization
 * claim (§4.0 red line). The decision stays the Firewall's (`decideFirewall`);
 * WS-2 integrates only through the validated `{ intent, declaration }` pair.
 * No Q-FW10 crossing: execution evidence is rejected (typed shape, A6/A12).
 */

export { verifyBinding } from "./verify-binding.js";
export { FW_DECISION_DOMAIN, FW_DECISION_RECORD_VERSION } from "./verify-binding.js";
export { createGuard, authorize, verify, anchor, GUARD_VERSION } from "./guard.js";