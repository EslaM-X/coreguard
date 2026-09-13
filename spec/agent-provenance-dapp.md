# CoreGuard AgentProof DApp — UX & Branding (Design Draft)

**Version**: 1.0.0-design · **Status**: Design only — no DApp code in P2
**Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Brand Principles

- **AgentProof** = the public name for provenance verification.
  Tagline: *verifies declared execution provenance and cryptographic authority*.
- **Honest truth over pretty claims.** Badges display EXACTLY the verifier
  state (§6 of protocol spec). A `DECLARED` is never rendered as `VERIFIED`.
- **No personality guessing.** "Human" is never shown as inferred — always
  "declared" or "cannot be inferred unless attested".
- Core-native identity: badges and flows reference Core Testnet2/Mainnet chain
  data and the EvidenceRegistry anchor as the trust truth.

## 2. Provenance Badge Set (the UI truth table)

| Badge | State shown | Copy (never prettified) |
|---|---|---|
| 🤖 Automated Agent | VERIFIED | "Automated agent — delegation verified" |
| 🔑 Authorized signer | VERIFIED | "Signer authorization verified" |
| 🏢 Organization | DECLARED / VERIFIED | "Organization (declared)" / "Organization (attestation verified)" |
| 🧠 AI-assisted | DECLARED | "AI-assisted — declared (not independently provable)" |
| 👤 Human | NOT_PROVEN (default) / DECLARED / ATTESTED | "Human — cannot be inferred unless cryptographically attested" |
| ❓ Unknown | NOT_PROVEN/UNKNOWN | "Unknown — no provenance declared (fail-closed)" |
| ⚠ Pattern hint | INFERRED (informational only) | "Informational pattern hint — not a verdict" |

## 3. View Hierarchy (DApp)

- **Execution view**: given txHash/chainId → render badges + verdict + anchor
  proof ref. Entry point of the DApp.
- **Agent view**: given serviceId/address → aggregate provenance states across
  its executions WITHOUT profiling/score.
- **Register flow**: operator declares type + disclosures + signer; produces a
  manifest + anchors it. No identity collection; operator-owned.
- **Verify flow**: independent re-verification from any RPC/offline — same
  output as CLI `verify-provenance`.

## 4. UX Do/Don't

**Do:**
- Show the chain evidence (block number/hash + proofId) under every badge.
- One-click "re-verify now" that runs the open verifier and diffs states.
- Explain EVERY downgrade (why `ATTESTED` didn't become `VERIFIED`).
- Show `UNKNOWN` prominently as the default safe state.

**Don't:**
- Don't show a security score (0–100).
- Don't fabricate coverage for undocumented states.
- Don't bury contradictory evidence under a green shield.

## 5. Accessibility & Ecosystem

- The DApp is a **renderer of the open verifier**, never a separate oracle —
  every badge must be reproducible by the CLI/tooling.
- Lightweight: no backend requirement; all verification is client-side or
  self-hosted. (Consistent with privacy tiers in `privacy-model.md`.)

---

*End of AgentProof DApp UX & Branding Draft.*