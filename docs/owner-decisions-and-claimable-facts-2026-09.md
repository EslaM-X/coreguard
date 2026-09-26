# Owner decisions & claimable facts — 2026-09

This is the single instrument that turns "what is actually done" into exactly
what the owner may say publicly (facts with machine proof), and exactly which
two decisions remain the owner's — in plain words, with the authorize sentence.

Status: **recording + planning only.** Nothing here performs a live action.
This document changes no status: every surface stays DRY-RUN / NOT_AUTHORIZED
until an explicit per-step owner sign-off exists (phase-3 plan §5, binding).

---

## 1. What is actually executed (repo-internal, machine-proven)

| Capability | Where it lives | Proof (reproduces locally) |
|---|---|---|
| Evidence model + offline proof | whole repo | `npm test` → **1061 pass** — machine-pinned: `scripts/run-tests.mjs` enforces the total vs `docs/state-snapshot.json` (drift = red) |
| Canonical measured state (single source for every cited number) | `docs/state-snapshot.json` + `scripts/current-state.mjs` | `npm run boundary:audit` → **796 files (committed tree), 0 violations** · `node scripts/current-state.mjs --check` → CHECK OK |
| Docs-node contract (executable docs stay runnable) | `test/ci/docs-node-contract.test.js` | 70 executed · 53 skip-listed · 18 docs covered |
| Live-submission harness (recorded feed, webhooks DRY-RUN, x402 DRY-RUN) | `packages/peoples-court-adapter/` | `npm run peoples-court:harness` → 11/11 |
| Boundary enforcement (fail-closed) | `scripts/boundary-audit.mjs` + `test/ci/boundary-enforcement.test.js` | `npm run boundary:audit` → PASS |
| CI green on every push (all 4 gates) | `.github/workflows/` | `gh run list --branch main` |

## 2. The three "we will not claim" bullets — what you MAY now say (truthfully, with proof)

These are not capabilities waiting to be implemented — they are refusals that
are ALREADY true and machine-enforced. You do not "claim" an enforcement after
implementing it; you *present the proof*. Precise wording below (say exactly
this; nothing more).

**Bullet 1 — "No live integration; surfaces are DRY-RUN"**
| EN | AR |
|---|---|
| "The integration surfaces are DRY-RUN. No live network call exists — the repo's own audit refuses any file that claims a performed call." | "أسطح التكامل في وضع DRY-RUN. لا توجد أي مكالمة شبكة حيّة — مدقّق المستودع نفسه يرفض أي ملف يدّعي حدوث مكالمة." |
Proof: `npm run boundary:audit` refuses `networkCall` ≠ `NOT_PERFORMED`.

**Bullet 2 — "No credential for any party is stored in the repository"**
| EN | AR |
|---|---|
| "No credential of any party is stored in this repository — the audit proves it, and git is prevented from ever tracking a local env secret file." | "لا يُحفظ credential لأي طرف داخل المستودع — يثبت ذلك المدقّق، وgit ممنوع من تتبّع أي ملف أسرار محلي". |
Boundary of that truth: scope it to **"in the repository"** — never
"nowhere exists". A `.env` with real keys lives on the developer machine,
is gitignored and never tracked (guard asserted by a test), and its content is
excluded from the audit by design. Say the repo-level fact; never the
universe-level fact.
Proof: `npm run boundary:audit` + `test/ci/boundary-enforcement.test.js`
(git-tracking guard).

**Bullet 3 — "No settlement authority, no Mainnet broadcast, no escrow —
CONDITIONAL NO-GO, deployed:false"**
| EN | AR |
|---|---|
| "Settlement, Mainnet broadcast, and escrow deployment are structurally refused by the repo's audit — the project literally cannot silently claim them." | "التسوية والبث على الشبكة الرئيسية وفتح escrow مرفوضة بنيوياً بمدقّق المستودع — المشروع لا يمكنه زمنياً ادّعاؤها بصمت." |
Proof: `npm run boundary:audit` refuses execution-request fields
(`deployed/broadcast/releaseFunds/settled/…`) and any `awardSlot.status` ≠
`UNKNOWN`.

Public posture suggestion: combine bullets as one line —
"We are the project that cannot lie by accident: the repo hard-refuses any
file that claims a live call, a stored credential, or a settlement."

## 3. What must NEVER be claimed (word-for-word red lines)

- "We have a live integration / it went live" (unless a recorded confirmation
  fixture exists from an authorized step).
- "People's Court awarded / approved / endorsed / partnered with us".
- "We hold a credential" or "we can settle / release funds / sign".
- Any status past DRY-RUN / NOT_AUTHORIZED without a recorded confirmation.
- Any dollar/funding outcome, timeline, or "the incubator accepted us".

## 4. The two decisions that remain yours (plain words)

### What "the Phase 3 decision" means (clarification, 2026-09-25)

Terminology quirk: `L1/L2/L3` appears twice in this repo with two different
meanings. For the integration boundary (this section), **L1/L2/L3 are the ONLY
three live steps toward a real integration** — L1 a live authority grant, L2 a
live `adjudication.prepare()` packet, L3 a live webhook replay (full detail in
`docs/execution-kit-integrator-2026-09.md`). The unrelated meaning lives in
ARCHITECTURE.md (L1 receipt pinning / L2 replay — chain-verification depth);
that one needs no decision.

So "the Phase 3 decision" = exactly two questions, both yours:
- **Decision A — scope**: which of those three live steps do you ever
  authorize (L1 only / L1-L2 / L1-L3 — or none, which is a valid answer and
  costs nothing).
- **Decision B — identity**: who, if anyone, is the **credential-holding
  integrator** who will run the authorized step(s) (you with a test account, a
  named partner/institution, or nobody for now).

**Both are now MADE — 2026-09-25, owner, recorded as binding.** Factored
decision, not a power delegation:

- **Decision A — scope: recognized, and answered with a ceiling, not an
  authorization.** No L1/L2/L3 step is ever authorized without a named
  integrator **and** a per-step recorded owner approval; L1 (authority-grant
  live capture) is sandbox-authorization level only, and only once a named
  integrator exists; L2/L3 live executions are pilot-only, only when a real
  partner/institution exists; **automatic settlement is not authorized, ever.**
  Until then everything stays DRY-RUN with `integrationStatus` NOT_BUILT — the
  honest ceiling today, **L0**.
- **Decision B — identity: nobody for now.** The credential-holding integrator
  is declared **undefined**; the definition is deferred to the moment a real
  partner + concrete use case exist, and the repo records the named holder then
  (no standing authority).

Execution consequence: the adoption ladder — unified states · transition
machine · CoreGuard Conformance Suite (CG-CS/1) · Evidence Passport · Adoption
Dashboard — is built and runs offline as an honest enforcement matrix
(`scripts/ladder/`, `npm run ladder:status`); every live gate structurally
requires the two recorded conditions above, so no branch can ever ship a live
step without them. Normative doc:
`docs/live-integration-and-adoption-ladder-2026-09-25.md`.

باختصار بالعربية: «قرار Phase 3» ليس شيئًا تقنيًا غامضًا — هو سؤالان لك فقط:
**(أ) نطاق** أيٍّ من خطوات التكامل الحي الثلاث تسمح يومًا ما بأن تُنفَّذ (أو لا
شيء، وهذا صحيح ولا يكلفك شيئًا)؛ **(ب) هوية** من هو الشخص/الكيان الحقيقي الذي
بحوزته حساب اختبار منصة التحكيم سينفّذ الخطوة المأذون بها. **وقد اتُّخذ القراران
وسُجِّلا كقرارين ملزمين (2026-09-25)**: (أ) لا يُسمح بأيٍّ من L1/L2/L3 دون
**integrator مُسمّى + موافقة مالك مسجلة لكل خطوة**؛ L1 = إذن sandbox فقط عند وجود
المُدمِج؛ L2/L3 = تجربة تجريبية فقط مع شريك حقيقي؛ **التسوية التلقائية ممنوعة
أبدًا**؛ السقف الحالي L0 بأمانة. (ب) **لا أحد حاليًا** — حامل credential غير
معرّف، ويُعرَّف ويُسجَّل اسمه عند ظهور شريك حقيقي مع حالة استخدام ملموسة.
أبسط خيار صالح بقدر السقف: «لا شيء بعد» — والمشروع كامل الفائدة كما هو.

**Decision A — among the three planned live steps, which do you authorize,
ever?** You do not have to decide anything to run L0 forever (the finished
engine + boundary layer). The live steps are:

- L1 — a real authority-grant posted by a credential-holder; the platform's
  confirmation binding is compared against our DERIVED candidate and recorded
  as a fixture (source URL + hash).
- L2 — our prepared `adjudication.prepare()` packet accepted by a live surface.
- L3 — a real webhook stream replayed by our consumer with dedup + cursor.

Each needs a **credential-holding integrator** = a real human/institution that
has a People's Court credential + test account (the repo never stores or
simulates one). The exact authorize sentence, when you want it:

    Authorize: [L1-L3, L1-L2, or L1 only]. Integrator: [name/institution].
    Record results per the phase-3 plan. No standing authorization.

**Decision B — who is the integrator?** Options, honestly stated:

- You, operating the credential — you would provide the test-account access so
  a real grant can be posted; the agent then only records the public
  confirmation as a fixture (never touches the credential).
- A named partner/institution you bring; the agent prepares the packet and the
  recording pipeline; the partner posts.
- Nobody for now → stays DRY-RUN. Nothing is lost; proof value is already in §1.

## 5. What happens the moment you give a decision (turnkey, no standing authority)

1. You give the authorize sentence (Decision A) + name the integrator (B).
2. Record your decision in `docs/OWNER-DECISIONS-2026-09.md`-style signed
   record (attribution: you), stating the exact scope and the no-credential
   rule stays.
3. Prepare the concrete packet for the authorized step (L1/L2/L3) under
   `packages/peoples-court-adapter/`, still `NOT_PERFORMED` until the
   integrator's real operation exists.
4. Integrator posts; the public confirmation is captured as a **recorded
   fixture** and the surface status moves from DRY-RUN to recorded live slice —
   with wording approved in §3 (no settlement/Mainnet/endorsement language).
5. Boundary audit + full suite re-run; commit + push + CI.

Each step is a separate explicit decision — approving this list authorizes
nothing itself.

## 6. If you never decide

Nothing is blocked that was promised. Everything in §1 is real and finished;
the phase-3 plan stays planning-only by contract (§5 "no standing
authorization"), and that is exactly the discipline a funder's due diligence
rewards.

## 7. Strategy decisions — adoption mode entered (2026-09-25, owner, binding)

1. **Hardening is paused; adoption starts.** No further hardening work before
   the campaign runs; returns now come from external consumption, not new
   internal checks.
2. **Success is defined once**: independent external consumption of the
   evidence package (someone outside runs/verifies/links/forks an EVP/1 or
   ADAL/1 artifact, or a third-party critique that upgrades the standard).
   Reply counts and artifact-free praise are explicitly NOT success.
3. **People's Court is not a gate.** One Phase A message, then Phase B
   proceeds regardless of their silence; the engagement remains an external
   technical signal only (never endorsement).
4. **Phase A is exactly one short technical message**: "We kept building. The
   current artifact is now mechanically anchored and reproducible across Node
   18/20/22. If useful, you can inspect or run the current evidence package."
   No asks, no bumping, ever. (Message-ready draft:
   `docs/phase-a-people-court-followup-draft-2026-09-25.md`.)
5. **No v0.7.x on commit count.** A new release requires one of four external
   triggers: an external verifier ran the package; a first integration pilot;
   a first real adapter consumer; a first paid verification/conformance
   engagement.
6. **Monetization/integration language is phase-C only and never "buy
   CoreGuard"** — always: "you have a dispute/agent/escrow system; CoreGuard
   can be the evidence + verification boundary between execution evidence and
   adjudication/settlement", addressed to courts, agent-commerce systems,
   ODR, escrows, and the Core ecosystem without binding the project to one
   court.
7. **Execution tooling for the campaign**: letters, KPI, ledger, versioning
   policy, and per-track gates live in
   `docs/campaign-ops-outreach-kit-2026-09-25.md` — the operating doc of this
   phase.
8. **The adoption ladder is the operating architecture for every live step.**
   Live Integration & Adoption Ladder (L0–L8), unified integration states
   (13), transition state machine with guards, CoreGuard Conformance Suite,
   Evidence Passport, and Adoption Dashboard are implemented and enforced
   offline (`scripts/ladder/` + `test/integrations/`, doc:
   `docs/live-integration-and-adoption-ladder-2026-09-25.md`). No L1/L2/L3
   step, no PRODUCTION state, and no external milestone counter moves without
   the two recorded conditions from §4 (named integrator + per-step owner
   approval; Dec A/B as decided 2026-09-25). B1–B6 letters each still need a
   separate owner sign-off before sending.

## 8. Strategy decisions — continuous build + adoption (2026-09-26, owner, binding)

1. **Never wait for an external milestone.** The build track and the adoption
   track run in parallel; the engine is the product, adoption is the path. No
   silence from any counterparty (People's Court, a company, a funder, an
   integrator) ever pauses the build.
2. **The platform is now the operating surface**: the L0–L4 verification
   protocol, the 13-state integration machine, the six-method adapter contract,
   the Partner Sandbox, the Attack Lab, local observability, Evidence Passport
   v2 and the Control Plane are all implemented and enforced offline
   (`docs/verification-and-integration-platform-2026-09-26.md`).
3. **L1 honesty hinge (binding)**: a format-valid receipt without a chain
   confirmation is `UNKNOWN/NO_CHAIN_EVIDENCE`; a chain that contradicts it is
   `MISMATCH`. Structure alone never yields VERIFIED.
4. **`UNKNOWN ≠ FAILED ≠ VERIFIED` is a platform rule**, not a slogan: every
   machine record, sandbox scenario and attack case carries a verdictCode, and
   no path upgrades a partial pass.
5. **L4 stays RESEARCH.** The provider interface is frozen; "ZK supported" is
   never claimed before a real circuit, prover, verifier, benchmark and
   conformance exist.
6. **Reputation counts external milestones only.** Engineering signals (tests
   green, conformance pass, replay verified) are recorded evidence and never
   move the score; unknown kinds and counters are ignored, never invented.
7. **Zeros stay zeros.** Revenue `$0`, customers 0, partners 0, reputation
   UNPROVEN — a trust feature, never hidden behind a percentage. The Control
   Plane prints no invented percentage at all.
8. **A stale number in any document is a failing build.** Every count is
   machine-measured into `docs/state-snapshot.json` and enforced by
   `scripts/run-tests.mjs`; the current sync is 1061/1061 tests, 796 committed
   files, 0 violations, docs-node 70·53·18.
9. **B1–B6 keep their gates; B6 is OWNER SIGN-OFF REQUIRED.** The platform
   build continues in parallel with the outreach tracks; no letter, no message
   and no follow-up leaves the repo without its recorded owner gate.
10. **v0.4 is research-only** (the L4 interface boundary); the next release
    still waits for one of the four external triggers in §7.5 — shipping
    platform capability is not a release trigger.