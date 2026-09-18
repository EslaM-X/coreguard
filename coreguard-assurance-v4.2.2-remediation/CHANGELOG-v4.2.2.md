# CHANGELOG — CoreGuard Assurance v4.2.2-remediation
**Engine 2.1.0 (supersedes 2.0.0) · Gate 4.1 · 2026-09-18 · Directive: دورة v4.2.2 Remediation الكاملة (قرار المالك)**

## النتيجة النهائية للدورة

| المؤشر | قبل (v4.2.1 / engine 2.0.0) | بعد (v4.2.2 / engine 2.1.0) |
|---|---|---|
| SELF-002 | FAIL (exec:2) — المحرك يستدعي node مرتين | **PASS (exec:0, net:0, dyn:0)** — إصلاح جذري + ST21 |
| ENV-003 | FAIL — cast خارج جذر الثقة | **PASS — within-trust-root** (V06-2 منفّذ وموثّق) |
| LEG-001 | FAIL — أنماط خطرة في scripts | **PASS (hits:[])** — عزل فيزيائي لـ18 ملفًا |
| MAN-002 | 6/8 (بعد العزل الأولي) | **8/8 MATCH** عبر مانيفست معتمد v4.2.2 يثبت حفظ البايتات |
| التشغيل القياسي | 30 PASS / 3 FAIL · BLOCKED | **33/33 PASS · VERIFIED-READONLY-ONLY** |
| Self-test | 20/20 | **21/21 (ST21 الجديد)** |
| Negative suite | 17/17 | **17/17** (سيناريو 17 عبر المدقق الهيكلي الجديد) |
| Independent Node validator | PASS | **PASS (657 فحصًا)** |

## 1. SELF-002 — الإصلاح الجذري (ليس تغيير رسالة)
- **السبب الجذري**: المحرك v2.0.0 يستدعي `node` في موضعين (SelfCheckReport + السيناريو 17 السلبي) رغم شعاره "NEVER starts a subprocess" → `SELF-002 = FAIL (exec:2)`.
- **الإصلاح**: وظيفة `Run-StructuralValidator` داخلية بالكامل (JSON reflection: إعادة حساب الملخص، duplicate ids، اتساق blockers/status، bounded claim، empty evidence) — **صفر subprocess**.
- **اختبار إيجابي جديد**: **ST21-engine-no-subprocess-sites** — يحلل AST للمحرك نفسه ويفشل إن ظهر أي exec/net/dynamic site. Self-test صار 21.
- **اختبارات سلبية تثبت السلوك**: NEG-mutated-summary-rejected (رفض تقرير بعدّاد معدّل) عبر المدقق الداخلي؛ NEG-missing-report وNEG-unparseable-report (رفض تقرير ناقص/غير صالح).
- **فصل الأدوار محفوظ**: المدقق الداخلي انعكاس إضافي فقط؛ **لا يحل محل** `validate-report.mjs` (Node) الذي يشغّله المراجع المستقل بنفسه (المواصفة §5).

## 2. ENV-003 — تنفيذ V06-2 الموثق (بلا تجاوز الحماية)
- **التحقق الخارجي قبل النسخ**: cast 1.8.0 · Commit `61ae26af36320d4fa1020f7db53785885e29eeb5` · Build `2026-08-26T13:16:35Z` — نسخة رسمية موجودة في releases foundry؛ SHA-256 مطابق للقيمة المعتمدة سلفًا `0xeba3df69…`؛ بديل وحيد في PATH؛ غير موقّع Authenticode (موثّق: قنوات foundryup لا توقع ثنائياتها — مقبول مع الهاش المسجل سلفًا).
- **التثبيت**: `C:\Users\DeLL-L\.foundry\cast.exe` (داخل جذر الثقة الأول) — نسخة موثقة بالهاش والبايت من المصدر، حماية من الكتابة فوق هدف موجود، إزالة تلقائية لو فشل التحقق.
- **ما لم يُفعل**: أي استثناء يدوي، أي تعديل على منطق الفحص، أي قبول نصي — ENV-003 أعاد الفحص وقرر PASS من الأدلة.

## 3. LEG-001 — عزل فيزيائي كامل
- **الجرد**: 18 ملفًا تحت `coreguard/scripts` تطابق الأنماط (`cast send` / `--private-key` / `eth_sendRawTransaction` / `eth_sendTransaction`)؛ 14 متتبعة في git.
- **العزل**: نقل بالكامل إلى `coreguard/legacy-quarantine/2026-09-18-v4.2.2/` (خارج جذور الفحص) عبر `git mv` للمتتبعة (صفر تغيير محتوى — إثبات git) و`mv` للغير متتبعة؛ README مع القواعد الأربع (لا تنفيذ، لا استعادة بلا قرار مالك، إعادة الكتابة الوحيدة مقبولة، حفظ البايتات).
- **إغلاق نقاط الدخول**: `npm run anchor` صار كتلة منع صريحة (exit 1)؛ README/DEPLOYMENT/COMMUNITY حدثت لتوثيق العزل بلا مسارات قديمة مضللة.
- **إثبات عدم الفساد**: المدخلان المانيفستيان للملفين المعزولين يطابقان الهاشات الأصلية المسجلة **من مسارات العزل** → العزل حافظ على البايتات حرفيًا.

## 4. تغييرات معمارية في المحرك (2.0.0 → 2.1.0)
- `Run-StructuralValidator` (داخلي، بلا subprocess).
- `-ManifestBase`: تحديد صريح لجذر مسارات المانيفست (يحل الافتراض الهش "مستويان للأسفل").
- دعم `origPath|quarantinePath` في مدخلات المانيفست (resolvedFrom في الأدلة).
- ST21 في الـself-test؛ M5 supersedes محدّث لسلسلة 2.0.0→2.1.0.

## 5. الملفات المعدلة/المنشأة في هذه الدورة
- `verification/cg-assurance-verify.ps1` (engine 2.1.0)
- `release/*` (تقرير + TAP + negative + manifest + sha256 + html — كلها مولدة post-fix)
- `release/v4.2.2-remediation/approved-evidence-manifest-v4.2.2.txt` + هذه الوثائق
- `coreguard/legacy-quarantine/**` (18 ملفًا + README) · `coreguard/package.json` · `coreguard/README.md` · `coreguard/docs/DEPLOYMENT.md` · `coreguard/docs/COMMUNITY.md`

## 6. الحدود التي لم تُعبر (ملزمة)
- **لا توقيع، لا commitIntent، لا anchorProof، لا بث** — كتلة authorization في التقرير: NOT AUTHORIZED ×4؛ القرار hardcoded: CONDITIONAL NO-GO.
- C7/C8/C9 لم تُغلق بهذه الدورة: C8 بانتظار مراجع بشري مستقل يوقّع H1–H8؛ C7 بانتظار تنفيذ قالب المراجعة الأمنية؛ C9 بانتظار قرار المالك الصريح.
- نجاح 33/33 **لا يستنتج منه GO** — بوابة §10 تتطلب الأغلاق الثلاثة + GO منفصلًا صريحًا.
