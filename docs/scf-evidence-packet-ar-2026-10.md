# CoreGuard — حزمة أدلة جائزة SCF 150K (2026-10)

> **الحالة: جاهزة · مقاسة — من الشجرة الملتزمة فقط.**
> هذه الحزمة هي ملف التقديم الجاهز لأدلة الجائزة (المنحة/التمويل) لمسيرة التنفيذ
> (Execution-Truth) — رسالة الجائزة 150K لمؤسسة Stellar / Core DAO / Pi Network.
> لا تثبت شيئًا بالسرد؛ كل رقم أدناه مقاس آليًا، وقابل لإعادة التشغيل من clone نظيف،
> ومُنفَّذ في CI.

---

## 1) الأدلة المقاسة (المصادر الموثوقة)

| المطلب / الادعاء | القيمة المقاسة | المصدر |
|---|---|---|
| مجموعة الاختبارات | **1405 / 1405 PASS** · 0 فشل · 0 انحراف | `docs/state-snapshot.json` (`testsTotal`) · `scripts/run-tests.mjs` |
| تدقيق الحدود | **955 ملفًا مسحًا · 0 انتهاكات · CHECK PASS** | `docs/state-snapshot.json` (`boundaryAudit`) · `scripts/boundary-audit.mjs` |
| عقد التوثيق للوثائق | **105 منفذة · 66 مدرجة للاستبعاد · 22 وثيقة مغطاة** | `docs/state-snapshot.json` (`docsNode`) · `test/ci/docs-node-contract.test.js` |
| تدقيق الادعاءات (CG-CL/1) | **28 ادعاءً · 16 VERIFIED · 0 انتهاكات** | `docs/claims-registry.json` · `scripts/ladder/claim-registry.mjs --audit` |
| بوابة الإصدار (CG-RG/1) | **18/18 · GATE_PASS · الاستقلال PASS (18/18 مفحوصة)** | `docs/release-gate.json` · `npm run release:gate:independence` |
| فحص الحالة المقاسة | **CHECK OK** | `node scripts/current-state.mjs --check` |

هوية اللقطة: `measuredAtUtc 2026-10-29T18:44:29Z` · `gitCommit 9fb051a…` · `commitsAheadOfV060 242`.

---

## 2) إعادة التشغيل (نفس السلسلة التي يشغّلها CI كل push)

## 3) سطح الإثبات القاتل (ماذا يشتريه هذا التمويل 150K)

1. **الحقيقة التنفيذية القابلة للتسلسل (CGEP/1 + L2)**: الت intent/السياسة → الالتزام → الإيصال؛
   إعادة التشغيل L2 احترافية (سلسلة تدقيق + replayHash + diff + تقرير؛ MATCH لا يتطور من partial، `UNKNOWN → HELD`، احتياط قبل التوقيع).
2. **حد DDE بين التنفيذ والنزاع**: الأدلة التنفيذية لا تحدد المطابقة؛ بوابة الدفع تبقى محبوسة حتى
   قبول الطرف؛ التلاعب → رفض.
3. **حزمة الأدلة EVP/1**: `scripts/make-evidence-package.mjs` → `EVP_OK` · 11/11.
4. **العرض التقديمي القاتل**: `npm run demo:90s:killer` (السكربت العام)، `npm run demo:90s` (المسجل)،
   `npm run demo:90s:live` (إعادة-استدلال قراءة فقط من Core Mainnet).
5. **قاتل الشبكات**: Core DAO (`@coreguard/coredao-killer`)، Stellar (`@coreguard/stellar-killer` + `@coreguard/stellar-agent`)، Pi (`@coreguard/pi-killer`)؛
   بوابة Trinity الموحدة عبر الشبكتين والثلاث.

---

## 4) الحدود الصادقة (بلا مبالغة)

- لم تُنفَّذ أي تحويل أموال؛ لا بث؛ لا إجراء Mainnet وُجّه من قبل هذه الحزمة.
- لا شارة مُصدرة؛ `issuerCount 0`؛ لا تكامل خارجي حي؛ لا تدقيق طرف ثالث.
- العرض التقديمي المباشر للبلايتست (Stellar) شبكة خارجية (Friendbot + Horizon) ومدرج للاستبعاد
  من عقد docs-node بحكم التصميم؛ المعادلة التسلسلية غير المتصلة هي التي تُنفَّذ.

---

## 5) قائمة التقديم لمسيرة الجائزة 150K

- [ ] أعد بناء السلسلة القائمة على الأدلة من clone نظيف (CI أخضر على نفس الـ commit).
- [ ] شغّل حزمة الأدلة وعرض القاتل؛ التقِم المخرجات لتقديمها للجائزة.
- [ ] تأكد من صحة الحدود الصادقة (لا تزوّد ادعاءً غير مدعوم).
