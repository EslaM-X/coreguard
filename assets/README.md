# CoreGuard assets — official identity kit v1.1

هوية CoreGuard الرسمية: درع مقسوم بتدرّج Core Orange الرباعي + G مصفّح بالفولاذ +
الفجوة السفلية. **المرجع الوحيد لمضلّع الشعار هو `coreguard-mark.svg`.**

| الملف | الاستخدام |
|---|---|
| `coreguard-mark.svg` | الدرع الكامل الملون — أي مقاس، حاد في كل الدقة |
| `coreguard-mono.svg` | الأحادي — `currentColor` (يتلوّن مع سياق النص؛ يُستخدم inline أو عبر `<use>` داخل صفحة مضمنة) |
| `coreguard-lockup.svg` | الشعار الأفقي (درع + كلمة، خط Exo 2) |
| `coreguard-lockup-vertical.svg` | الشعار الطولي + الـTagline |
| `coreguard-appicon.svg` | أيقونة التطبيق (Squircle داكن) |
| `coreguard-tokens.css` | رموز التصميم الكاملة (ألوان/تدرجات/ظلال/مسافات/طباعة) |
| `brand-guide.html` | دليل العلامة الكامل — يُفتح مباشرة في المتصفح |
| `icons/coreguard-mark-{512,256,128,64,32}.png` | تصدير PNG جاهز (فافيكون/متاجر) |
| `icons/coreguard-mono-512.png` | النسخة الأحادية الموحّدة على Deep Core |
| `icons/coreguard-appicon-{512,256,128}.png` | أيقونة التطبيق PNG |
| `og-cover-1200.png` | بنر المشاركة 1200×630 (المصدر: جذر المستودع `og-cover.svg`) |

## التوليد والتحقق

- التدقيق الأوفلاين للشارات: node scripts/badge-wall.mjs --audit — يعمل في أي clone نظيف (مكتبة معيارية فقط).
- إعادة بناء الأوراق: scripts/badge-wall.mjs (بدون --audit) — من بيئة التطوير.
- تصدير PNG: scripts/brand-export.mjs — يحتاج npm i --no-save @resvg/resvg-js؛ المخرجات مخزنة مسبقاً في assets/icons/.
- السرد النصي هنا من قصد: عقد docs-node ينفّذ كل أمر موثق في clone نظيف، فلا يوثق أمر يطلب حزمة غير مثبتة.

## القواعد الأساسية

1. التدرّج دائمًا من الأعلى إلى الأسفل — لا قلب، لا دوران، لا بتر.
2. الأحجام < 48px: الدرع فقط (بدون نص) — مثالي `coreguard-appicon`.
3. لا تُلوّن الـG ولا تُضف حدودًا خارجية للدرع.
4. الملفات SVG مليتة ذاتيًا — لا تتطلب أدوات خارجية.

## Favicon / PWA manifest

```json
{
  "name": "CoreGuard",
  "short_name": "CoreGuard",
  "background_color": "#0B0F14",
  "theme_color": "#FF8A00",
  "display": "standalone",
  "icons": [
    { "src": "/assets/icons/coreguard-mark-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/assets/icons/coreguard-mark-128.png", "sizes": "128x128", "type": "image/png" }
  ]
}
```

## Infusion inline للـmono (يتلوّن مع CSS `color`)

```html
<span style="color:#F5F7FA">
  <img src="assets/icons/coreguard-mono-512.png" width="24" alt="CoreGuard"/>
</span>
```
