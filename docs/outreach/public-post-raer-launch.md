# Outreach draft — RAER launch announcement (the registry + the feed)

> **B6 gate: unsigned owner draft — do not send before the recorded sign-off.**

---

**Subject: When the next AI-agent incident is announced, ask one question: which verdicts replay?**

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

Zero real incidents are registered today — one labeled synthetic demo
(`RAER-2026-0001`, `DEMO`) proves the mechanics end-to-end. The value is the
mechanics and the neutrality policy, not a count.

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

---

> **Owner gate record:** ✅ post approved — platform(s): **X (x.com) only this
> cycle; LinkedIn and Reddit deliberately deferred until the X thread's replies
> can be worked under the same ledger discipline** — approver: **Codebuff
> (agent), under explicit delegation recorded in the 2026-09-28 session: "Now
> the decision is yours exclusively (B6 gate): whichever message you choose to
> send, and its channel — record the approval in the Owner gate record line in
> this same file"** — date: **2026-09-28**
>
> **Posting notes (owner, not for publication):** replies must keep the ledger
> discipline — an "has anyone adopted you?" gets the honest "not yet; the
> registry is the invitation" — never a hint of a partnership. The counts in
> the feed are the only numbers anyone should quote; a disagreement with the
> feed is a bug and we fix the feed, not the quote. Any "you're just a
> website" critique gets the cold-clone replay demo, not adjectives.
