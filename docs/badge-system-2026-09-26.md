# نظام الشارات — CG-BDG/1

> **لا توجد شارة صادرة لطرف ثالث.** هذه الوثيقة تشرح كيف *سيعمل* النظام، وما الذي
> يمنعه عن العمل الآن. أي قراءة للشارة كاعتماد أو تأييد أو تنفيذ مخالفة للعقد نفسه.

الحالة: `NOT_ISSUED` · `badgeIssuerCount: 0` · `namedIntegrator: NONE`

## 1. لماذا هذا النظام موجود

الشارة هي الأثر الوحيد في المستودع الذي قد يُطبع بجوار اسم شخص أو شركة أخرى. هذا يجعله
أخطر سطر في المشروع: سطر واحد خاطئ يعني ادعاءً علنيًا لا يسنده شيء. لذلك النظام مبني على قاعدة
واحدة — **الرسمة نفسها هي الدليل**، وليست لقطة شاشة ولا وصفًا.

## 2. المتطلبات الأساسية

```
الإنتاج  ->  سجلّ الجهة المصدرة  ->  سجلّ CG-CS/1  ->  تحقق CG-BDG/1  ->  التحقق من hydrox
```

| المرحلة | الأمر | ما يثبته |
|---|---|---|
| فحص المطابقة | `npm run conformance:report` | أن المجموعة اجتازت المعايير الستة |
| إصدار (مغلق) | `packages/badge` — بلا مدخل today | أن قرار الإصدار صادر من المالك |
| كتابة السجل | `npm run badge:write` | يكتب `docs/badge-registry.json` + الملفات |
| التحقق | `npm run badge:verify` | يعيد اشتقاق كل digest من سجله |

## 3. التحقق الذاتي (Self-verifying)

الشارة ليست صورة PNG. كل رقم داخلها (المعيار، تاريخ الإصدار، بصمة السجل) مشتق من سجلها،
و`verifyBadge()` يعيد بناء الرسمة من السجل ويقارن بايت-ببايت:

- تطابق البايتات: `VERIFIED` — الرسمة هي ناتج التوليد الحتمي من السجل.
- اختلاف البايتات: `BYTES_DIFFER` — someone عدّل الرسمة يدويًا بعد التوليد.
- غياب السجل: `RECORD_MISSING` — لا سجل، لا شارة.

هذا يكشف تعديلًا يدويًا واحدًا دون أيها. وهذا هو السبب في أن الملف يُكتب بـ`svg + "\n"` ولا
يفشل بسبب مسافة طرف واحدة: **سطر جديد في نهاية الملف لا يعني تزويرًا**، أما تغيير بايت داخل
الرسمة فيعني ذلك.

## 4. الأرقام

| المؤشر | القيمة | الدليل |
|---|---|---|
| `issuerCount` | 0 | لا سجل إصدار |
| specimens | 2 | ملفان في `docs/badges/` |
| معايير CG-CS/1 | 6 | `docs/conformance-report.json` |
| شارات مُصدرة لأشخاص | 0 | `badgeIssuerCount` في تقرير المطابقة |

العينة الأولى `6/6` (مطابقة) والثانية `2/6` (رفض صريح). العينة الثانية موجودة عن قصد:
نظام شارات لا يستطيع أن يُظهر الرفض لا يستطيع أن يُظهر الموافقة.

## 5. لماذا `brand` غير قابل للنسخ

سجل الشارة يحمل خاصية `brand` غير قابلة للتعداد (non-enumerable). لذلك لا يستطيع أحد نسخ سجل
عينة وتغيير حالته إلى `ISSUED`: الحقل لا يظهر في `JSON.stringify` ولا في spread، وعند
المحاولة يُعاد بناء السجل إلى `SPECIMEN`. الإصدار يجب أن يمرّ عبر `issueRecord()` صريح.

هذا ليس حماية. هذا يجعل **الخطأ الجاد مكلفاً**: تغيير حقل في JSON لا يكفي.

## 6. `neverMeans` — ما لا تعنيه الشارة أبداً

```
never endorsement · never funds transfer · never legal outcome
never adjudication · never an audit of the counterparty · never a security review
```

الشارة ليست: اعتماداً، ولا تحويل أموال، ولا حكماً قانونياً، ولا تدقيقاً للشخص الثالث، ولا
مراجعة أمنية. أي استخدام آخر خرق للعقد.

## 7. ما الذي يُغلق هذه الشارة

| # | الشرط | الحالة |
|---|---|---|
| 1 | جهة مسماة متكاملة (named integrator) | `NONE` |
| 2 | اجتياز مجموعة CG-CS/1 من طرف ثالث حقيقي | `NOT_RUN` |
| 3 | مراجعة أمنية للطرف الثالث | `NOT_PERFORMED` |
| 4 | قرار المالك بالإصدار | `PENDING` |
| 5 | مستخدمون خارجيون | `0` |

## 8. الأوامر

```bash
npm run badge          # self-check 15/15
npm run badge:write    # يكتب السجل والعينات
npm run badge:verify   # يعيد اشتقاق كل digest
```

`npm run badge:verify` جزء من بوابة الإصدار (`npm run release:gate`). لا يمكن لشجرة
متوافقة أن تصل إلى `main` و`verifyBadge()` يفشل.

---

**English mirror**

# The Badge System — CG-BDG/1

> **No badge is issued to any third party.** This document explains how the
> system *will* work and what currently prevents it from doing so. Reading a
> badge as endorsement or execution contradicts the contract it is built on.

Status: `NOT_ISSUED` · `badgeIssuerCount: 0` · `namedIntegrator: NONE`

## 1. Why this system exists

The badge is the only artifact here that may be printed next to the name of a
person or a company. That makes it the most dangerous line in the project: one
wrong line is a public claim with nothing behind it. So the system rests on one
rule — **the artwork is the proof**, not a screenshot and not a description.

## 2. The required sequence

```
CG-CS/1 pass -> issuer record -> badge registry -> CG-BDG/1 verify -> publish
```

| Stage | Command | What it proves |
|---|---|---|
| conformance | `npm run conformance:report` | the suite passed the six criteria |
| issuance (closed) | `packages/badge` — no entry point today | issuance is an owner decision |
| write | `npm run badge:write` | writes `docs/badge-registry.json` + files |
| verify | `npm run badge:verify` | re-derives every digest from its record |

## 3. Self-verifying

The badge is not a PNG. Every number in it (criterion, issue date, record
fingerprint) is derived from its record, and `verifyBadge()` rebuilds the
artwork from the record and compares byte for byte:

- bytes match → `VERIFIED` — the artwork is the deterministic render
- bytes differ → `BYTES_DIFFER` — the artwork was hand-edited after generation
- no record → `RECORD_MISSING` — no record, no badge

This catches a single hand-edit that no other check would. It is also why the
file is written as `svg + "\n"` and is not failed over by one trailing byte: **a
final newline is not forgery**; a changed byte inside the artwork is.

## 4. The numbers

| Metric | Value | Evidence |
|---|---|---|
| `issuerCount` | 0 | no issuance record |
| specimens | 2 | two files under `docs/badges/` |
| CG-CS/1 criteria | 6 | `docs/conformance-report.json` |
| badges issued to people | 0 | `badgeIssuerCount` in the report |

The first specimen is `6/6` (conformant) and the second `2/6` (explicit
refusal). The second exists on purpose: a badge system that cannot show a
refusal cannot be trusted to show an approval.

## 5. Why `brand` is not copyable

A badge record carries a **non-enumerable** `brand` field. Copying a specimen
record and changing its state to `ISSUED` does not work: the field survives
neither `JSON.stringify` nor a spread, and the attempt rebuilds the record as
`SPECIMEN`. Issuance must go through the explicit `issueRecord()` path.

This is not a security control. It makes a serious mistake *expensive*: editing
a field in JSON is not enough.

## 6. `neverMeans` — what a badge never means

```
never endorsement · never funds transfer · never legal outcome
never adjudication · never an audit of the counterparty · never a security review
```

A badge is not: an endorsement, a funds transfer, a legal judgement, a due
diligence audit of the third party, or a security review. Any other reading is
a contract violation.

## 7. What holds this closed

| # | Condition | State |
|---|---|---|
| 1 | a named integrator | `NONE` |
| 2 | a real third party running CG-CS/1 | `NOT_RUN` |
| 3 | a security review of the third party | `NOT_PERFORMED` |
| 4 | owner issuance decision | `PENDING` |
| 5 | external users | `0` |

## 8. Commands

```bash
npm run badge          # self-check 15/15
npm run badge:write    # writes the registry and specimens
npm run badge:verify   # re-derives every digest
```

`npm run badge:verify` is a leg of the release gate (`npm run release:gate`).
No non-conformant tree can reach `main` with a failing `verifyBadge()`.
