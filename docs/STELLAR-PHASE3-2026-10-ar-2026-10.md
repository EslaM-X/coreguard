# المرحلة 3 من Stellar — تكامل Soroban حقيقي (testnet)

الحالة: مكتمل (عقد حقيقي منشور ومُستدعى على testnet)  
المحول: SOROBAN/1 (`packages/stellar-soroban/index.mjs`)  
العقد: CG-COMMITMENT-ANCHOR/1 (`soroban/commitment-anchor/`)

## النطاق
- عقد Soroban حقيقي بـ Rust مُترجم إلى WASM ومُضاف كأرتيفاكت
- منشئات لرفع/إنشاء/استدعاء عبر Soroban RPC (خارجية، حتمية)
- رفض mainnet مغلقًا (NOT_AUTHORIZED)
- استخراج معرف العقد من v4 TransactionMeta عبر sorobanMeta.returnValue
- فحوص حية على testnet (تمويل عبر Friendbot، نجح الرفع والإنشاء)
- إضافة عرض توضيحي + اختبارات تكامل

## الأدلة
- WASM: `soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm` (7671 بايت، بادئة sha256 `34fbbba068dff59a`)
- الحزمة: `packages/stellar-soroban/index.mjs`
- الاختبارات: `test/integrations/stellar-soroban.test.mjs`
- العرض: `examples/stellar-gate/demo.mjs` (سكريبت `stellar:gate`)
- العقد: `soroban/commitment-anchor/src/lib.rs`

## سياسة الاستخدام
- اختبار الشبكة فقط (TESTNET). لا مفاتيح/توقيع/بث على mainnet.
- مغلق افتراضيًا. أي عملية تغيير تتطلب مرسلًا صريحًا.
- لا أسرار مخزنة، التوقيع من المتصل لكل استدعاء.

## التحقق
```bash
npm test
npm run boundary:audit
npm run claims:audit
node scripts/current-state.mjs --check
npm run release:gate:independence
```
