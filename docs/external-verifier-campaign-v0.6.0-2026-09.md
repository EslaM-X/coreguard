# External Verifier Campaign — v0.6.0

Phase transition: from *show what we built* → *try to verify and break it*.

This is the first real test of the North Star: an outside person takes the
code, runs it, inspects the evidence, and builds on it.

## CTA (keep it small)

> **Clone it. Run it. Try to break the evidence model.**
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.

## Scope — deliberate and narrow

- 10–20 technically suitable people, NOT a mass blast.
- Segments (in priority order):
  1. agent infrastructure
  2. agent commerce / payments
  3. escrow
  4. dispute resolution
  5. blockchain infrastructure
  6. protocol / security engineering
- Every message is personalized to the recipient; no templated bulk email.

## What the recipient receives

- Release link: https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0
- The 90-second killer demo (`npm run demo:90s:killer`) + its transcript
  (`submission/demo-90s/transcript/killer-demo-90s-2026-09-24.txt`)
- The technical article (`docs/article-missing-verification-layer-agentic-disputes.md`)
- ADAL/1 spec (`docs/dispute-package-standard.md`)
- The ask: run it locally, question the boundaries, and report reproductions.
  Contradictions welcome; nothing to sell, no signing of anything.

## Honesty and boundary rules (non-negotiable)

- Invitation says "independent technical verification, not endorsement".
- "People's Court structural adapter" — offline/dry-run, never "integration".
- awardSlot stays UNKNOWN; fail-open is a bug, not a feature.
- No claim of adjudication, settlement, live integration, or external endorsement in any message.

## Success signal

- An outside party reports a reproduced run (green or broken).
- An outside party opens an issue or a PR.
- An outside party builds a fixture or a verifier of their own.

Failure signal: silence + a wall of "this is interesting" with no one actually
running it.

## Roadmap after first external verifier

1. First external verifier reports (green or a real find) → publish the report
2. External adapter → external integration
3. External integration → real case
4. Real case → paid pilot