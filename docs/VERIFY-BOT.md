# 🤖 VERIFY-BOT — بوت التحقق · The verification bot (Telegram / Discord)

> الحالة الصادقة: **PLAN_ONLY / NOT_DEPLOYED** — هذه مواصفة هندسية ملتزمة، لا بوت حي.
> Honest status: **PLAN_ONLY / NOT_DEPLOYED** — a committed engineering spec, not a running bot.
> لا ادعاء بوت نشط حتى توجد حزمة منشورة برابط حي ومفتاح في بيئة سرية.

---

## 1 · الفكرة في سطر · The one-liner

المستخدم يرسل لهوية بوت CoreGuard جيب CGEP/1 (أو تسلسلها) — البوت يُعيد تشغيل التحقق المستقل ويرد بتعليق ترميزًا: **VERIFIED / MISMATCH / UNKNOWN**، مع خطوات إعادة الاشتقاق بحيث يستطيع أي طرف أن يلغي البوت ويَعمل بنفسه.

## 2 · البنية الهندسية · Architecture

```
Telegram Bot API ─┐
                  ├─► verify-bot worker (stateless)
Discord Gateway ──┘        │
                           ▼
              packages/ (SDK أوامر guard.* / verify*)
                           ▼
        CGEP/1 receipt replay — المدققون الثلاثة، فاشل-مغلق
                           ▼
        الرد: تعليق مرمّز + روابط الاشتقاق + شعار الدرع CG
```

- **عديم الحالة** (stateless): لا يقفل أي أسرار اشتقاق. التوكن فقط سر بيئة، لا يُلتزم أبدًا.
- **فاشل-مغلق**: أي إدخال غير قابل للتحليل يرد `UNKNOWN — stay HELD`، لا تنبؤ ولا تخمين.
- **بلا دفع**: البوت لا يوقّع ولا يرسل ولا يحفظ أصول — قراءة وتحقق فقط.

## 3 · نصوص الردود · Reply contract

| الحالة | رد البوت (عربي/إنجليزي) |
|---|---|
| `VERIFIED` | ✅ الالتزام مطابق — إعادة الحساب مستقلة ناجحة / Commitment matches — independent replay OK |
| `MISMATCH` | ❌ انحراف عن الالتزام المعلن / Divergence from the declared commitment |
| `UNKNOWN` | ⏸ بيانات ناقصة — يبقى يحفظ / Insufficient evidence — stays HELD |

الرد يضم دائمًا: هاش الإيصال، `replayHash`، وخطوات التحقق اليدوي من `docs/TRUST.md §2`.

## 4 · خطة النشر المرحلية · Rollout plan

| مرحلة | ما يُنشأ | الحالة |
|---|---|---|
| M1 | وحدة التحقق النقية `packages/verify-bot/index.mjs` (بدون منصات) — تُختبر في الجناح | PLAN |
| M2 | غلاف Telegram + غلاف Discord (نفس العقد) | PLAN |
| M3 | نشر تجريبي على قناة مغلقة + مفتاح بيئة سرّي | PLAN |
| M4 | إعلان حي + رابط دعوة + صفحة هذا المستند تُستبدل بحالتها | NOT_STARTED |

## 5 · الحدود الصادقة · Honest limits

- لا بوت حي، لا رابط دعوة، لا توكن ملتزم — حتى M4.
- لنُ يُنتج قرارًا أمانًا ذاتيًا خارج بروتوكول CGEP/1 — امتداد واجهة أكثر.
- التقيد بروتوكول الصدق: كل حالة تُذكر بالاسم، لا تُستنتج.

---

**CoreGuard · Verify · Protect · Empower** — الحالة تُقاس من الشجرة الملتزمة، لا من التشويق · status is measured from the committed tree, not from hype.
