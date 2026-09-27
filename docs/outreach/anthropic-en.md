# Outreach draft — Anthropic

> **B6 gate: unsigned owner draft — do not send before the recorded sign-off.**

---

**Subject: The operational half of agent-safety research: replayable incident verdicts — 30-minute demo**

Hello Anthropic team,

Your research consistently argues for human oversight and auditable agent
behavior. The operational gap I kept hitting is at the end of that pipeline:
when an incident is reviewed, the verdict is *read* rather than *replayed* —
the investigating party holds the evidence, and no outsider can re-derive the
conclusion from the same bytes.

**CoreGuard** (open source) is the missing operational layer, packaged for
incident reviews as **AIE-1**: one verification endpoint, one evidence bundle,
one report schema. The engine is fail-closed — execution facts can never
decide conformity, every rejection carries named reasons in one language
across the SDK and the wire, and deterministic replay (byte-identical verdicts
from the same bundle) is asserted by contract tests in CI.

Live, in one click: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
Spec (CI-executed claims): https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

Happy to run a reviewer through the 30-minute protocol — live page, then a
cold-clone replay — with no commitment implied.

Best regards,
[Name — project owner, CoreGuard]

---

> **Owner gate record:** ☐ send approved — name/date: ________
