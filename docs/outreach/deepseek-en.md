# Outreach draft — DeepSeek

> **B6 gate: unsigned owner draft — do not send before the recorded sign-off.**

---

**Subject: A forkable, CI-verified incident-review surface for open agent ecosystems — 30-minute demo**

Hello DeepSeek team,

Open agent ecosystems need audits that third parties can actually *run*, not
just read. The industry's incident pattern — fast announcements, slow
outside-verifiable reviews — hits open-weight deployments hardest, because
there is no shared review surface a maintainer and an auditor can both stand
on.

**CoreGuard** (open source, MIT-licensed posture) ships that surface as
**AIE-1**: one verification endpoint, one evidence bundle, one report schema —
deterministic replay is contract-tested (same bytes in → byte-identical verdict
out), tamper attempts name the exact flipped byte, and the spec's claims are
executed by CI so a fork can prove it stayed honest.

Live in one click, no server: https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html
Spec: https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md

A 30-minute walkthrough — live page, then a cold-clone replay — is available
any time, with zero commitment.

Best regards,
[Name — project owner, CoreGuard]

---

> **Owner gate record:** ☐ send approved — name/date: ________
