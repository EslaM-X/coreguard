# ⛨ TRUST — بوابة الثقة · The Trust Gate

> **Beta'in over narrative — الإثبات قبل السرد.**
> كل رقم في هذا الملف قابل لإعادة إشتقاق من الشجرة الملتزمة، بلا شبكة، بلا ثقة.
> Every number in this file re-derives from the committed tree — offline, trustless.

---

## 1 · المرساة الحية · The live anchor

| ما يُقاس | القيمة | كيف تتحقق |
|---|---|---|
| الشبكة | Core Mainnet · chainId **1116** | `npm run anchor:verify` |
| العقد الحي | `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` | استكشاف Core DAO / RPC عام |
| طبيعته | **LIVE · READ-ONLY** — يخزّن الالتزامات فقط | لا حفظ أصول · لا أوراكل · لا مفاتيح |
| نزاهتها | **VERIFIED ANCHOR INTEGRITY** | إعادة اشتقاق مستقلة، ملتزمة في CI |

## 2 · خطوات التحقق المستقل · The independent-verify ladderبعد استنساخ بارد — `git clone https://github.com/coreguard-global/CoreGuard.git` ثم مَرورك إلى جذور المشروع — شغّل بدوري هذا:

```bash
npm ci                    
npm test                    # الجناح الكامل — العدد مثبت آليًا في docs/state-snapshot.json
npm run claims:audit        # سجل الادعاءات CG-CL/1 — كل ادعاء ملتزم ومحدد المصدر
npm run boundary:audit      # عدد الملفات الملتزمة · 0 انتهاكات
npm run anchor:verify       # نزاهة المرساة الحية على chainId 1116
node scripts/badge-wall.mjs --audit   # 7 بطاقات تُشتق من الشجرة (CG-WALL/1)
node demo.mjs               # الدورة كاملة بلا مفاتيح بلا مال — UNKNOWN → HELD
```

كل أمر أعلاه **مُتَّهم في CI** ويعيد إنتاجه أي طرف من استنساخ بارد — لا «أخضر محفوظ».

## 3 · مصفوفة الأدلة · The evidence matrix

| الأصل | ما يثبته | مصدر الحكم |
|---|---|---|
| CGEP/1 | نية → سياسة → التزام → إيصال → مرساة | `npm run corpus` + المدققون الثلاثة |
| Execution Firewall | قرار قبلي `ALLOW/DENY/REQUIRE_REVIEW` فاشل-مغلق | `npm run attack-lab` |
| EVP/1 | موافقة ثلاثية `FULL/PARTIAL/UNKNOWN` — لا بوليان | `npm run evidence-package` |
| ADAL/1 | حزمة نزاع بمحقّق 25 فحصًا تفشل-مغلقًا | `npm run dispute-package` |
| Badge Shield | 7 بطاقات هر بايتها مُشتق من ملف ملتزم حصري | `node scripts/badge-wall.mjs --audit` |
| Perf ledger | منحنيات أداء مرتبطة بـ`git sha` لكومِيت القياس | `docs/DDE-TREND.html` |

## 4 · ما لا ندّعيه · What we never claim

لا إيراد، لا عملاء، لا شركاء، لا سعر، لا تكامل خارجي حي، ولا تدقيق خارجي.
كل ما لم يُثبت بحدث مسمى يبقى `UNKNOWN / GATED / DRY_RUN / NOT_BUILT` — **يُقال بالاسم لا بالغياب**.
هذا هو الأصل الاستثماري: نظام ادّعاء فاشل-مغلق فوق طبقة تنفيذ فاشل-مغلقة.

## 5 · للمموّل والحاضنات · For funders

- الملخص التنفيذي: `docs/EXECUTIVE-SUMMARY.md`
- العرض: `docs/PITCH-DECK.md` · التمويل: `docs/FUNDING.md` · الأسعار: `docs/pricing.md`
- سلّم الأنظمة الثلاثة: `docs/TRINITY-CORE-STELLAR-PI.md`
- الكتالوج الكامل: `docs/ALL-IN-ONE-CATALOG.md` — كل حزمة وسكريبت وسطح، بحالة صادقة.

---

**CoreGuard · Verify · Protect · Empower — Execution Integrity for a Smarter Onchain Future**
وثّق في `CG-CL/1` · الشجرة الملتزمة هي الحقيقة الوحيدة · commitment tree is the only truth.
