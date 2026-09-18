# Failure Classification — Assurance Release Candidate v4.2.1
**Gate 4.1 · CoreGuard Assurance Platform · تصنيف الإخفاقات الثلاثة**
**Status: CONDITIONAL NO-GO — MAINNET BROADCAST NOT AUTHORIZED**
**Compile date: 2026-09-18 · Owner decision reference: تعليمات المالك (الخطوة 3 الإلزامية)**

---

## القرار الرسمي لتصنيف كل إخفاق

> هذه ليست "وصف مقصود" — كل إخفاق خضع للتصنيف الخمسي الإلزامي:
> (أ) هل هو Blocker؟ (ب) هل هو Documented Exception؟ (ج) هل توجد معالجة مقبولة؟
> (د) من يملك صلاحية قبول الاستثناء؟ (هـ) هل يتطلب مراجعة أمنية إضافية؟

---

## 1) ENV-003 — `cast.exe` خارج جذر الثقة

| البند | التصنيف |
|---|---|
| **Classification** | **BLOCKER (documented, fail-closed, no waiver)** |
| **Evidence** | `cast.exe` في `C:\Users\DeLL-L\foundry\cast.exe` — خارج جذور الثقة المعتمدة (`C:\Users\DeLL-L\.foundry`) |
| **Is it a Blocker?** | **نعم — Blocker صريح.** يمنع أي انتقال لمسار موقّع أو بث. |
| **Is it a Documented Exception?** | **لا.** لا استثناء — هو فشل صحيح fail-closed من المحرك. محاولة "قبوله" كاستثناء تعني تعطيل الحماية نفسها. |
| **Is there an accepted remediation?** | نعم — **مسار V06-2 فقط** (تثبيت cast موثوق داخل جذر الثقة + تحقق مصدر/نسخة/هاش خارج الأداة + إعادة تشغيل V06/V07 + مراجعة مستقلة لمسار الثقة). نقل الملف وحده **غير كافٍ** (المواصفة §8). |
| **Who owns exception acceptance?** | **لا أحد.** لا استثناء يُقبل. قرار المعالجة (تشغيل مسار V06-2) يملكه **المالك حصرًا** — وليس أدوات التحقق ولا المؤلف. |
| **Does it need extra security review?** | **نعم** — أي تثبيت cast جديد يتطلب مراجعة مستقلة لمسار الثقة قبل إعادة التقييم (المواصفة §8). |
| **Blocker for what?** | يمنع: SIGNING · COMMITINTENT · ANCHORPROOF · MAINNET BROADCAST. **لا يمنع:** إكمال المراجعة المستقلة C8، إغلاق C7 التوثيقي، ولا عمل Assurance الداخلي. |
| **Current state** | **FAIL-CLOSED · DOCUMENTED · NO WAIVER** |

---

## 2) SELF-002 — ثغرة مؤشر تقدم Self-test

| البند | التصنيف |
|---|---|
| **Classification** | **OPEN DEFECT — tracked, non-launch-blocking, must be fixed in next release (v4.2.2)** |
| **Evidence** | أداة `SelfTest` تعرض 19 سطرًا بدلًا من 20 — آخر سطر (الإجمالي) لا يُطبع إلى stdout قبل انتهاء السكربت. |
| **Is it a Blocker?** | **لا.** العيب في *عرض التقدم* فقط — لا في منطق الفحص. |
| **Is it a Documented Exception?** | **لا.** هو عيب مفتوح (open defect) — ليس استثناء مقبول. |
| **Is there an accepted remediation?** | نعم — إصلاح برمجي في v4.2.2: إضافة `Write-Progress` نهائي (hoisting) يعرض حالة الإجمالي قبل خروج السكربت. |
| **Who owns exception acceptance?** | لا استثناء يُقبل — لكن العيب **لا يحجب تسليم حزمة C8** لأنه تجميلي (cosmetic) ولا يؤثر على صحة النتائج أو على قدرة المراجع المستقل على التحقق. |
| **Does it need extra security review?** | **لا.** لا يوجد أي تأثير أمني — منطق الفحص سليم؛ فقط عرض التقدم. |
| **Blocker for what?** | **لا يحجب** أي بوابات. عيب عرضي مفتوح، يجب إصلاحه قبل v4.2.2. |
| **Current state** | **OPEN DEFECT · TRACKED · FIX IN v4.2.2** |

---

## 3) LEG-001 — مسار legacy يستخدم `--private-key`/`cast send`

| البند | التصنيف |
|---|---|
| **Classification** | **BLOCKER (documented, fail-closed, no waiver) — scope-limited** |
| **Evidence** | أنماط `--private-key`/`cast send` في سكربتات قديمة (`gate-3.x`, `evidence-registry-phase3.ps1`, `anchor-local.ps1`) — تُكتشف وتُرفض من المحرك الحالي. |
| **Is it a Blocker?** | **نعم — Blocker صريح** لأي مسار بث يمر عبر تلك السكربتات. المحرك يرفضها fail-closed وهذا صحيح. |
| **Is it a Documented Exception?** | **لا.** السكربتات القديمة نفسها **ليست جزءًا من حزمة الإصدار المجمّد** — اكتشافها هو عمل المحرك كما صُمّم. لا استثناء يُمنح للسكربتات؛ إما تُعالج أو تبقى خارج نطاق أي إطلاق. |
| **Is there an accepted remediation?** | نعم — إما **حذف/أرشفة** السكربتات legacy، أو **إعادة كتابتها** وفق السياسة الحالية (بلا `--private-key`، عبر آلية أسرار معتمدة)، ثم إعادة التشغيل القياسي وإثبات اختفاء LEG-001. |
| **Who owns exception acceptance?** | **لا استثناء يُقبل.** قرار المعالجة (حذف أم إعادة كتابة) يملكه **المالك حصرًا**. المستقل لا يملك صلاحية إسكات الفحص. |
| **Does it need extra security review?** | **نعم** — أي إعادة كتابة لمسار يتعامل مع مفاتيح تتطلب مراجعة أمنية منفصلة (المواصفة §7: الفصل بين التحقق والتوقيع). |
| **Blocker for what?** | يمنع: إغلاق C7 (بند "عدم وجود مسارات legacy غير معالجة")، وأي SIGNING/BROADCAST. **لا يمنع:** مراجعة C8 على الحزمة الحالية (المحرك نفسه نظيف — التحليل الثابت يمر). |
| **Current state** | **FAIL-CLOSED · DOCUMENTED · NO WAIVER · REMEDIATION PATH DEFINED** |

---

## ملخص التصنيف الثلاثي (السجل الرسمي)

| الفحص | الحالة | التصنيف | يحجب الإطلاق؟ | يحجب C8؟ | صاحب القرار |
|---|---|---|---|---|---|
| **ENV-003** | FAIL-CLOSED | **BLOCKER — no waiver** | **نعم** | لا | المالك (مسار V06-2 فقط) |
| **SELF-002** | OPEN | **DEFECT — cosmetic** | لا | لا | المؤلف (إصلاح v4.2.2) |
| **LEG-001** | FAIL-CLOSED | **BLOCKER — no waiver** | **نعم** | لا | المالك (حذف/إعادة كتابة) |

> **قاعدة ملزمة:** الإخفاقان BLOCKER لا يتحولان إلى PASS تلقائيًا، ولا يكفي وصفهما بأنهما "مقصودان".
> كل منهما يحمل مسار معالجة محددًا وصاحب قرار محددًا، ويبقى fail-closed حتى تُغلق معالجته
> وتُوثّق بمراجعة مستقلة. أي "GO" مستقبلًا يتطلب إما إصلاحهما أو موافقة رسمية صريحة
> على إبقائهما FAIL **مع منع الإطلاق نهائيًا** (بوابة المواصفة §10).

**Status unchanged: CONDITIONAL NO-GO — MAINNET BROADCAST NOT AUTHORIZED.**
