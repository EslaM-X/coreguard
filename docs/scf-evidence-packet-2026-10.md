# CoreGuard — SCF 150K Evidence Packet (2026-10)

> **Status: PREPARED · MEASURED — from the committed tree only.**
> This packet is the evidence-ready submission file for the execution-truth
> award ask (the Stellar / Core DAO / Pi Network 150K milestone-funding thesis).
> It proves nothing by narrative: every figure below is machine-measured,
> reproducible from a clean clone, and CI-enforced.

---

## 1) Measured evidence (authoritative sources)

| Claim | Measured value | Source |
|---|---|---|
| Test suite | **1405 / 1405 PASS** · 0 fail · 0 drift | `docs/state-snapshot.json` (`testsTotal`) · `scripts/run-tests.mjs` |
| Boundary audit | **964 files scanned · 0 violations · CHECK PASS** | `docs/state-snapshot.json` (`boundaryAudit`) · `scripts/boundary-audit.mjs` |
| Docs-node contract | **105 executed · 66 skip-listed · 22 docs covered** | `docs/state-snapshot.json` (`docsNode`) · `test/ci/docs-node-contract.test.js` |
| Claims audit (CG-CL/1) | **28 claims · 16 VERIFIED · 0 violations** | `docs/claims-registry.json` · `scripts/ladder/claim-registry.mjs --audit` |
| Release gate (CG-RG/1) | **18/18 legs · GATE_PASS · independence PASS (18/18 self-audited)** | `docs/release-gate.json` · `npm run release:gate:independence` |
| State snapshot check | **CHECK OK** | `node scripts/current-state.mjs --check` |

Snapshot identity: `measuredAtUtc 2026-10-29T18:44:29Z` · `gitCommit 9fb051a…` · `commitsAheadOfV060 242`.

---

## 2) Reproduce it

The same chain is what CI runs on every push (Engine / Demos / DDE legs).

## 3) The killer proof surface (what the 150K ask buys)

1. **Deterministic execution truth (CGEP/1 + L2)**: intent/policy → commitment →
   receipt; L2 replay is production-grade (audit trail + replayHash + diff + report;
   MATCH never upgrades from partial, `UNKNOWN → HELD`, reserve-before-sign).
2. **Delivery & dispute boundary (DDE/1)**: execution evidence never decides
   conformity; the payout gate holds until party acceptance; tamper → refusal.
3. **Evidence package (EVP/1)**: `scripts/make-evidence-package.mjs` → `EVP_OK` · 11/11.
4. **Killer demo**: `npm run demo:90s:killer` (public script), `npm run demo:90s` (recorded),
   `npm run demo:90s:live` (read-only re-derivation from Core Mainnet).
5. **Network killers**: Core DAO (`@coreguard/coredao-killer`), Stellar
   (`@coreguard/stellar-killer` + `@coreguard/stellar-agent`), Pi (`@coreguard/pi-killer`);
   Trinity unified gate across all three networks.

---

## 4) Honest limits (no over-claim)

- No funds were moved; no broadcast; no Mainnet action authorized by this packet.
- No badge issued; `issuerCount 0`; no live external integration; no third-party audit.
- The Stellar live demo is external-network (testnet Friendbot + Horizon) and is
  skip-listed from the docs-node contract by design; the offline replay is executed.

---

## 5) Submission checklist for the 150K award

- [ ] Reproduce the measured-evidence chain from a clean clone (CI green on the same commit).
- [ ] Run the evidence package and the killer demo; capture outputs for the funder.
- [ ] Confirm the honest limits are stated (never claim what is `UNKNOWN` / `GATED`).
