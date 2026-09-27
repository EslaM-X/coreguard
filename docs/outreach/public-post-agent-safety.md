# Public post draft — agent-safety communities (AIE-1)

> **B6 gate: unsigned owner draft — do not post before the recorded sign-off.**
> Style discipline: the People's Court thread record — facts only, verbatim
> checkable, no new claims, no implied endorsement, no asks beyond "look".

---

**Ready-to-post text** (X/LinkedIn/Reddit — split at the horizontal rules for
threads; every factual line traces to the repo or a public source):

---

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

---

> **Owner gate record:** ☐ post approved — platform(s): ________ — name/date: ________
>
> **Posting notes (owner, not for publication):** comment replies must keep
> the ledger discipline — any "has anyone adopted you?" gets the honest "not
> yet; the surface is public" and nothing softer or stronger. Screenshots of
> the live page are encouraged (the page *is* the pitch). Never post under a
> partner's or lab's name.
