# بروتوكول الطبقة التحكيمية للحجز والتحكيم للوكلاء (AEA/1) — النسخة العربية

> سجلّ الحدود الحتمي (deterministic) الذي يربط **حزمة نزاع ADAL/1 موثّقة**
> بـ**واجهة حجز مرجعية (escrow reference interface)** و**سطح تقديم للمحكمة
> التحكيمية (tribunal submission surface)** — دون عبور أي حدّ تنفيذ.
>
> **الحالة: تصميم بروتوكول وتطبيق مرجعي داخل هذا المستودع.** لم يُنشر أي
> عقد حجز ولم يُوقَّع، لا يوجد محوّل حي، لا توجد أي مصادقة تنفيذ محتفَظ بها
> أو مُدّعاة. قرار الحوكمة "NO-GO المشروط" بشأن التوقيع/البث دون تغيير. هذه هي
> *الصيغة الجاهزة للتكامل*، وليست تكاملًا.

---

## 1. لماذا طبقة ثالثة

- التنفيذ على السلسلة يثبت أن تحويلًا حدث (**CGEP/1 / الإيصال**).
- حزمة النزاع تجمّد ما ادّعاه كل طرف (**ADAL/1**).
- **AEA/1 يسمّي عقد الحجز الذي يمكن لنشر مستقبلي تنفيذه، ويُشكّل تقديم
  المحكمة الذي يمكن لموفّر تكامل يحمل مصادقة إرساله، ويُبقي كل علم سلطة
  صادقًا (`NOT`).**

إنها الطبقة التي يُبنى عليها الموصلون: مؤلف العقد يقرأ
`escrow-interface.json`; الموفِّر يقرأ قالب `adapter` داخل
`aea1-boundary.json`; المدقّق يقرأ `aea1-hashes.json`.

## 2. الطبقات المنظمة (داخل `aea1-boundary.json`)

| المفتاح | القيمة | من قد يغيّره |
|---|---|---|
| `packageRevision` | بصمة SHA-256 لحزمة النزاع الموثّقة | لا أحد (مثبّتة) |
| `escrow` | `REFERENCE_INTERFACE · deployed:false · chain:"none"` | قرار المالك حصرًا |
| `award` | `UNKNOWN · adjudicator NONE` | فقط محكّم خارجي |
| `settlement` | `NOT_AUTHORIZED · funds NONE_MOVED` | موفِّر تكامل يحمل مصادقة، نطاق منفصل |
| `adapter` | `NOT_BUILT · networkCall NOT_PERFORMED` | الموفِّر، وليس CoreGuard |

## 3. الاستخدام بأمر واحد

```bash
npm run aea1:prepare -- --case <dir> --out <dir>
# أو مباشرة:
node packages/agentic-escrow-arbitration/cli.mjs --case <dir> --out <dir>
```

أكواد الخروج (فشل مغلق fail-closed):

- `0` `AEA1_BOUNDARY_READY` — تم التحقق من الحزمة، وسجلّ الحدود مبني ومثبّت
  وذاتي-التحقق (12 ثابتًا A1–A10)
- `1` فشل أي مرحلة — لا يُطلَق أي شيء قابل للاستخدام
- `2` خطأ استخدام

## 4. القواعد الإلزامية (متحقق منها بنمط الفشل المغلق)

1. **يجب إعادة التحقق من الحزمة.** `prepareAea1` يعيد تشغيل مدقّق حزمة نزاع
   ADAL/1 على البايتات المسلّمة نفسها؛ أي حزمة عابثة أو غير موثقة ترفض قبل
   أي إخراج.
2. **الحجز مرجعي فقط.** `escrow.deployed === false` و `escrow.chain ===
   "none"` و `escrow.kind === "REFERENCE_INTERFACE"`. لا عقد، لا توقيع، لا بث.
3. **حقل الحكم لا يُعبأ مسبقًا أبدًا.** `award.status === "UNKNOWN"`،
   والحكّام `"NONE"`، و `signedReasonedAward === null`.
4. **لا سلطة تسوية.** `settlement.authorizationStatus ===
   "NOT_AUTHORIZED"` و `settlement.funds === "NONE_MOVED"`.
5. **لا محوّل حي.** `adapter.integrationStatus === "NOT_BUILT"` و
   `adapter.networkCall === "NOT_PERFORMED"` و `consumers === []`.
6. **بوابة التسوية مربوطة بالسلطة.** `escrow-interface.json` يذكر قاعدة
   المحكمة الموثقة حرفيًا: *الحكم ≠ التنفيذ*; التنفيذ يتطلب مصادقة محوّل
   تسوية بنطاق منفصل.
7. **الحتمية.** لا `Date.now()`، ولا عشوائية، ولا شبكة; تشغيلان ينتجان
   بايتات متطابقة; كل ملف مثبّت بصمة SHA-256 في `aea1-hashes.json`
   (مستثنى ذاتيًا).

## 5. ما لا يفعله AEA/1 (ملزِم)

- لا يحكم: حقل الحكم يبقى `UNKNOWN`; الحكم الحقيقي هو توقيع محكّم خارجي
  معلِّل فوق بايتات الحزمة.
- لا يسوّي: `NOT_AUTHORIZED`، أموال `NONE_MOVED`، لا مصادقة محتفَظ بها،
  لا شيء يُبث.
- لا يستدعي أي API: `networkCall NOT_PERFORMED`; موفِّر تكامل يحمل المصادقة
  هو من ينفّذ الخطوة الحية.
- لا ينشر عقد حجز. النشر الحقيقي يتطلب قرار المالك الصريح المنفصل.

## 6. واجهة SDK

```js
import { prepareAea1, verifyAea1 } from "@coreguard/agentic-escrow-arbitration";

const r = prepareAea1({ caseDir: "…/reference-A", outDir: "…/out" });
// r.ok · r.stage ("aea1-ready") · r.boundary · r.escrowInterface · r.report · r.hashes

const v = verifyAea1("…/out"); // { ok, checks, failures }
```

## 7. الملفات

| الملف | الدور |
|---|---|
| `packages/agentic-escrow-arbitration/sdk.mjs` | SDK الخاص بـ AEA/1 (`prepareAea1`, `verifyAea1`) |
| `packages/agentic-escrow-arbitration/cli.mjs` | CLI بأمر واحد (`npm run aea1:prepare`) |
| `packages/agentic-escrow-arbitration/schemas/aea1-boundary.schema.json` | مخطط JSON لسجلّ الحدود |
| `test/delivery/agentic-escrow-arbitration.test.js` | اختبارات الفشل المغلق والحتمية والصدق |
| `docs/agentic-escrow-arbitration-standard.md` | مواصفة البروتوكول (AEA/1) — النسخة الإنجليزية |
| `docs/agentic-escrow-arbitration-standard-ar.md` | هذه المواصفة — النسخة العربية |

---

## ملاحظة الصدق (هامة عند الاقتباس)

يُؤكَّد دائمًا ما يلي عند عرض AEA/1 خارج المستودع: لا تكامل حي، لا مصادقة،
لا تسوية، لا حكم، لا بث. ما هو حقيقي وقابل للتحقق: السجلّ الحتمي المثبّت
بايتًا-ببايت، والفشل المغلق عند أي عبث، ورفض الصيحات الصاخبة غير المدعومة
بأدلة. هذه حدود الصدق وليست قيودًا تسويقية.