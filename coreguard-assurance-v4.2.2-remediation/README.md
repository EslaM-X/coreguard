# CoreGuard Assurance Platform — Gate 4.1

أداة تحقق فقط: لا مفاتيح، لا توقيع، لا بث. **المراجع المستقل (C8) يبدأ من هنا.**

## خريطة المراجعة

1. **الحالة والقرار**: [`STATUS-v4.2.2.md`](./STATUS-v4.2.2.md)
2. **الأوامر الحرفية + مصفوفة التوقيع H1–H8**: [`release/v4.2.2-remediation/H1-H8.md`](./release/v4.2.2-remediation/H1-H8.md) — *السطح الوحيد المعتمد للأوامر؛ لا تشغّل أي أمر من مصدر آخر*
3. **التحقق من التجميد (مُرتكز على الـcommit)**: `node verification/validate-freeze.mjs release/freeze/freeze-record-4.2.6.json` — يجب أن يطبع `PASS (46/46 MATCH, anchored @ <gitCommit from the record>)` · الهاشات تُحسب من شجرة الـcommit الحتمية لا من القرص (وضع `--disk` للتشخيص فقط وليس دليلًا) · السجل: [`release/freeze/freeze-record-4.2.6.json`](./release/freeze/freeze-record-4.2.6.json) (27 إصدار + 19 عزل)
4. **الاستنساخ النظيف يفشل بـBLOCKED مقصودًا**: `reviews-extra/` أدلة خارجية عمدًا — غيابها يُنتج INV-001 fail-closed (exit 1)، وهذا هو السلوك الصحيح

سجلات أقدم (4.2.2–4.2.5) وسجل التغييرات: تاريخية، محفوظة بلا إعادة كتابة.

## القرار (نجاح التحقق لا يمنح تفويضًا)

```
C7 = PARTIAL · C8 = PENDING (توقيع H1–H8 يغلق C8 فقط) · C9 = PENDING
CONDITIONAL NO-GO — SIGNING / COMMITINTENT / ANCHORPROOF / MAINNET BROADCAST = NOT AUTHORIZED
```
