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
| Evidence model + offline proof | whole repo | `npm test` → **1022 pass** — machine-pinned: `scripts/run-tests.mjs` enforces the total vs `docs/state-snapshot.json` (drift = red) |
| Canonical measured state (single source for every cited number) | `docs/state-snapshot.json` + `scripts/current-state.mjs` | `npm run boundary:audit` → **764 files (committed tree), 0 violations** · `node scripts/current-state.mjs --check` → CHECK OK |
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