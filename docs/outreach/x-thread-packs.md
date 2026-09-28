# X thread packs — paste-ready, derived from the two ☑-approved posts

> **B6 status:** this file contains **no new claims** — it is the approved
> texts of `public-post-agent-safety.md` and `public-post-raer-launch.md`
> split into X-sized posts. The gate records in those two files govern these
> threads verbatim (X only this cycle; replies under the same ledger
> discipline). Every post measured ≤ 280 characters at authoring
> (2026-09-28, X limit).

---

## Thread A — AIE-1 (agent-safety communities)

**A1/8**
For the past months, the agent-safety headlines have repeated one shape:
runaway agents leak user data or abuse a platform, the company announces an
investigation, and the review "may take months."

We didn't build a faster announcement. We built the missing review surface.

**A2/8**
The structural problem, stated plainly:
in every one of these incidents, the investigating party collects its own
evidence, runs its own tooling, and produces a verdict nobody outside can
re-derive from the same bytes. Months pass. Outsiders can only trust — or
speculate.

**A3/8**
We shipped the missing piece, open source: AIE-1 — the Agent Incident
Evidence surface. One verification endpoint, one evidence bundle, one report
schema.

Replayable from a cold clone: a reviewer stands up the same gate with two
documented one-liners and re-runs the same bundle.

**A4/9**
Deterministic by contract: same bytes in → byte-identical verdict out —
asserted by tests, not promised.

**A5/9**
Byte-anchored: every artifact is sha256-pinned; the engine re-computes each
pin on every run. A single flipped byte is refused and NAMED:

logo.svg: recorded 0x43233704… != actual 0xc3233704…

**A6/9**
Fail-closed everywhere: identity comes from the socket, never forwarded
headers. A rejected bundle's acceptance predicate is never even consulted.

One verdict language: the SDK gate (releaseWhen) and the wire guards
(403/429/413/422) speak the same named-reasons format.

**A7/9**
See it run in one click — no server, no clone, the real embedded engine:
https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html

(paste your own evidence bundle as JSON, or click honest / tamper /
structural-refusal and watch the fail-closed verdict in your tab)

**A8/9**
The honest claims ledger:
— The surface exists, is open source, and its spec's claims are executed by
CI on every push. → TRUE, checkable.
— Deterministic replay + named tamper. → TRUE, contract-tested.

**A9/10**
— Any lab using it for a real incident review. → has not happened.
— Any partnership or endorsement. → none exists.

**A10/11**
We are not announcing a customer or an adoption. We are announcing that the
review surface the next incident will need is public, CI-verified, and one
click away — so the next months-long review has somewhere to start that
isn't zero.

**A11/11**
Repo: https://github.com/EslaM-X/coreguard
Spec (every claim CI-executed):
https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

---

## Thread B — RAER launch (posts AFTER thread A settles; cite the feed, quote no incident numbers)

**B1/10**
When the next AI-agent incident is announced, ask one question:
which verdicts replay?

Every runaway-agent incident follows the same script: the lab announces it,
opens a review, and months later we get a summary nobody outside the room
can check.

**B2/10**
Today we're launching RAER — the Replayable Agent-Incident Evidence Registry
— as open infrastructure.

Any party can file a replayable evidence bundle: the investigating lab, a
regulator, an auditor, a court, or the public — one endpoint, one bundle, one
schema (AIE-1).

**B3/10**
The host certifies replayability, never facts.

An entry means "this bundle replays to the recorded verdict on these exact
bytes" — never "these allegations are true". Facts stay with the incident
owner.

**B4/10**
Nothing is ever deleted.

Failures, disagreements, and withdrawals stay in the registry with their
history — a destroyed entry would be indistinguishable from a censored one.

**B5/10**
Every claim is CI-executed. This launch post itself is a registry consumer:

the feed at https://eslam-x.github.io/coreguard/raer/feed.json is derived
from https://eslam-x.github.io/coreguard/raer/registry.json by a pinned
generator — and a contract test fails the push if they ever drift.

**B6/10**
The registry already carries the two publicly reported incidents everyone
quotes as AWAITING_BUNDLE entries:

the reported runaway-agent image leaks, and the reported Hugging Face
platform compromise.

**B7/10**
Attributed to their public source record. Asserting no fact about the
allegations. Waiting for the party that holds the evidence to file it.

**B8/10**
Zero bundles have been replayed yet; one labeled synthetic demo
(RAER-2026-0001, DEMO) proves the mechanics end-to-end.

The value is the mechanics and the neutrality policy, not a count.

**B9/11**
Registry: https://eslam-x.github.io/coreguard/raer/registry.json
Feed: https://eslam-x.github.io/coreguard/raer/feed.json

Live review page: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
Repo: https://github.com/EslaM-X/coreguard

**B10/11**
Spec (every claim CI-executed):
https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

Critique welcome — including "your threat model is wrong because X".
A documented external critique upgrades the standard; that's a win we count.

**B11/11**
The next time a multi-month review is announced, the question is no longer
"who investigated?" — it's "which verdicts replay?"

---

## Posting order & rules (from the gate records)

1. **Thread A first.** Let it settle; work replies under the ledger
   discipline (the approved posting notes in `public-post-agent-safety.md`).
2. **Thread B second**, citing the live feed counts as the only quotable
   numbers. A disagreement with the feed is a bug — fix the feed, not the
   quote.
3. "Has anyone adopted you?" → "not yet; the registry is the invitation."
4. "You're just a website" → the cold-clone replay demo, not adjectives.
5. LinkedIn/Reddit: **deferred this cycle** by the same gate records.
