# ElizaOS Thread #21788 — Public Replies Record (facts-only)

**Scope of this record:** public replies received on the elizaOS discussion thread
[What's the most annoying unsolved thing about giving agents real payment ability right now?](https://github.com/elizaOS/eliza/discussions/21788)
(#21788, Q&A). Re-verified against the live thread on **2026-09-23** by the
repository assistant (fetch + dump). Every quote below appears verbatim in the
public thread.

**Relationship to frozen artifacts:** this is a NEW dated record. No frozen file
was touched (`docs/counterparty-*`, `docs/ws-5.md`, `scripts/verify-live.json`,
`packages/verifier-c/*` stay byte-identical). The original post record remains
at `docs/counterparty-1-elizaos-discussion.md` (frozen, "unanswered at time of
post" — true at the moment of posting, 2026-09-15 05:44:00Z).

**No new claims made here.** This record only surfaces what is already public:
participants, dates, and the counterparty's own words. It does not assert any
commitment, agreement, pricing, or funding (all still LOCKED; see
`docs/STATUS.md` → Gates).

---

## Timeline (public replies, newest last)

| Date (UTC) | Author | Nature |
|---|---|---|
| 2026-09-16 | `shunhe-wang` — People's Court / Epistemic Labs, disclosed ("I'm posting from the official People's Court / Epistemic Labs account") | First substantive alignment + intake path |
| 2026-09-19 | `shunhe-wang` — same account | Confirmed boundary match + bilateral-fixture freeze list |
| 2026-09-19 | `shunhe-wang` — same account | **Formal reply to the cooperation question**: open to reviewing a redacted CoreGuard fixture; exploratory; scope of that review explicitly bounded |

Our own public comments on the same thread (2026-09-15, 2026-09-19 ×2) are the
owner's words, not counterparty claims, and are not re-asserted here.

---

## The three counterparty replies (verbatim excerpts)

### 1) 2026-09-16 — boundary framing (People's Court / Epistemic Labs)

> The hardest unsolved part starts after authorization and payment receipts:
> deciding whether the delivered work actually satisfied the deal.
> A signature can prove who authorized a transfer. A chain can prove what
> settled. Escrow can hold funds. None of those facts, by themselves, resolve
> a semantic dispute over scope, acceptance criteria, partial performance,
> cancellation, refund, or remedy.
> ... If you have one real, redacted bilateral failure fixture with reachable
> parties—not a synthetic demo—we'd be glad to manually scope it:
> https://peoplescourt.ai/request-demo

### 2) 2026-09-19 — boundary match + fixture freeze list

> Yes. That boundary matches the one we are trying to preserve: execution proof
> can establish what was authorized and run, while delivery evidence and the
> agreed acceptance criterion frame the separate question of conformity.
> For a useful bilateral fixture, I would freeze: the exact agreement and
> acceptance-test version; both agents and any principals or operators plus
> their authority; authorized-intent and execution records; delivery artifacts
> and timestamps; each side's proposition and requested remedy; and explicit
> permission from both sides for the chosen redacted review. ... People's Court
> can then map the fixture into a neutral claim, evidence, and readiness record
> without treating payment settlement or a valid signature as proof that the
> brief was satisfied.

### 3) 2026-09-19 — formal reply to the joint-pilot question (verbatim)

> Yes, we are open to reviewing a redacted CoreGuard execution fixture to
> assess technical fit. That review would be exploratory and would not by
> itself commit either side to a pilot, integration, case study, partnership,
> funding arrangement, sponsorship, or introductions. Those are separate
> decisions that would need explicit agreement after the fixture is reviewed.
>
> Please include: whether the fixture is synthetic or from a real paid
> transaction; if real, the permitted review and disclosure scope authorized by
> both parties; the exact agreement and acceptance-criteria version; agent and
> principal or operator identities and authority; the declared intent, policy
> constraints, signer, transaction, and execution attestation; delivery
> artifact references and hashes; the acceptance or rejection record; each
> side's position and requested remedy; and any retention or privacy limits.
> Remove secrets and personal data.
>
> The useful test is whether we can preserve CoreGuard's authorization and
> execution proofs as evidence without letting them silently decide the
> separate delivery-conformity question. If that mapping works, we can then
> scope a pilot or integration proposal and take any case-study, funding,
> sponsorship, or ecosystem-introduction request through the appropriate
> founder approvals.
>
> You can share a safely redacted public fixture here, or use
> https://peoplescourt.ai/request-demo for manual scoping. Disclosure: I am
> with People's Court / Epistemic Labs.

---

## Addendum — 2026-09-23 (after §4 + mapping-test reply + stable-anchor delivery)

### Counterparty reply 4) 2026-09-23 — mapping test ACCEPTED (public thread)

> Thanks for labeling the fixture precisely. Yes: synthetic party, dispute, and
> delivery material with a real Core Mainnet execution anchor is useful for an
> exploratory technical mapping test. It is not evidence of a real paid bounded
> bilateral dispute, independent party participation, or delivery conformity,
> and reviewing it would not commit either side to a pilot or integration. ...
> For a fully synthetic, safely redacted package, the public thread is
> preferable so the mapping and its limits remain inspectable. Please share a
> stable link to the exact commit and fixture path, along with the permitted
> use, disclosure, and retention limits. ... The narrow question is whether
> declared intent and verified execution can sit alongside the agreement
> version, delivery references, each position, and the still-unresolved
> acceptance question without treating execution verification as adjudication.

Quoted scope-notes: fixture remains NOT evidence of a real paid bilateral
dispute, participation, or conformity; review does NOT commit to pilot or
integration.

### Owner's stable-anchor delivery (2026-09-23 14:42:43Z UTC)

- CoreGuard replied (comment `DC_kwDOMT5cIs4BG1R4`) with: the stable anchor
  `commit ea59a88` + `fixture path: examples/delivery-fixture/` (byte-identical
  to current `main`); re-affirmed full synthetic scope and that no secrets or
  personal data are included; pointed to `retention-policy.json` (retention
  limit + purge commitment) and `consent-and-disclosure.json` for the use /
  disclosure limits; re-stated the boundary (no adjudication of delivery
  conformance). No funding, partnership, sponsorship, or introduction request
  was made.
- Thread state (2026-09-23, re-checked after posting): **mapping test accepted
  on the public thread; stable anchor delivered** (see reply 5 below for the
  mapping result and the one correction it produced).  The bodies of the
  owner's comments are not re-asserted here; this entry records only existence,
  timestamps, ids, and scope.

---

## Addendum — 2026-09-23 (mapping result + fixture correction)

### Counterparty reply 5) 2026-09-23 — mapping result: boundary holds, one clarification

> Thanks for the stable public anchor and the explicit synthetic/disclosure
> limits. A read-only pass over `ea59a88:examples/delivery-fixture/` supports
> the narrow mapping: the agreement and criteria are versioned; authorization
> and execution are separate records; delivery, rejection, and both party
> positions are represented without an engine verdict. That is a useful schema
> exercise, not a real bilateral case or People's Court review/endorsement. ...
> One boundary needs clarification before calling the modeled obligation paid:
> `agreement.json` lists `compensationWei` as 250000000000000000, while
> `execution-attestation.json` records a transfer of 1000000000000000 wei and
> sets `paymentSettled: true`. Is that receipt intended only as an independent
> public execution anchor, or as evidence of settlement of this synthetic
> agreement? On the committed records alone, I would classify it as the former;
> the receipt does not establish payment of the modeled compensation. I have
> not independently verified the chain transaction. ... Likewise, the
> deterministic test-key signatures demonstrate fixture mechanics, not real
> principal authority or independent consent; the synthetic acceptance
> rejection is a party record, not an adjudication. We can keep this
> exploratory and public within the stated scope.

Comment: #21788 reply `#discussioncomment-18568567`, 2026-09-23.

Facts-only reading: the schema mapping largely holds (boundary language);
exactly one schema-level claim was overclaiming — `paymentSettled: true` could
be read as settlement of the modeled compensation (0.25 CORE) while the only
anchored transfer is an execution coupon (0.001 CORE). The counterparty's
own classification was the generous "former" (independent anchor).

### Owner's fixture correction + re-anchor (2026-09-23)

- The fixture no longer carries any claim that the modeled compensation is
  paid. `execution-attestation.json` now records `executionCoupon` (the REAL
  settled transfer, 0.001 CORE) and `compensationSettlement.status =
  NOT_SETTLED` (`agreementCompensationWei: 250000000000000000`,
  `settledByExecutionCoupon: false`); the provenance text and the fixture
  README were aligned; the pin manifest (`hashes.json`) regenerated; the
  "payment settled" honesty contract in `test/delivery/fixture.test.js` now
  asserts the new flags.
- Repro after correction (unchanged): hashes 10/10 byte-exact ·
  `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` ·
  adversarial 13/13 / 5/5 / fuzz 50 seed 424242 → 0 · B1
  PAYMENT_INFERENCE_FORBIDDEN PASS · `npm test` (see STATUS). Thread reply
  with the corrected anchor: see record commit for the posted comment id.
- Thread state (2026-09-23, re-checked): **mapping result received; one schema
  correction mailed with the new stable anchor; awaiting any follow-up.**
  No funding, partnership, sponsorship, or introduction request was made.