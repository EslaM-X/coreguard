# SCF #46 Interest Form — Answers Ready Pack

**Prepared:** 2026-11-06 · **Deadline:** 2026-11-09 · **Owner actions:** paste/submit externally.
No external submission leaves this repo without a per-step owner sign-off.
**Deep scope source:** `docs/SCF-BUILD-APPLICATION.md` (updated 2026-11-06 with the swap milestone).

---

## 1. Project name

CoreGuard — Verifiable Execution Truth Layer for Stellar and AI-agent payments.

*AR: CoreGuard — طبقة التحقق من مطابقة التنفيذ على ستيلار ومدفوعات وكلاء الذكاء الاصطناعي.*

## 2. Project summary (as written for the form)

CoreGuard ships verifiable execution-conformance evidence: every integrated action (an AI-agent payment, a DEX swap, a dispute filing) carries an authorization that is judged BEFORE submit (policy, allowlist, deadline, size), a deterministic receipt that re-verifies byte-exactly, and a tamper-evident execution record that a third party replays from the public ledger to confirm the action ran as authorized.

Scope that already runs on mainnet: the Soroban commitment anchor contract (deployed 2026-11-04, third-party-listed on stellar.expert), the first owner-authorized anchor CALL (INVOKED, 2026-11-06, tx + ledger recorded below), and — this cycle — the first SIGNED funded swap on the real mainnet XLM/USDC order book, confirmed on-chain after its DEX-GATE preflight verdicts passed.

*AR: بوابة دفع الوكلاء وبوابات DEX مع إثبات مطابقة قابل لإعادة التشغيل؛ العقد والاستدعاء الأول والسواب الموقّع مؤكدة على الشبكة الرئيسية — انظر الفقرة الثامنة.*

## 3. Category

Devtools and infrastructure: execution-conformance verification and dispute-evidence infrastructure for DeFi and AI-agent payments on Stellar.

*AR: أدوات تطوير وبنية تحتية للتحقق من مطابقة التنفيذ على ستيلار.*

## 4. Stage

Production-ready / mainnet-proven — measured, never promised.

*AR: جاهزة للإنتاج ومثبتة عملياً على الشبكات الرئيسية — مقاسة، لا موعودة.*

## 5. Why Stellar

Stellar agent marketplaces, DEXs, and A2A rails need this exact surface, and Stellar's open ledger makes every CoreGuard claim third-party checkable on the wire: anyone can verify the recorded tx hashes, ledgers, and evidence digests from a clean clone, with no API key.

*AR: سجل ستيلار المفتوح يجعل كل ادعاء قابلًا للتحقق من طرف ثالث على السلك ومن استنساخ نظيف بلا مفاتيح.*

## 6. What you will build with the grant

1) Publish the Agent Payment Gate SDK to npm for integrators (our release law is double-gated on the owner's `NPM_TOKEN` Actions secret). 2) Strengthen the People's Court dispute-intake adapter. 3) Expand independent cross-language verifier coverage (Rust/WASM + C verifier) for the next conformance surface.

*AR: 1) حزمة SDK للنشر على npm. 2) تقوية محول People's Court. 3) مُفحِّص مستقل (Rust/WASM + C).*

## 7. Links

- GitHub: https://github.com/coreguard-global/CoreGuard
- Pages: https://coreguard-global.github.io/CoreGuard/
- LinkedIn: https://www.linkedin.com/company/coreguard-global
- X/Twitter: https://x.com/CoreGuardGlobal

## 8. Traction / progress (all machine-measured, 2026-11-06)

- **Test suite:** 1436 / 1436 pass (state snapshot: `docs/state-snapshot.json`; suite-total enforcement bites on drift).
- **Boundary:** 1045 tracked files with 0 violations.
- **Core DAO mainnet:** 2 contracts deployed and verified; 2 MAINNET VERIFIED transactions (see `scripts/verify-live.json`: commitIntent tx 0x0cd2a8…715c, anchorProof tx 0x5b9e7d…78d2).
- **Stellar mainnet anchor:** contract `CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP` deployed 2026-11-04 (stellar.expert-listed); first anchor CALL INVOKED 2026-11-06 — tx `69044807410f65027c1227f4e525ad83f23a6cb1a2bb79790d82849c5dbc9fec`, ledger 65,337,373, on-chain read-back exact.
- **First SIGNED funded swap (this cycle):** `pathPaymentStrictSend` CONFIRMED on the real XLM/USDC order book after both DEX-GATE/1 preflight gates passed VERIFIED — swap tx `ac2a7990b3387aab96b197c0c921d57756bd25d65ad0e75b93561ded640b9097`, ledger 65,338,112; USDC trustline tx `09243337fd04d7ead8e369a8a5d5ef48648179db84608b262d5379f34fa72d76`, ledger 65,338,111; sent 4.0598146 XLM, received 0.6306239 USDC (0.1553331 USDC/XLM); destMin 0.6011661 cleared; the recorded wire read-back equals Horizon's own `fee_charged` to the stroop; evidence: `docs/evidence/stellar-dex-swap-executed.json` (verify: `node scripts/stellar-dex-swap-executed.mjs --verify`).
- **Docs node contract:** 115 documented commands executed / 75 skip-listed / 25 docs covered — the documented-command contract is enforced on every push.
- **Benchmarks:** 10,000-run integrity benchmark (0 false accepts, 0 false rejects); mutation lab 1000/1000 mutants refused.

*AR: 1436/1436 اختبارًا · 1045 ملفًا · 0 مخالفات · عقديان على Core DAO · استدعاء anchor منفذ وswap موقّع مؤكد على شبكة ستيلار الرئيسية.*

## 9. Team

Founder: EslaM-X (CoreGuard Global). The entire shipped surface was built solo so far. After funding: +1 Soroban engineer, +1 security reviewer (per `docs/SCF-BUILD-APPLICATION.md` §6).

*AR: المؤسس: EslaM-X — بعد التمويل: مهندس Soroban + مراجع أمان.*

## 10. Funding ask / budget use

The amount is owner-decided (the repo's claims discipline keeps revenue at $0 until a real milestone entry lands, so no invented figure is quoted here).
**Use of funds (owner-ratified):** a Soroban engineer for the SDK scope, security review and audit of the anchor and gate contracts, pilot integrations with at least one Stellar DEX or agent marketplace, and documentation plus the independent verifier tooling.

*AR: المبلغ قرار للمالك فقط؛ الإيراد المقاس 0$ حتى مُدخل معلم حقيقي.*

## 11. Anything else

Standing claims discipline (binding): every number a form or letter states is machine-measured, reproducible from a fresh clone, and CI-enforced. Nothing beyond verification is ever promised — no funding, trend, wealth, customer, or user claims.

*AR: القاعدة الملزمة: كل عدد مقاس ويعاد إنتاجه من استنساخ نظيف ويفرضه CI.*

---

### Submit checklist for the owner

1. Submit the interest form before **2026-11-09**; paste the EN blocks above (or the short AR lines per field).
2. For budget and roadmap deep fields, copy from `docs/SCF-BUILD-APPLICATION.md`.
3. Nothing external leaves the repo without a per-step owner sign-off — this file is a paste source, not an automatic sender.

*Prepared 2026-11-06 on owner authorization. Hand-written via the write tool only; fence-free by construction (the docs-node contract executes nothing from this file).*
