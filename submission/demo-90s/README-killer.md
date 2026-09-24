# demo-killer-90s — the 90-second public script

One command, real verifiers, no cinematic stagecraft.

```
npm run demo:90s:killer
```

## The eight beats (what the viewer sees)

1. **The problem** — an agent can execute a transaction; execution is not
   consent, consent is not adjudication, adjudication is not settlement.
2. **Evidence** — the transfer receipt re-derives under the current engine
   (9/9 checks, `RECEIPT_INTEGRITY`, L2) and the DDE/1 fixture replay-passes
   its pins (10/10).
3. **Consent** — the A/B paired fixture (fix lineage: `1e75fba`): execution
   and delivery are identical in both cases, only consent differs — A=FULL,
   B=PARTIAL with the missing party-B assent preserved as an explicit UNKNOWN.
   The verifier refuses the "bilateral assent" reading of an incomplete pair.
4. **Dispute package** — ADAL/1: the package verifies 25/25 and stays inside
   its boundary: `awardSlot.status = UNKNOWN`, `escrowRef.deployed = false`,
   `adapter.integrationStatus = NOT_BUILT`.
5. **Tamper — fail-closed** — a copied reference package gets one flipped byte
   (in a temp dir; the committed fixtures are untouched) and the verifier
   refuses on the SHA-256 pin (exit 1).
6. **Interoperability** — the People's Court structural adapter produces
   `PEOPLES_COURT_ADAPTER_READY` with `network: NOT_PERFORMED`; the reference
   tribunal refuses scenario B (PARTIAL consent) fail-closed.
7. **What CoreGuard is NOT** — no adjudication, no settlement, no filling of
   unknowns. `COREGUARD — FAIL-CLOSED`.
8. **Take it and run it** — the three commands an outside person uses to
   reproduce all of it from the repo.

## Honesty contract (binding)

This runner executes the repository's own verifiers as real child processes and
asserts fail-closed on each output — a beat only prints ✓ if its real verdict
matched the expected one. The reference tribunal is explicitly NOT People's
Court (a named, synthetic, local stand-in). The adapter performs no network
call and claims none. The escrow is reference-only forever. Stage 5's tamper
mutates a temp copy only.

Exit code: `0` every beat produced its expected verdict; `1` a beat's expected
fail-closed behavior did not occur (the demo itself is broken — fail-open is a
test failure).

## Assets to extract from a single recording

| Asset | Cut from | Use |
|---|---|---|
| 90-sec demo | full run | homepage / X / outreach |
| 15-sec clip | beat 5 (tamper) or beats 3+5 | X / LinkedIn |
| screenshots | beats 2, 3, 4, 6 | GitHub Release |
| transcript | full run (capture stdout) | article / accelerator / investor deck |

A clean, ANSI-scrubbed capture of the exact run is committed at
[`transcript/killer-demo-90s-2026-09-24.txt`](transcript/killer-demo-90s-2026-09-24.txt)
(LF-only, no BOM; exit 0 — `ALL BEATS GREEN`). Regenerate it any time with the
runner below and diff against the committed copy: the demo is reproducible, so
the transcript is a pinned artifact, not a marketing artifact.

Run it once with a plain terminal (no color if scrubbing), capture stdout to a
file for the transcript, and screen-record the same run for the video — the
video and the transcript are the same bytes, which is the point.