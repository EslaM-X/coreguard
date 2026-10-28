# CoreGuard — complete product & service catalog

> **What this page is.** Every product, service, surface and artifact that exists in
> this repository, in one place, with its honest status. Nothing here is a roadmap
> promise: a row is **SHIPPED** only when a committed module runs offline and is
> exercised by `npm test`.
>
> **What this page is not.** No revenue, customer, partnership, funding, badge
> issuance, price, live external integration or production-security claim is made
> anywhere on this page. Those stay `UNKNOWN` / `GATED` until a named event with
> evidence exists. See [STATUS.md](STATUS.md) and
> [claims-registry.json](claims-registry.json).

Bilingual landing page: [PRODUCTS.html](PRODUCTS.html) · Arabic summary below.

---

## 0. Status legend

| Tag | Meaning |
|---|---|
| **LIVE** | A public page runs the real committed engine in the browser tab (no server, no key). |
| **SHIPPED** | Code exists in the repo, runs offline, and is covered by the test suite. |
| **DRY_RUN** | Deterministic simulation. It never calls a third party and never claims one was called. |
| **GATED** | The surface exists but the action needs an owner decision, credential or funding. Not performed. |
| **RESEARCH** | Designed only; no production implementation. |
| **NOT BUILT** | A named target with no module yet. |

**Commercial numbers, measured:** revenue **$0** · customers **0** · named
integrators **0** · badge issuers **0** · prices **LOCKED** (hypothesis) ·
revenue path **NOT PERFORMED**. These are the numbers the committed artifacts
carry.

---

## 1. Core verification protocol (CGEP/1)

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **Execution Receipt protocol (CGEP/1)** | Declared intent + policy → committed hash → observed execution → independently re-verifiable receipt → Core anchor. Draft spec, open for discussion, not a standard. | SHIPPED (draft spec) | [`spec/`](../spec) · [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Canonical encoding** | Identical logical data always produces identical bytes; every digest in the stack depends on it. | SHIPPED | [`packages/canonical`](../packages/canonical) |
| **Intent + Policy engine** | Deterministic, evaluation-free rules: `VALUE_LIMIT`, `TARGET_ALLOWLIST`, `RECIPIENT_ALLOWLIST`, `SELECTOR_ALLOWLIST`, `DEADLINE`, `SLIPPAGE_BPS`, `ORACLE_BOUND`. | SHIPPED | [`packages/intent`](../packages/intent) · [`packages/policy`](../packages/policy) |
| **Trace normalizer + Evidence engine** | Raw RPC data → canonical execution model → evidence bundle + commitment. | SHIPPED | [`packages/trace`](../packages/trace) · [`packages/evidence`](../packages/evidence) |
| **Independent verifier** | Re-verifies a receipt with zero RPC and zero trust in the issuer. | SHIPPED | [`packages/verifier`](../packages/verifier) · [`packages/cli`](../packages/cli) |
| **Verifier B (Rust/WASM)** | Independent re-derivation in a second language; transport/marshalling wrapper only. | SHIPPED | [`packages/independent-verifier`](../packages/independent-verifier) |
| **Verifier C (Python stdlib)** | Third independent re-derivation; cross-language consensus, fail-closed combiner (no majority rule). | SHIPPED | [`packages/verifier-c`](../packages/verifier-c) · [`packages/consensus`](../packages/consensus) |
| **Signer authentication** | ECDSA P-256 / SHA-256 via Node WebCrypto; no external crypto deps. | SHIPPED | [`packages/crypto`](../packages/crypto) |
| **Selector / mandate chain** | Five-layer capability chain: intent → authorization → execution → attestation, with authorization never equal to execution proof. | SHIPPED | [`packages/mandate`](../packages/mandate) · [`packages/selective-disclosure`](../packages/selective-disclosure) |
| **Deterministic replay (L2)** | Re-derives the structural rule book from committed evidence alone and pins it as a digest. | SHIPPED | [`packages/replay`](../packages/replay) |
| **Core-native execution binding** | Core RPC evidence → typed, pinned, canonical evidence items → Execution Attestation. | SHIPPED | [`packages/execution`](../packages/execution) |
| **EvidenceRegistry v0.1** | Single on-chain contract storing commitments only; no custody, no oracles, no surveillance. | SHIPPED (deployed on protocol level) | [`contracts/`](../contracts) · address below |
| **Live Core Mainnet anchor** | Frozen, independently re-derived anchor record. | LIVE (read-only) | `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` · [`submission/06-mainnet-proof.md`](../submission/06-mainnet-proof.md) |
| **AgentProof — actor provenance** | Per-check, fail-closed provenance report: commitment, manifest signature, declared-vs-detected identity. | SHIPPED | [`packages/provenance`](../packages/provenance) |
| **Recovery engine** | Crash-safe write-ahead journal from send intent → on-chain verification; makes the Gate 4.1 failure class structural. | SHIPPED | [`packages/recovery`](../packages/recovery) |

**Verification levels:** L0 commitment · L1 chain receipt · L2 deterministic replay (production-grade: audit trail + cryptographic replay hash + diff + report) · L3 Merkle proof · L4 zero-knowledge (research).

Run it:

```text
npm test
npm run corpus
node packages/cli/src/index.js verify-run --bundle examples/transfer/verify-bundle.json
npm run verify:levels
```

---

## 2. Execution Firewall + developer kit (v0.2)

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **Execution Firewall** | Pre-execution decision core: `ALLOW` / `DENY` / `REQUIRE_REVIEW`, fail-closed on unmodeled context. EVM/RPC are injected, never dependencies. | SHIPPED | [`packages/firewall`](../packages/firewall) |
| **Attack lab** | 10 tamper cases: tampered → FAIL, unknown → UNKNOWN, valid → VERIFIED. | SHIPPED | `npm run attack-lab` · [`scripts/attack-lab.mjs`](../scripts/attack-lab.mjs) |
| **Reference Vault ladder** | Deposit `ALLOW` → `VERIFIED` → anchor plan; six attacks blocked and post-state `INVALID`. | SHIPPED | `npm run demo:vault` · `npm run demo:attack` |
| **`@coreguard/sdk` guard surface** | `guard.authorize` (PRE-only, fail-closed) · `guard.verify` (recomputes every receipt id) · `guard.anchor` (offline commitment plan). | SHIPPED locally · npm publish **GATED** | [`packages/sdk/guard.js`](../packages/sdk/guard.js) |
| **CLI `coreguard`** | `analyze` · `verify` · `verify-run` · `verify-provenance` · `report` · `demo allow|attack`; deterministic exit codes. | SHIPPED locally · npm publish **GATED** | [`packages/cli`](../packages/cli) · [VERIFY-RUN.md](VERIFY-RUN.md) |
| **`create-coreguard-integration`** | One-command scaffold: intent / policy / verifier / tests. | SHIPPED locally | `npm run create:integration -- my-dapp` · [`templates/integration`](../templates/integration) |
| **Consumer integration template** | Reference structure for platforms embedding the gate. | SHIPPED | [`templates/integration`](../templates/integration) |

```text
npm run demo:vault
npm run demo:attack
npm run create:integration -- my-dapp
```

---

## 3. Delivery & Dispute Evidence (DDE/1)

> Binding rule, enforced by the module: **execution verification never decides
> delivery conformity.** `payment_settled=true` never implies
> `delivery_accepted=true`.

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **DDE engine** | Consent state (`FULL` / `PARTIAL` / `UNKNOWN`) + acceptance + release law over evidence packages. | SHIPPED | [`packages/delivery`](../packages/delivery) · [delivery-dispute-boundary.md](delivery-dispute-boundary.md) |
| **HTTP endpoint** | Zero-dependency delivery/dispute handler; identity from the socket, allowlist before rate limit. | SHIPPED | `startDeliveryEndpoint` · [DDE-API-REFERENCE.html](DDE-API-REFERENCE.html) |
| **SDK release gate** | `verifyFixture` + `releaseWhen`: `HOLD` · `RELEASE` · `REFUSED`, fail-closed. | SHIPPED | [DDE-SDK-REFERENCE.html](DDE-SDK-REFERENCE.html) |
| **EVP/1 evidence package** | Deterministic, hash-pinned evidence package standard. | SHIPPED | [`docs/evidence-package-standard.md`](evidence-package-standard.md) · `npm run evidence-package` |
| **ADAL/1 dispute package** | Deterministic dispute package for an external tribunal adapter. | SHIPPED | [`docs/dispute-package-standard.md`](dispute-package-standard.md) · `npm run dispute-package` |
| **People's Court adapter** | ADAL/1 → uploaded-surface dry-run mapper, offline and credential-free. | DRY_RUN · external mapping **NOT BUILT** | `npm run peoples-court:prepare` · [`packages/peoples-court-adapter`](../packages/peoples-court-adapter) |
| **Agentic Escrow Arbitration (AEA/1)** | Deterministic offline escrow-boundary record; verifies an ADAL/1 package, emits escrow interface + tribunal template, re-verifies its own output. | SHIPPED (reference only, `deployed:false`) | `npm run aea1:prepare -- --case <dir>` · [standard](agentic-escrow-arbitration-standard.md) |
| **Reference tribunal** | Local synthetic adjudicator + mock escrow with fail-closed settlement semantics. Explicitly **not** People's Court. | SHIPPED (reference only) | [`examples/reference-tribunal`](../examples/reference-tribunal) |
| **Bilateral dispute fixture** | Synthetic, replayable DDE fixture (nine documented events). | SHIPPED | [`examples/delivery-fixture`](../examples/delivery-fixture) · [demo](DELIVERY-DISPUTE-DEMO.html) |
| **Agent-platform integration example** | Payout gated on DDE: SDK arc + wire-level gate + criteria rejection. | SHIPPED | [`examples/agent-platform-integration`](../examples/agent-platform-integration) |
| **Real-fixture intake kit** | Consent + signed disclosure scope → closure gate → one-command conversion to a reviewable fixture. The gate re-runs on the exact bytes it converts. | SHIPPED (workflow) · real case **GATED** | [`examples/real-fixture-intake`](../examples/real-fixture-intake) |
| **AIE-1 incident review** | One endpoint, one evidence bundle, one report schema; any reviewer replays from a cold clone. | LIVE page + SHIPPED endpoint · external engagement **GATED** | [AIE-1-REVIEW.html](AIE-1-REVIEW.html) · [spec](agent-incident-evidence.md) |

```text
node examples/delivery-fixture/verify-fixture.mjs
npm run evidence-package
npm run dispute-package
npm run peoples-court:prepare
npm run aea1:prepare -- --case dispute-package-output
```

---

## 4. Agent-economy primitives (job market)

These are the primitives that turn a job posting into money that cannot move
without evidence.

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **CG-BUD/1 budget ledger** | Job-scoped budget locked at publish; sub-agent shares carved; race for the last dollar; **never overspends**; deterministic. | SHIPPED | [`packages/budget/ledger.mjs`](../packages/budget/ledger.mjs) |
| **CG-ACC/1 acceptance** | Signed acceptance criteria and disposition; `UNKNOWN` never becomes acceptance. | SHIPPED | [`packages/acceptance/index.mjs`](../packages/acceptance/index.mjs) |
| **X402/1 payment gate** | Canonical 402 challenge; **reserve before sign**; `UNKNOWN` stays `HELD` — never auto-pay, never auto-refund; `settle()` books `$0` without an owner-locked quote. | SHIPPED (harness) · live payments **GATED** | [`packages/x402/index.mjs`](../packages/x402/index.mjs) · `npm run x402` |
| **CG-INT/1 job integration** | Wires budget + acceptance + gate into one job lifecycle: publish → accept → deliver → verify → release/refuse. | SHIPPED | [`packages/job-integration/index.mjs`](../packages/job-integration/index.mjs) |
| **CG-RA/1 refusal audit** | Deterministic refusal log with digests and **no secrets**; the audit trail of why money did not move. | SHIPPED | [`packages/refusal-audit/index.mjs`](../packages/refusal-audit/index.mjs) |
| **Job-economy playground** | Live in-browser cycle: open a job, lock budget, carve shares, race the last dollar, pass the gate before any signature, watch `UNKNOWN` hold the money. No key, no network, no money. | LIVE | [PLAYGROUND.html](PLAYGROUND.html) · `node demo.mjs` |
| **Terminal demo** | Same primitive arc in one command, zero dependencies. | SHIPPED | [`demo.mjs`](../demo.mjs) |

```text
node demo.mjs
```

---

## 5. Verification & integration platform (v0.3.x)

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **L0–L4 machine** | `verify:levels`: L1 now needs a chain confirmation; structure alone is `UNKNOWN`. | SHIPPED | `npm run verify:levels` |
| **13-state integration machine** | Doorway records + no-silent-pass verdict. | SHIPPED | `npm run integration:states` |
| **Adapter contract + 4 provider stubs** | Six-method contract; all four provider surfaces are `DRY_RUN` — no live claim. | SHIPPED (DRY_RUN) | `npm run adapters:status` · [`packages/adapters`](../packages/adapters) |
| **Partner Sandbox** | 8 offline scenarios over a mock chain (`VERIFIED` / `MISMATCH` / `UNKNOWN` / `REJECTED`). | SHIPPED (offline) | `npm run partner:sandbox` |
| **Evidence Passport v2** | Portable, deterministic passport object derived from committed state. | SHIPPED | `npm run passport:v2` · [JSON](evidence-passport-v2.json) |
| **CG-WH/1 webhook receiver** | Domain-separated HMAC over exact bytes; replay window rejects stale **and** future-dated; mandatory idempotency key; no keyless mode; `DRY_RUN` never performs. | SHIPPED (harness) | `npm run webhook` · [`packages/webhook`](../packages/webhook) |
| **X402/1 harness** | Canonical 402 challenge; no price — none, zero or unlocked — opens a payment gate. | SHIPPED (harness) | `npm run x402` · [`packages/x402`](../packages/x402) |
| **CG-CS/1 conformance suite + CG-CR/1 report** | Machine-readable conformance report; `badgeIssuers: 0`. | SHIPPED | `npm run ladder:conformance` · `npm run conformance:report` · [JSON](conformance-report.json) |
| **CG-IR/1 replay lab** | Replays a bundle through L0–L3; no partial credit. | SHIPPED | `npm run integration:replay` |
| **CG-PJ/1 partner journey** | Ten integration legs over one bundle; a clean journey is `MATCH`, not `VERIFIED`. | SHIPPED | `npm run partner:journey` |
| **CG-RG/1 release gate** | 18 legs, and the gate audits its own source; a leg that proves nothing is `FAIL`. | SHIPPED | `npm run release:gate` · `npm run release:gate:independence` · [JSON](release-gate.json) |
| **CG-BDG/1 badge system** | Re-derives every badge digest from its record byte-for-byte. Owner issuance gate: `npm run badge --issue --record <file> --i-am-the-owner-and-competent-to-issue` mints ISSUED artwork ONLY from a committed 6/6 CG-CS/1 record; specimens ship `NOT ISSUED` (issuerCount 0). | SHIPPED · issuance gate **LIVE** | `npm run badge:verify` · [registry](badge-registry.json) · [spec](badge-system-2026-09-26.md) |
| **CG-CL/1 claims registry** | 28 claims derived from committed sources, one status each; `claims:audit` fails if a `VERIFIED` claim has no evidence. | SHIPPED | `npm run claims` · `npm run claims:audit` · [JSON](claims-registry.json) |
| **Observability sink** | Local event sink self-check. | SHIPPED | `npm run observability` |
| **Adoption ladder + control plane** | Integration registry, evidence passport, adoption dashboard, risk findings, reputation. Reputation = recorded external milestones only (today 0). | SHIPPED (external counters 0) | `npm run ladder:status` · `npm run ladder:dashboard` · `npm run ladder:findings` · `npm run ladder:reputation` |
| **Platform quickstart** | Three-verb integration path: `commit` / `capture` / `verify`. | SHIPPED | `npm run quickstart` · [`examples/platform-quickstart`](../examples/platform-quickstart) |

```text
npm run verify:levels
npm run integration:states
npm run partner:sandbox
npm run passport:v2
npm run webhook
npm run x402
npm run conformance:report
npm run quickstart
```

---

## 6. Trust, proof & release discipline (the honesty layer)

| Product / surface | What it does | Status | Entry point |
|---|---|---|---|
| **Boundary audit** | Fails the build on prohibited claim/credential patterns; reports the exact file and line. | SHIPPED | `npm run boundary:audit` |
| **Release gate + independence proof** | 18 legs; self-audits its own source; zero-denominator = failure. | SHIPPED | `npm run release:gate:independence` |
| **canonical measured state** | One machine-measured snapshot; `npm test` enforces the suite total against it. | SHIPPED | [`state-snapshot.json`](state-snapshot.json) · `node scripts/current-state.mjs --check` |
| **STATUS.md** | The reviewer's single source of truth, row-bound to the committed artifacts. | SHIPPED | [STATUS.md](STATUS.md) |
| **Release freeze records** | Byte-exact, commit-anchored freeze records with per-file SHA-256 and reachability checks. | SHIPPED | [`release/freeze/`](../release/freeze) |
| **Surface liveness** | Proves every public surface answers before it is cited. | SHIPPED | `node scripts/surface-liveness.mjs --self-check` |
| **Pages settle guard** | Push-time guard that pins the Pages build to the commit whose build must finish. | SHIPPED | [`.githooks/pre-push`](../.githooks/pre-push) |

---

## 7. Live pages & demos

| Surface | What runs there | Link |
|---|---|---|
| **Playground** | Job-economy cycle with the real committed engine. | [PLAYGROUND.html](PLAYGROUND.html) |
| **AIE-1 review** | Paste a bundle or click honest / tamper / structural-refusal. | [AIE-1-REVIEW.html](AIE-1-REVIEW.html) |
| **DDE API reference** | Real DDE/1 handler embedded; captured wire statuses. | [DDE-API-REFERENCE.html](DDE-API-REFERENCE.html) |
| **DDE SDK reference** | Four-scenario release law in-page. | [DDE-SDK-REFERENCE.html](DDE-SDK-REFERENCE.html) |
| **Delivery-dispute demo** | Nine documented event walk. | [DELIVERY-DISPUTE-DEMO.html](DELIVERY-DISPUTE-DEMO.html) |
| **Governance dashboard** | Bilingual governance board with payment gate. | [GOVERNANCE-DASHBOARD.html](GOVERNANCE-DASHBOARD.html) |
| **DDE perf + trend** | CI-measured budgets, medians and full history. | [DDE-PERF.html](DDE-PERF.html) · [DDE-TREND.html](DDE-TREND.html) |
| **Gate 4.1 visual** | On-chain identity anchor through the evidence chain (AR + EN). | [AR](coreguard-gate41-visual.html) · [EN](coreguard-gate41-visual-en.html) |
| **Core DApp surface** | Core-branded identity / plans / treasury / on-Core view. | [coreguard-dapp-core.html](coreguard-dapp-core.html) |
| **Site index** | Entry point for all live surfaces. | [index.html](index.html) |

---

## 8. Services (defined, not sold)

The protocol is MIT and open — that is the trust surface. The services below are
**defined and buildable**, but **none has been sold, priced or delivered**.
Revenue is **$0**. This section exists so a counterparty can see the shape of an
engagement without any invented traction.

| Service | What a buyer would get | Status |
|---|---|---|
| **Verification run** | Reproducible verification of one delivery against pinned acceptance criteria → ADAL/1 dispute-ready record. | **NOT SOLD** · no price committed |
| **Dry-run adapter maintenance** | Keep an external surface mapping current: schema updates, webhook consumer, packet integrity pre-checks. | **NOT SOLD** · no retainer signed |
| **Reference-tribunal tooling** | License the fail-closed simulator as a conformance reference. | **NOT SOLD** |
| **AIE-1 incident-review engagement** | One org adopts the review surface for one real or tabletop review; reviewers replay from a cold clone. | **NOT SOLD** · surface shipped, no party contacted |
| **Settlement-boundary SDK** | Refuse settlement without a verifying award signature + authority-bound credential; never holds keys. | **NOT BUILT** (v0.2+ design) |
| **Custom integration** | Embed the gate into a platform's payout flow. | **NOT SOLD** · template exists |

Commercial framing and the guardrails:
[commercial-packaging-2026-09-26.md](commercial-packaging-2026-09-26.md) ·
[pricing.md](pricing.md) · [revenue-path-2026-09.md](revenue-path-2026-09.md) ·
[FUNDING.md](FUNDING.md).

---

## 9. Explicitly gated / not built / research

| Item | Honest state |
|---|---|
| **Testnet2 live campaign (chain 1114)** | `PREPARED / FUNDING-BLOCKED`; operator wallet holds `0 tCORE2`; **no live broadcast made**. |
| **npm publish of the 13-package closure** | **GATED**; the package is not on the public registry (`E404`). Local install/tests work. |
| **Published pricing** | **LOCKED** behind the Decision Gate (Counterparty #1). Every output stamps `gated: true`. |
| **Live external integration (People's Court / ElizaOS / any platform)** | **NONE**. Adapters are `DRY_RUN` until a recorded confirmation exists. |
| **Badge issuance** | Owner gate **LIVE**: `npm run badge --issue --record <file> --i-am-the-owner-and-competent-to-issue` mints self-verifying ISSUED artwork from a committed 6/6 record only; specimens ship `NOT ISSUED` (issuerCount 0). |
| **Settlement / escrow / custody** | **NOT AUTHORIZED**; reference only, `deployed:false`; no keys held. |
| **ZK privacy proofs (L4)** | **RESEARCH**. |
| **Revenue / customers / partnerships / funding** | **$0 / 0 / 0 / none claimed**. |
| **Third-party security audit / certification** | **NOT PERFORMED**; never claimed. |

---

## 10. Evaluate in one minute

```text
git clone https://github.com/EslaM-X/coreguard.git
cd coreguard
npm install
npm test            # full suite, enforced against the measured snapshot
node demo.mjs       # UNKNOWN -> HELD, no key, no network
npm run claims:audit
npm run release:gate:independence
```

Then open <https://eslam-x.github.io/coreguard/PLAYGROUND.html> and
<https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html>.

**Contact:** open an issue or PR on
[github.com/EslaM-X/coreguard](https://github.com/EslaM-X/coreguard).

---

## الملخص بالعربية

هذه الصفحة فهرس كامل لكل ما يوجد فعليًا في المستودع: بروتوكول إيصال التنفيذ
(CGEP/1)، محرك التحقق المستقل بثلاث لغات، جدار الحماية التنفيذي وSDK، طبقة
الدليل والنزاع (DDE/1) ومحوّل People's Court (تجريبي فقط)، بدائيات اقتصاد
الوظائف (ميزانية مغلقة عند النشر، قبول موقّع، بوابة x402 تُبقي `UNKNOWN`
معلّقًا، وسجل رفض بلا أسرار)، منصة التحقق والتكامل، وطبقة الصدق (سجل الادعاءات،
الشارات غير الصادرة، بوابة الإصدار).

**أرقام حقيقية مقاسة:** الإيراد **$0** · العملاء **0** · الشراكات **0** ·
الأسعار **مقفلة** · لا نشر على Testnet2 · لا نشر npm · لا تكامل خارجي حي ·
لا شهادات أمنية. كل صف هنا يقابله ملف أو أمر قابل للتشغيل، والادعاءات تُفحص
آليًا عبر `npm run claims:audit`.

الصفحة ثنائية اللغة: [PRODUCTS.html](PRODUCTS.html).
