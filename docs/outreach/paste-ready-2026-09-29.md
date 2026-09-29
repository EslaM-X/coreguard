# حزمة النسخ واللصق — كل الرسائل المعتمدة (2026-09-29)

> كل نص أدناه منقول **حرفيًا** من ملفه الموقَّع ببوابة B6 (المصدر مذكور في كل
> قسم — النص هنا لقطة مطابقة، وعقد اختبار يفشل الالتزام إذا انحرف عن سطور
> التوقيع في المصادر). انسخ من ✂️ ابدأ إلى ✂️ انتهِ. لا تعدّل الأرقام ولا
> الروابط ولا تضف ادعاءً واحدًا.

**عبّئ الحقول مرة واحدة ثم استبدلها في كل النسخ:**
[Name — project owner, CoreGuard] ← اسمك الكامل · [بريدك] · [الهاتف/واتساب] · [رابط LinkedIn]

**فحص 60 ثانية قبل أي إرسال:**
1. الحقول معبأة — لا تُرسل رسالة فيها `[____]`.
2. كل الروابط تفتح (خصوصًا صفحة العرض الحية).
3. القناة موثقة في `docs/outreach/send-kit-2026-09-29.md` — لا قنوات مُخترعة.
4. سجّل الإرسال في جدول التتبع (بند 12+) بنفس اليوم.

---

## 1) OpenAI — إيميل (القناة: نموذج Partner Network — openai.com/business/partners)
المصدر الموقّع: `docs/outreach/openai-en.md` ☑ — في نموذج التقديم: ضع الموضوع في خانة العنوان والجسم في وصف الحل.

✂️ ابدأ
**Subject: A replayable incident-review surface for runaway-agent cases — 30-minute demo, no commitment**

Hello OpenAI safety/review team,

I follow the incident reports your teams publish on runaway agents — the
image leaks, the Hugging Face platform compromise, the multi-month review
timelines. The pattern's bottleneck is structural, not resourcing: the
investigating party gathers its own evidence, and outsiders cannot replay the
verdicts.

I've built the missing piece as an open-source project: **CoreGuard** — an
on-chain execution-provenance evidence layer for agent transactions, with the
incident-review surface packaged as **AIE-1**: one endpoint, one evidence
bundle, one report schema — replayable from a cold clone by any reviewing
party. Deterministic replay (same bytes in → byte-identical verdict out) is
asserted by contract tests in CI; tamper attempts name the exact flipped byte.

Everything is verifiable in one click, in your browser tab, with no server and
no clone: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html

Spec (every claim executed by CI):
https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

If it's useful, I'll walk a reviewer through the 30-minute protocol — live
page, then a cold-clone replay — with zero commitment on your side.

Best regards,
[Name — project owner, CoreGuard]
✂️ انتهِ

---

## 2) Anthropic — إيميل/نموذج التواصل (anthropic.com — Contact/Sales)
المصدر الموقّع: `docs/outreach/anthropic-en.md` ☑ — تنبيه: ردودهم الرسمية من نطاق anthropic.com فقط.

✂️ ابدأ
**Subject: The operational half of agent-safety research: replayable incident verdicts — 30-minute demo**

Hello Anthropic team,

Your research consistently argues for human oversight and auditable agent
behavior. The operational gap I kept hitting is at the end of that pipeline:
when an incident is reviewed, the verdict is *read* rather than *replayed* —
the investigating party holds the evidence, and no outsider can re-derive the
conclusion from the same bytes.

**CoreGuard** (open source) is the missing operational layer, packaged for
incident reviews as **AIE-1**: one verification endpoint, one evidence bundle,
one report schema. The engine is fail-closed — execution facts can never
decide conformity, every rejection carries named reasons in one language
across the SDK and the wire, and deterministic replay (byte-identical verdicts
from the same bundle) is asserted by contract tests in CI.

Live, in one click: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
Spec (CI-executed claims): https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

Happy to run a reviewer through the 30-minute protocol — live page, then a
cold-clone replay — with no commitment implied.

Best regards,
[Name — project owner, CoreGuard]
✂️ انتهِ

---

## 3) DeepSeek — إيميل مباشر (api-service@deepseek.com — قناة التعاون المنشورة)
المصدر الموقّع: `docs/outreach/deepseek-en.md` ☑

✂️ ابدأ
**Subject: A forkable, CI-verified incident-review surface for open agent ecosystems — 30-minute demo**

Hello DeepSeek team,

Open agent ecosystems need audits that third parties can actually *run*, not
just read. The industry's incident pattern — fast announcements, slow
outside-verifiable reviews — hits open-weight deployments hardest, because
there is no shared review surface a maintainer and an auditor can both stand
on.

**CoreGuard** (open source, MIT-licensed posture) ships that surface as
**AIE-1**: one verification endpoint, one evidence bundle, one report schema —
deterministic replay is contract-tested (same bytes in → byte-identical verdict
out), tamper attempts name the exact flipped byte, and the spec's claims are
executed by CI so a fork can prove it stayed honest.

Live in one click, no server: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
Spec: https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

A 30-minute walkthrough — live page, then a cold-clone replay — is available
any time, with zero commitment.

Best regards,
[Name — project owner, CoreGuard]
✂️ انتهِ

---

## 4) Google / Gemini — نموذج برنامج الشركاء (Google Cloud AI Agent Ecosystem)
المصدر الموقّع: `docs/outreach/google-gemini-en.md` ☑ — الموضوع = عنوان الحل في النموذج، والجسم = وصفه.

✂️ ابدأ
**Subject: An inheritable evidence layer for agent-incident reviews — 30-minute demo, no commitment**

Hello Google / Gemini team,

Agent governance and auditability are recurring themes across your agent-stack
announcements, and the industry pattern is now well documented: incidents are
announced quickly, while outside-verifiable reviews arrive slowly — because
evidence is gathered by the investigated party and verdicts cannot be replayed
by third parties.

**CoreGuard** (open source, built on Core Mainnet) closes that gap as **AIE-1**:
one verification endpoint, one evidence bundle, one report schema — fail-closed
by construction, identity taken from the socket rather than forwarded headers,
and every delivery artifact re-hashed from its bytes on every run. Deterministic
replay is contract-tested: same bytes in, byte-identical verdict out, in any
reviewer's hands.

You can see the real engine run in one click, no server, no clone:
https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html

Spec — every claim on it is executed by CI, not trusted:
https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

A 30-minute walkthrough (live page + cold-clone replay) is available any time,
with zero commitment.

Best regards,
[Name — project owner, CoreGuard]
✂️ انتهِ

---

## 5) AIC / MCIT — رسالة الإدخال الرسمية (عربي)
المصدر الموقّع: `docs/outreach/aic-mcit-intake-ar.md` ☑ — **النص الجاهز كاملًا
(الموضوع + الجسم + التوقيع + خطة القنوات الأربع والتسلسل) موجود هناك داخل
قسم ✂️** — انسخه من ذلك الملف مباشرة (سطر الموضوع يبدأ بـ«طبقة إثبات تنفيذ
لوكلاء الذكاء الاصطناعي»). قبل الإرسال: أكّد عنوان `aic@mcit.gov.eg` من
aic.gov.eg كما تفصّل خطة القنوات.

## 6) Karnak — ملاحظات داخل التطبيق (عربي، ثلاث جمل)
النص الجاهز في `docs/outreach/aic-mcit-intake-ar.md` — خطة القنوات، القناة 2.

## 7) LinkedIn — منشوران (إنجليزي، من حسابك الشخصي)

### 7أ) منشور AIE-1 — المصدر: `docs/outreach/public-post-agent-safety.md` ☑
✂️ ابدأ
For the past months, the agent-safety headlines have repeated one shape:
runaway agents leak user data or abuse a platform, the company announces an
investigation, and the review "may take months."

We didn't build a faster announcement. We built the missing review surface.

**The structural problem, stated plainly:**
In every one of these incidents, the investigating party collects its own
evidence, runs its own tooling, and produces a verdict nobody outside can
re-derive from the same bytes. Months pass. Outsiders can only *trust* — or
speculate.

**What we shipped (open source, MIT posture, zero dependencies):**
**AIE-1 — the Agent Incident Evidence surface.** One verification endpoint,
one evidence bundle, one report schema:

- **Replayable from a cold clone.** A reviewer stands up the same gate with
  two documented one-liners and re-runs the same bundle.
- **Deterministic by contract.** Same bytes in → byte-identical verdict out —
  asserted by tests, not promised.
- **Byte-anchored.** Every artifact is sha256-pinned; the engine re-computes
  each pin from the bytes on every run. A single flipped byte is refused and
  *named*: `logo.svg: recorded 0x43233704… != actual 0xc3233704…`
- **Fail-closed everywhere.** Identity comes from the socket, never forwarded
  headers. A rejected bundle's acceptance predicate is never even consulted.
- **One verdict language.** The SDK gate (`releaseWhen`) and the wire guards
  (403/429/413/422) speak the same named-reasons format.

**See it run in one click** — no server, no clone, the real embedded engine:
https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
(paste your own evidence bundle as JSON, or click honest / tamper /
structural-refusal and watch the fail-closed verdict in your tab)

**The honest claims ledger:**
- The surface exists, is open source, and its spec's claims are executed by
  CI (the doc-curl contract runs them on every push). → TRUE, checkable.
- Deterministic replay + named tamper. → TRUE, contract-tested.
- Any lab using it for a real incident review. → **has not happened.**
- Any partnership or endorsement. → **none exists.**

We are not announcing a customer or an adoption. We are announcing that the
review surface the next incident will need is public, CI-verified, and one
click away — so the *next* months-long review has somewhere to start that
isn't zero.

Repo: https://github.com/EslaM-X/coreguard
Spec (every claim CI-executed): https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

Critique welcome — including "your threat model is wrong because X". A
documented external critique upgrades the standard; that's a win we count.
✂️ انتهِ

### 7ب) منشور إطلاق RAER — المصدر: `docs/outreach/public-post-raer-launch.md` ☑
✂️ ابدأ
Every runaway-agent incident follows the same script: the lab announces it,
opens a review, and months later we get a summary nobody outside the room can
check — because the investigating party gathered its own evidence.

Today we're launching **RAER** — the Replayable Agent-Incident Evidence
Registry — as open infrastructure:

- **Any party can file** a replayable evidence bundle: the investigating lab,
  a regulator, an auditor, a court, or the public — one endpoint, one bundle,
  one schema (AIE-1).
- **The host certifies replayability, never facts.** An entry means "this
  bundle replays to the recorded verdict on these exact bytes" — never "these
  allegations are true". Facts stay with the incident owner.
- **Nothing is ever deleted.** Failures, disagreements, and withdrawals stay
  in the registry with their history — a destroyed entry would be
  indistinguishable from a censored one.
- **Every claim is CI-executed.** The launch post itself is a registry
  consumer: the feed at
  https://eslam-x.github.io/coreguard/raer/feed.json is derived from
  https://eslam-x.github.io/coreguard/raer/registry.json by a pinned
  generator, and a contract test fails the push if they ever drift.

The registry already carries the two publicly reported incidents everyone
quotes — the reported runaway-agent image leaks and the reported Hugging Face
platform compromise — as `AWAITING_BUNDLE` entries: recorded with attribution
to their public source record, asserting no fact about the allegations, and
waiting for the party that holds the evidence to file it. Zero bundles have
been replayed yet; one labeled synthetic demo (`RAER-2026-0001`, `DEMO`)
proves the mechanics end-to-end. The value is the mechanics and the neutrality
policy, not a count.

The next time a multi-month review is announced, the question is no longer
"who investigated?" — it's "which verdicts replay?".

- Registry: https://eslam-x.github.io/coreguard/raer/registry.json
- Feed: https://eslam-x.github.io/coreguard/raer/feed.json
- AIE-1 spec (every claim CI-executed):
  https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md
- Live review page (no server, no clone):
  https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
- Repo: https://github.com/EslaM-X/coreguard

Critique welcome — including "your threat model is wrong because X". A
documented external critique upgrades the standard; that's a win we count.
✂️ انتهِ

**ترتيب النشر:** 7أ أولًا، ثم 7ب بعد 48–72 ساعة. (باكات X المقيسة ≤280:
`docs/outreach/x-thread-packs.md` — A1–A11 ثم B1–B11.)

## 8) Reddit — نفس جسمي LinkedIn مع افتتاحية جاهزة لكل مجتمع
- r/MachineLearning: `We built a CI-verified incident-review surface for runaway-agent cases (open source). The launch note:`
- r/AI_Agents: `If you run agents in production, this is the review surface you'll wish existed after the first incident:`
- r/LocalLLaMA: `Open-source, zero-dependency, MIT — a replayable incident-review gate you can self-host:`
اقرأ قواعد كل سبريدت قبل النشر؛ اربط الإيميل والردود على نفس انضباط السجل.

## 9) القنوات العربية — منشور إطلاق RAER العربي
المصدر الموقّع: `docs/outreach/public-post-raer-launch-ar.md` ☑ — انسخ من
«العنوان: عند إعلان الحادثة القادمة…» حتى «…وهذا مكسب نحتسبه.»

## 10) المتابعة بعد 7–10 أيام (رسالة واحدة، بلا تكرار نص)
✂️ ابدأ (EN)
Following up on my note about CoreGuard/AIE-1 — the replayable
incident-review surface. The live page now also reports its own measured
verification time in-tab. Would a 30-minute walkthrough (live page + a
cold-clone replay) be useful to your team? No commitment implied.
✂️ انتهِ
✂️ ابدأ (AR — لـAIC فقط)
أتابع رسالتي عن CoreGuard/AIE-1 (سطح مراجعة حوادث قابل لإعادة التشغيل).
صفحة العرض الحية تعرض الآن زمن تحقق مقاسًا حقيقيًا داخل المتصفح. هل يكون
عرض 30 دقيقة (الصفحة الحية ثم إعادة تشغيل من استنساخ بارد) مفيدًا لفريقكم؟
بلا أي التزام.
✂️ انتهِ

## 11) الردود الجاهزة (انضباط السجل — لا ألطف ولا أقسى)
| السؤال | الرد (EN) | الرد (AR) |
|---|---|---|
| «هل تبنّاكم أحد؟» | Not yet; the surface is public. | ليس بعد؛ السطح عام. |
| «إيه الـRAER ده؟» | The registry is the invitation — file a bundle or watch one replay. | السجل هو الدعوة — قدّم حزمة أو شاهد إعادة تشغيل. |
| نقد («نموذج التهديد غلط») | Thank you — a documented critique upgrades the standard; we count it. | شكرًا — النقد الموثق يرقّي المعيار ونحتسبه. |
| تلميح لشراكة | No partnership or endorsement exists; everything is checkable in one click. | لا شراكة ولا تأييد قائم — كل شيء يُتحقق منه بنقرة. |
| «ده مجرد موقع» | Run the cold-clone replay: two documented one-liners, byte-identical verdict. | شغّل إعادة التشغيل من الاستنساخ البارد: سطرا أوامر موثقان وحكم متطابق بالبايت. |

**يُمنع منعًا باتًا:** نسب أي إعلان لحادثة لأي شركة بلا مصدر منشور (صياغة الخبر «العاجل» المنسوب لشركة بلا مصدر منشور = مثال نمط يُناقَش فقط)، وادعاء تبنٍّ أو
تمويل أو براءة قبل حدوثها — أرقام الحوادث المقتبسة من
https://eslam-x.github.io/coreguard/raer/feed.json حصرًا.
