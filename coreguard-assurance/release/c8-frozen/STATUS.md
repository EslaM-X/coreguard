# CoreGuard Assurance Platform — v4.2.1 Release STATUS (FROZEN)
**Gate 4.1 · Engine 2.0.0 (schema cg41-report/2) · Spec: docs/COREGUARD-ASSURANCE-SPEC.md v1.0.0 · 2026-09-18**

> **حالة الإصدار: RELEASE CANDIDATE (v4.2.1) — مجمّد بقرار المالك بعد آخر تعديل على المحرك وSTATUS.**
> كل الأدلة والهاشات أدناه أُعيد توليدها **بعد** التجميد من القرص الفعلي، بلا استثناء.
> هذا إصدار مرشح لمراجعة C8 المستقلة — **ليس إصدارًا معتمدًا للبث**.

---

## القرار الملزم (لا يتغير بنجاح أي عدد من الفحوص)

```
C7 = PARTIAL ; C8 = PENDING ; C9 = PENDING
ENV-003/V06 = FAIL-CLOSED (documented, intended)
CONDITIONAL NO-GO
SIGNING = NOT AUTHORIZED
COMMITINTENT = NOT AUTHORIZED
ANCHORPROOF = NOT AUTHORIZED
MAINNET BROADCAST = NOT AUTHORIZED
```

## نتائج هذا الإصدار (كلها معاد إنتاجها في هذا الجهاز 2026-09-18)

| البوابة | النتيجة | الدليل |
|---|---|---|
| Self-test (محرك v2.0.0) | **20/20 PASS** (TAP: `release/selftest.tap`) | ST1–ST20 بما فيها حراس الادعاء والـ input-hashes والحالات المحظورة |
| التشغيل القياسي | **30 PASS / 3 FAIL · BLOCKED · exit 1** (`release/verification-report.json`) | الإخفاقات الثلاثة كلها مقصودة وموثقة (أدناه) |
| الاختبارات السلبية | **17/17 سيناريو fail-closed=True** (`release/negative-tests.json`) | تشمل: kit معدّل، send verb، RPC غير مسموح، allowlist فارغة، استدعاء ديناميكي، git خطير، cast مفقود، هاش cast خاطئ، هاش مانيفست خاطئ، policy-lock مفقود، duplicate id، legacy --private-key، ملف سر، drift map معدّل، drift map مفقود، ادعاء غير مقيّد، تقرير بتلخيص معدّل (يرفضه المدقق) |
| مدقق المخطط (Node مستقل) | **PASS (657 checks, 0 errors)** | `node verification/validate-report.mjs release/verification-report.json --expect '...'` |
| الفحص الذاتي للتقرير | **PASS** (dupIds=0؛ boundedClaim=True) | `cg-assurance-verify.ps1 -SelfCheckReport` |
| إعادة إنتاج التشغيل المجمّد v2 | **26 PASS / 1 FAIL (V06 فقط)** — مطابق للتقرير المجمّد بايت-ببايت في الأحكام | `release/c8-frozen/reproduce-frozen-run.json` |
| المانيفست (8/8 ضد القرص) | **MAN-001 PASS + MAN-002 PASS (8 MATCH / 0 MISMATCH)** | `..\coreguard\reviews\gate-4.1-final-hashes.txt` |
| خريطة الانحراف EXT-001 | **PASS — 6×CONFIRMED + DRIFT-001 موثق** | `verification-drift-map.json` |
| سلامة الملفات المجمّدة الأصلية | **غير ممسّسة** — كل الهاشات مطابقة لقيم بداية الجلسة | H1–H3, H5–H6 أدناه |

## الإخفاقات الثلاثة المقصودة (fail-closed، لا تُعالج في هذا الإصدار)

| الفحص | السبب | القرار |
|---|---|---|
| **ENV-003** | `cast.exe` في `C:\Users\DeLL-L\foundry` خارج جذور الثقة (`%USERPROFILE%\.foundry`, Program Files) | **V06 يبقى FAIL موثقًا** — قرار المالك: المسار 1 (لا نقل، لا تجاوز) |
| **SELF-002** | مُعرِّفا الأمر `Release`/`SelfCheckReport` ضمن كتلة الإدارة في المحرك نفسه يُحصيان كـ exec sites | قيد معروف وموثق للمحرك v2؛ لا يفتح أي مسار تنفيذ فعلي (كلاهما flags بوليانية) |
| **LEG-001** | أنماط legacy (`--private-key`/`cast send`) في سكربتات بوابة 3.x القديمة ضمن جذور المسح | موثقة كأسطح legacy معروفة؛ البث عبرها غير مصرّح به مطلقًا |

## الانحراف الموثق الوحيد (DRIFT-001)

`reviews-extra/gate-4.1-verify-results.txt` يحمل داخل نفسه هاشًا قديمًا لنفسه
(`0x3ea32a8c…`) لا يطابق القرص (`0x168bae9d…`, نفس الطول 244247 بايت). قرار المالك:
الملف يبقى كما هو بلا إعادة كتابة؛ الانحراف موثق في `verification-drift-map.json`
(بند DOCUMENTED-DRIFT مع documentedDeviation كامل)؛ **كل الأحكام** المسجلة فيه
(14/14، 26/1، negative fail-closed، CONDITIONAL NO-GO) متطابقة مع التقرير المجمّد v5
والمانيفست النهائي. المراجع المستقل يعيد الحساب من القرص (H4/H8).

## المعمارية (من أداة إلى نظام حوكمة)

| الطبقة | التنفيذ في هذا الإصدار |
|---|---|
| **Evidence Layer** | inputHashes داخل كل تقرير (9 أدوار) + manifest.json/sha256 + c8-frozen/ (8 نسخ مجمّدة byte-identical) + archive/ (محرك v1.0.0 ومخرجاته) |
| **Verification Layer** | 33 فحصًا بنيويًا (catalogCount=33، POL-002 PASS)، نموذج findings منظم (M1–M7)، مفردة مغلقة PASS/FAIL/BLOCKED/INCONCLUSIVE/NOT_APPLICABLE، سياسات versioned + policy-lock، 17 اختبارًا سلبيًا |
| **Independent Review Layer** | reviewer-signoff/H1-H8.md (مصفوفة توقيع + أوامر حرفية + DRIFT-001 + سجل استثناءات) |
| **Authorization Layer** | C7/C8/C9 حالتها أعلاه؛ بوابة قرار §10 (10 شروط، أي فشل = NO-GO) |
| **Execution Boundary** | لا توقيع، لا بث، لا keystore، لا --private-key في أي مكوّن من هذا الإصدار (SEC-001 PASS؛ SELF-002 تحت المراقبة) |

## الملفات النهائية (SHA-256 من القرص، 2026-09-18)

انظر `release/manifest.json` (غير دائري) + `release/manifest.sha256`.
حزمة المراجع المستقل: `release/c8-frozen/` + `release/reviewer-signoff/H1-H8.md`.

## الخطوة التالية المعتمدة

تسليم حزمة C8 للمراجع المستقل → توقيع H1–H8 → معالجة ملاحظات المراجع المثبتة فقط
→ إعادة تقييم C7 ثم C9 → قرار منفصل جديد. **لا توقيع، لا محاكاة موقّعة، لا
commitIntent/anchorProof، لا بث.**
