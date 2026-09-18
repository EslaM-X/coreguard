# CoreGuard Assurance Specification v1

**Document**: `COREGUARD-ASSURANCE-SPEC.md` · Version `1.0.0` · Status: **NORMATIVE for Gate 4.1**
**Applies to**: `coreguard-assurance/` engine v2.0.0+ (engine v1.0.0 is superseded by this spec,
not invalidated — see §10 and §11).
**Decision this spec encodes (owner, 2026-09-18): CONDITIONAL NO-GO — Mainnet broadcast NOT AUTHORIZED.**

---

## 1. الرؤية والهدف (Vision)

CoreGuard Gate 4.1 يتطور من "أداة تحقق" (PowerShell + PASS/FAIL) إلى **نظام حوكمة أمني احترافي**
(Assurance Platform): قابل للتدقيق، واضح بصريًا، صعب التلاعب، وقابل لإعادة الإنتاج بواسطة طرف مستقل.

**الهدف ليس أن ينجح البث بأي ثمن.** الهدف أن يكون قرار البث — approving أو rejecting —
**قابلًا للإثبات والمراجعة والرفض الآمن**.

---

## 2. المعمارية الطبقية (Layered Architecture)

```
+---------------------------------------------------------------+
| Evidence Layer      hashes · manifest · immutable evidence     |
|                     bundle · freeze discipline                 |
+---------------------------------------------------------------+
| Verification Layer  AST · policy engine · negative tests ·     |
|                     reproducible checks · schema-validated     |
|                     structured findings                        |
+---------------------------------------------------------------+
| Independent Review  second reviewer · H1-H8 matrix · evidence  |
| Layer               reconciliation · signed sign-off           |
+---------------------------------------------------------------+
| Authorization Layer C7 · C8 · C9 · explicit owner GO (scoped,  |
|                     dated, revocable)                          |
+---------------------------------------------------------------+
| Execution Boundary  separate, reviewed, human-controlled       |
|                     signing and broadcast process              |
+---------------------------------------------------------------+
```

**قاعدة الفصل الأساسية (S1)**: الطبقات منفصلة بحيث لا تصبح أداة التحقق نفسها هي الجهة
التي تمنح الإذن لنفسها. محرك الـ assurance:
- لا يملك مفاتيح ولا يقرأ أسرارًا ولا ينشئ توقيعات.
- لا يرسل معاملات ولا ينفذ `cast send` ولا `eth_sendRawTransaction`.
- لا يملك صلاحية تغيير حالة GO — مهما كان عدد اختباراته الناجحة.

**قاعدة الأهلية (S2)**: القرار النهائي دائمًا بشري. الأداة تنتج *أدلة*؛ الأدلة لا تُنتج *تفويضًا*.

---

## 3. نموذج النتائج المنظمة (Structured Evidence Model)

كل فحص ينتج **سجلًا منظمًا واحدًا** (finding) — ليس سطر طباعة:

```json
{
  "id": "ENV-003",
  "status": "FAIL",
  "severity": "BLOCKER",
  "ruleVersion": "cg41-policy-v1",
  "description": "cast binary resides within a trusted tool root",
  "failClosed": true,
  "evidence": {
    "path": "C:\\Users\\DeLL-L\\foundry\\cast.exe",
    "trustRoots": ["C:\\Users\\DeLL-L\\.foundry", "C:\\Program Files"],
    "reason": "outside-trust-root"
  }
}
```

### 3.1 قواعد النموذج (M1–M7)

- **M1 — منع تكرار المعرفات**: أي `id` يُصدر مرتين يولد فورًا finding `META-001`
  (FAIL/BLOCKER/fail-closed) ويفشل التشغيل كله.
- **M2 — الحالة تُحدد داخل محرك النتائج فقط**: لا يجوز لأي مكوّن خارجي (تقرير، HTML،
  نص ختامي) تغيير حالة فحص. أي عدم تطابق بين ملخص التقرير وقائمة الـ findings يُكتشف بـ SCHEMA-001.
- **M3 — SKIPPED غير موجود ولا يساوي PASS**: الفحص إما نُفّذ بإحدى الحالات الخمس،
  أو لم يُقيَّم أصلًا ويظهر كـ `INCONCLUSIVE (rule-not-evaluated)`.
- **M4 — لا حذف لأدلة الفشل**: كل finding يبقى في التقرير بأدلته الكاملة.
- **M5 — لا كتابة فوق تقرير قديم دون إصدار جديد**: محرك v2.0.0 يرفض الكتابة فوق
  `verification-report.json` لإصدار محرك أقدم (`supersedesVersion` guard — SCHEMA-002).
- **M6 — fail-closed افتراضي**: قاعدة بلا `failClosed` تُعامل كـ fail-closed. فحص
  fail-closed بحالة غير PASS يمنع أي انتقال للأمام ويجعل exit code = 1.
- **M7 — كل ادعاء له دليل**: كل حقل `evidence` قابل لإعادة الحساب من القرص بواسطة طرف مستقل.

### 3.2 المفردات المغلقة للحالات (Closed Status Vocabulary)

| الحالة | المعنى الدقيق |
|---|---|
| `PASS` | الشرط تحقق **بالأدلة** (evidence-backed) |
| `FAIL` | الشرط **لم يتحقق** — يُسجل بالأدلة، لا يُخفى |
| `BLOCKED` | **لا يمكن الاستمرار بأمان** (مدخل ناقص/بيئة غير آمنة) |
| `INCONCLUSIVE` | **الأدلة غير كافية** لحسم الحالة |
| `NOT_APPLICABLE` | الفحص **غير منطبق** مع سبب موثق |

حالات محظورة: `SKIPPED`، `OK`، `WARN`، `VERIFIED` (محجوزة للـ receipts فقط)، وأي قيمة خارج
الجدول — schema يرفضها fail-closed.

### 3.3 مستويات الخطورة

`BLOCKER > MAJOR > MINOR > INFO`. أي finding بحالة غير PASS وخطورة `BLOCKER` يجعل
الحالة الكلية `BLOCKED` بغض النظر عن عدد الـ PASS.

---

## 4. قواعد الصياغة (Wording Rules) — ملزمة

| مسموح | محظور |
|---|---|
| "لم يتم اكتشاف مسار محدد وفق قواعد التحليل والإصدار الحالي" | "لا يوجد أي مسار بث" |
| "هذا ليس إثباتًا لغياب كل مسار بث" | "أثبتنا عدم وجود أي باب خلفي" |
| "الأداة تفرض الحاجز ضمن نطاق تحليلها" | "الأداة تضمن الأمان الكامل" |
| "evidence reported" | "evidence independently verified" (إلا بتوقيع مراجع مستقل) |

كل ادعاء في التقرير والـ HTML والسجلات يلتزم بصياغة الـ claim المقيّدة في §7.

---

## 5. محرك السياسات المستقل (Independent Policy Engine)

القواعس تعيش في ملفات JSON **versioned** — لا داخل السكربت:

```
policy/
  coreguard-policy-v1.json            catalog: id · severity · failClosed · description
  allowed-rpc-methods.json            read-only RPC allow-list + forbidden patterns
  trusted-tool-roots.json             roots + fail-closed ENV-003 semantics
  forbidden-execution-patterns.json   exec/net/dynamic/legacy/secret classification
  policy-lock.json                    SHA-256 of every policy file (drift guard)
```

كل سياسة تحمل `policyId` و`version` و`effectiveDate` وسبب كل قاعدة. **تغيير السياسة حدث
قابل للمراجعة** (hash يتغير → POL-001 يفشل → إصدار قفل جديد موثق)، وليس تعديلًا خفيًا في الكود.

### 5.1 مستويات التحليل (A1–A5)

- **A1 — AST enumeration**: حصر الاستدعاءات (exec/net/dynamic/type refs) وكل موقع مع مالكه.
- **A2 — Data-flow review**: تتبع مصادر الأوامر والوسائط (معالج يدوي/مستقل حاليًا).
- **A3 — Control-flow review**: الحواجز (guards) تُطبق قبل كل مسار حساس (محلل بنيوي + يدوي).
- **A4 — Indirect invocation checks**: المتغيرات، scriptblocks، الأعضاء الديناميكيون (آلي).
- **A5 — Manual review**: الحالات التي لا يستطيع التحليل الآلي إثباتها — بند H7.

---

## 6. فصل التحقق عن التوقيع (Verification/Signing Separation)

أداة `gate-4.1-verify.ps1` ومحرك `cg-assurance-verify.ps1`:
1. لا يملكان مفاتيح ولا يقرآن أسرارًا.
2. لا ينشئان توقيعات ولا معاملات.
3. لا ينفذان `cast send`.
4. لا يملكان صلاحية تغيير حالة GO.

أي مكوّن موقّع مستقبلًا: منفصل تمامًا + مراجعة مستقلة + موافقة بشرية صريحة + حدود زمنية +
سجل تدقيق + منع التشغيل التلقائي + لا كلمات مرور plaintext دائمة + لا مفتاح على command line.
الأفضل أمنيًا عند الحاجة: محفظة/جهاز توقيع أو آلية أسرار مؤسسية معتمدة — **بعد** مراجعة منفصلة.

---

## 7. الادعاء المقيّد (Bounded Claim — إلزامي حرفيًا)

> "Under the current rule set (AST enumeration of command invocations, .NET type
> references, dynamic-invocation forms, control-flow ownership, and the RPC
> allow-list), NO execution or network path was found beyond the enumerated
> sites. This is NOT a proof of absence of such a path."

---

## 8. البوابات C7 / C8 / C9

### C7 — Toolchain & Signing Readiness (مصفوفة رسمية)

| المطلب | الدليل | المراجع | الحالة |
|---|---|---|---|
| موثوقية cast | المسار + SHA-256 + مصدر التثبيت (خارج الأداة) | مستقل | مفتوح |
| إدارة الأسرار | تصميم معتمد (لا plaintext دائم، لا مفتاح في argv) | أمني | مفتوح |
| RPC allow-list | سياسة + اختبار سلبي | مستقل | مفتوح |
| عدم استخدام legacy | AST + مراجعة يدوية | مستقل | مفتوح |

الحالة المعتمدة: **PARTIAL** — لا تُغلق إلا بموجب بروتوكول Phase C (قرار المالك).

### C8 — Independent Review (المراجع لا يكتفي بتشغيل الأداة)

المراجع المستقل: يبدأ من الملفات الفعلية؛ يعيد حساب الهاشات بنفسه؛ لا يعتمد على تقرير
المؤلف وحده؛ يعيد تشغيل الاختبارات؛ يفحص الحالات التي قد تفشل فيها الأداة نفسها؛ يسجل
الملاحظات والاستثناءات؛ يوقع كل بند H1–H8؛ **ويوضح ما لم يتمكن من إثباته**.
البروتوكول: `reviewer-signoff/H1-H8.md`. التوقيع: `reviewer-signoff/SIGNOFF.md`.

### C9 — Owner Authorization

C9 ليست نجاحًا فنيًا: هوية المالك وصلاحية القرار + اعتماد صريح ومؤرخ + نطاق محدد +
شروط إلغاء واضحة + عدم اعتبار الموافقة القديمة موافقة جديدة + **فصل موافقة GO عن تنفيذ البث**.
الحالة المعتمدة: **PENDING**.

---

## 9. معايير النجاح الحقيقية (Success Criteria)

1. **Correctness** — النتائج تعكس الواقع (كل PASS له دليل قابل لإعادة الحساب).
2. **Fail-closed** — الفشل يمنع الانتقال (exit 1 + BLOCKED + لا إذن).
3. **Reproducibility** — مراجع آخر يعيد نفس النتيجة من نفس المدخلات.
4. **Traceability** — كل نتيجة لها دليل.
5. **Separation of duties** — المؤلف ليس المراجع الوحيد.
6. **Least privilege** — أدوات التحقق لا تمتلك صلاحيات البث.
7. **Auditability** — كل تغيير قابل للتتبع (hashes + lock + supersedes).
8. **Honest reporting** — لا ادعاءات أوسع من الأدلة (§4, §7).

**عدد الـ PASS لا يعطي GO.** الفشل الحاجز واحد + بوابات مفتوحة = CONDITIONAL NO-GO.

---

## 10. بوابات القرار النهائية (Decision Gate)

لا يُعاد تقييم GO إلا إذا تحققت **كل** الشروط:
1. C7 = PASS موثق ومستقل.
2. C8 = PASS بتوقيع مراجع مستقل (H1–H8 كاملة).
3. C9 = PASS باعتماد المالك الصريح والمؤرخ.
4. V06/ENV-003 = PASS (بعد معالجة بيئة الأدوات بروتوكول Path 2) **أو** موافقة رسمية على
   إبقائه FAIL مع عدم السماح بالإطلاق (Path 1 — الحالة الحالية).
5. جميع الهاشات معاد حسابها من القرص ومطابقة.
6. المانيفست مطابق 100%.
7. الاختبارات السلبية تفشل بطريقة fail-closed.
8. لا ملفات أسرار غير معتمدة.
9. لا مسارات legacy غير معالجة.
10. موافقة GO صريحة ومنفصلة — **ليست مستنتجة من نجاح الاختبارات**.

إذا فشل أي شرط → **CONDITIONAL NO-GO — MAINNET BROADCAST NOT AUTHORIZED**.

---

## 11. مسار V06 (مساران مقبولان — يوثق اختيار أحدهما)

- **Path 1 (المعتمد حاليًا) — الإبقاء على الفشل**: V06/ENV-003 يبقى FAIL fail-closed
  موثقًا؛ لا مرحلة موقّعة؛ التشغيل الحالي غير صالح للإطلاق. نقل `cast.exe` قد يكون إجراءً
  لاحقًا مستقلًا لكنه ليس مبررًا لتجاوز الفشل أو الانتقال للمرحلة الموقّعة.
- **Path 2 — معالجة بيئة الأدوات (مسموح لاحقًا، لا يفتح شيئًا تلقائيًا)**: تثبيت نسخة
  موثوقة من cast داخل جذر ثقة معتمد + التحقق من المصدر/النسخة/الهاش خارج الأداة + إعادة
  تشغيل ENV-003/ENV-002 + مراجعة مستقلة لمسار الثقة. نقل الملف وحده ليس دليلًا كافيًا على سلامته.

---

## 12. إصدارات المحرك والتجميد (Engine Versions & Freeze)

| الإصدار | الملف | الحالة |
|---|---|---|
| v1.0.0 | `release/archive/cg-assurance-verify-v1.ps1` + مخرجاته المؤرشفة | مجمّد — superseded by this spec؛ سجل مرجعي |
| v2.0.0 | `verification/cg-assurance-verify.ps1` | الحالي — يطبق هذه المواصفة |

- **F1 — تجميد العناصر الأصلية**: `reviews-extra/gate-4.1-verify.ps1`,
  `-report.json`, `-selftest.tap`, `-results.txt`, `-redesign-note.txt`,
  `cg41-c9-c7-closure-kit.ps1`, `coreguard/reviews/gate-4.1-final-hashes.txt`,
  `coreguard/reviews/gate-4.1-broadcast-review.md` — قراءة فقط، لا تعديل.
- **F2 — أرشفة المخرجات v1**: نسخ byte-identical من مخرجات v1.0.0 في
  `release/archive/` مع خريطة `archive-map.json` (الأصلي والنسخة نفس الهاش).
- **F3 — الانحراف الموثق**: `gate-4.1-verify-results.txt` (244,247 بايت) لا يطابق الهاش
  المسجل سابقًا `0x3ea32a8c…` — يوثق كـ **DRIFT-001** في `verification-drift-map.json`.
- **F4 — supersedes guard**: المحرك v2.0.0 يرفض الكتابة فوق تقرير صادر بإصدار أقدم (M5).

---

## 13. اختبارات سلبية إلزامية (Negative Tests — must fail fail-closed)

المجموعات الثماني: Integrity · Identity · RPC safety · Execution safety · Policy ·
Report integrity · Environment · Recovery — المسجلة في `release/negative-tests.json`
مع النتائج القابلة لإعادة التشغيل. أي سيناريو سلبي يمر "بنجاح" = خلل fail-closed = فشل التشغيل.

---

## 14. أعلام القرار الإلزامية (Decision Flags — في كل تقرير وHTML)

```
C7 = PARTIAL ; C8 = PENDING ; C9 = PENDING
ENV-003/V06 = FAIL-CLOSED (documented)
CONDITIONAL NO-GO
SIGNING = NOT AUTHORIZED
COMMITINTENT = NOT AUTHORIZED
ANCHORPROOF = NOT AUTHORIZED
MAINNET BROADCAST = NOT AUTHORIZED
```

نجاح أي عدد من الفحوص لا يغيّر هذه الأعلام إلا عبر بوابة §10.

---

*نهاية المواصفة — CoreGuard Assurance Specification v1.0.0 (2026-09-18).*
