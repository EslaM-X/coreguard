# Phase A — People's Court technical follow-up (draft, ONE message, no chasing)

**ARCHIVED AS POSTED — 2026-09-25T15:45:07Z.** This message was posted to
thread #21788 as a reply to the counterparty's last critique (`#18570343`) —
comment `DC_kwDOMT5cIs4BG9ep` (dbId 18601897):
https://github.com/elizaOS/eliza/discussions/21788#discussioncomment-18601897.
The text below is the **verbatim posted message**; its 1033/780 figures are the
post-time snapshot facts of that message and stay frozen here as the archive.
New claims must cite the then-current snapshot at the time of any later post.

Owner-process note: this was posted by the owner-directed agent reply
(2026-09-25). Nothing here is auto-sent; nothing is scheduled; nothing asks for
a reply.
The design rule after the 2026-09-23 18:15 correction round: we send exactly one
technical artifact update, then wait indefinitely. No follow-up akten, no
"bumping", no timeline expectations. The clock restarts only if they reply.

## Why one update is justified (facts only)

- The thread's last exchange (read-only critique 2026-09-23 17:23 → correction
  `1e75fba` → our reply 18:15:37, `#18570936`) closed with us holding the ball.
- Since that reply, `v0.5.14` shipped end-to-end (ADAL/1 + AEA/1 + adapter +
  reference tribunal) and this session's canonical measured state made **every
  number we could ever state re-producible on a fresh clone** (1033 tests
  CI-enforced against `docs/state-snapshot.json`, boundary audit 0 violations,
  780-file committed-tree scope, docs-node contract live).
- That is a genuine change in the artifact's verifiability since our last
  message: worth exactly one message, nothing more.

## Hard boundary lines (unchanged from every prior round)

- NO endorsement / partnership / "joint project" / "interested in funding"
  framing — the People's Court engagement is an external technical signal.
- NO claim they ran anything; NO "their critique led to our roadmap".
- NO asks: not for a review, not for an integration, not for a conversation.
  "If useful, it can be inspected or run as-is" is the only offer.
- NO timing pressure; NO expectation management (no "we look forward").
- They are free to reply; we do not chase. If they never reply, the thread is
  CLOSED BY RECORD, not by silence.

## The message (posted verbatim, EN — reply to `#18570343`)

> Thanks for the close read — both label ambiguities are now resolved at the
> schema level and locked by regression tests, and the artifact has moved
> further since the correction round.
>
> 1) Modeled consent is no longer a boolean aggregate. `consent.modeledAssent`
> is a derived tri-state among FULL | PARTIAL | MISSING | UNKNOWN, computed from
> the party-level assent fields it names via `modeledAssentDerivedFrom`; the
> schema note forbids reading it as bilateral assent. In the B fixture,
> `parties.principalB.assent` remains UNKNOWN and is never filled from a
> receipt.
>
> 2) Settlement evidence status is separated from actual status.
> `compensationSettlement` no longer carries a boolean NOT_SETTLED; it now
> records `evidenceStatus = NOT_EVIDENCED_AS_SETTLED` plus `actualStatus =
> UNKNOWN`. Absence of settlement evidence is recorded as not-evidenced, never
> as a verified nonpayment finding — the same shape is used in the canonical
> `execution-attestation.json`.
>
> Both behaviors are pinned by regression tests (assent-pair 11/11, fixture
> honesty contract, expected-field-map).
>
> Since the correction round the artifact has kept moving. The currently
> measured committed state — reproducible on a clean clone across Node 18/20/22 —
> is 1033 tests with the total enforced against a committed snapshot (a stale
> figure anywhere fails the build), 780 committed files with 0 boundary
> violations, and a live docs-node contract. The integration surface is
> recorded honestly at L0: all three adapters sit at NOT_BUILT/NOT_PERFORMED,
> adoption counters are 0 until something real is recorded, and no live
> authority, credential, or settlement is claimed.
>
> Anything here can be inspected or run as-is (`npm ci && npm test && npm run
> boundary:audit`). No asks.

## Posting checklist (owner)

1. Verify today's artifact state claims are still true the day you post
   (`npm test` green; `node scripts/current-state.mjs --check` → CHECK OK).
2. Trim or reformat the code lines above to GitHub Discussion Markdown.
3. Post under the existing #21788 thread (not a new thread), your account.
4. After posting: record date/time + comment id in
   `docs/elizaos-thread-replies-record-2026-09-23.md` (or its successor record).
5. Do nothing further regardless of silence. No bump. Ever.