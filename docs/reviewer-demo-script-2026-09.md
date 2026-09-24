# Reviewer demo script — CoreGuard (2026-09)

A 10–15 minute live walkthrough for a technical reviewer, verifier, or
prospective partner. Everything shown is reproducible from the committed tree;
nothing in this script performs a network call (`networkCall: NOT_PERFORMED`
is a test-invariant).

Prerequisites: Node 18+, `git clone`, `npm install`. That is the entire setup.

Only external link used: https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## Part 0 — What you are watching (30 s)

We are not claiming "integration". We are showing a *verification layer* that
(1) pins execution evidence, (2) keeps consent honest, (3) packages a
dispute deterministically, and (4) fails closed on tamper. The money-moving
steps — settlement, escrow, broadcast — are deliberately outside it.

## Part 1 — The suite is the claim (2 min)

    npm test

Expected: the conformance + delivery suite passes; the final count is
hundreds of tests and zero failures. This is the headline number — not a video
or a screenshot, a local run.

## Part 2 — Build the transport packet offline (2 min)

    npm run peoples-court:harness -- --case examples/delivery-fixture/pairs/dispute-package/reference-A

Expected output (excerpt):

    x402       : adjudication.prepare · idempotencyKey=…
    webhook    : 7 events · 4 applied · 1 duplicate · 2 out-of-order · 0 tampered · cursor=4
    network    : NOT_PERFORMED  (no live call, no credential, no submission)
    decision   : PEOPLES_COURT_HARNESS_READY

Exit code 0. Emitted and pinned: `x402-prepare-packet.json`,
`x402-packet-digest.json`, `webhook-ledger.json`, `webhook-events-log.json`,
`harness-report.json`, `harness-hashes.json` — then re-verified before exit.

## Part 3 — Determinism (1 min)

Run Part 2 again into a different `--out` directory. The bytes are identical.

## Part 4 — Tamper, fail-closed (2 min)

Copy the case, flip one byte in the package copy, rerun:

    node -e "const f=require('fs'); const p=process.argv[1]; const b=f.readFileSync(p); b[b.length>>1]^=0xff; f.writeFileSync(p,b)" <your-copy>/dispute-package.json

    npm run peoples-court:harness -- --case <your-copy>/dispute-package --out <your-copy>-out

Expected: `PEOPLES_COURT_HARNESS_FAILED at verify…` — exit code 1, nothing
usable emitted. The same logic, independent of the harness, is what the SHA-256
pin checks run on every package.

## Part 5 — Honest consent + tribunal simulation (2 min)

    node examples/reference-tribunal/sim-tribunal.mjs --case examples/delivery-fixture/pairs/dispute-package/reference-A --scenario A --out <tmp>

The simulator refuses settlement on partial consent, and the award slot stays
`UNKNOWN` unless the package carries a real external award. Consent gaps are
never promoted to bilateral consent.

## Part 6 — The reviewer challenge (the part we want you to practice)

Everything above is stated as *weaker than the evidence*, on purpose. Try to
break the evidence model — any claim here must survive your own run:

1. Flip a byte anywhere in a package → the verifier must refuse it.
2. Turn a `PARTIAL` into `FULL` → pin checks must reject the edit.
3. Rewrite a claimed status in a doc → the conformance suite's honesty tests
   fail (the suite asserts the project never overclaims).
4. Run on a clean clone with `core.autocrlf=false` → deterministic bytes.

If you find an ambiguity, false assumption, or fail-open path:
open an issue or send us the reproduction.

## Reviewer outcome template

When you've run Part 1–2 (and ideally a tamper):

- Environment: OS + Node version + commit SHA.
- `npm test` final count: ___ pass / ___ fail.
- Harness decision line: ___
- Tamper result (if run): exit ___ 
- Findings / issues opened: ___

That record is the strongest artifact this project can publish — and the one
thing a funding conversation is actually built on.