# CoreGuard — Investor / Core Submission Pack

**One artifact: `git clone` → `npm install` → `npm run demo:90s`.**
No deck claims anything this repository cannot re-derive. Everything here traces to
committed code + a real, L1-verified Core Mainnet execution.

---

## The one sentence Core should read

> CoreGuard makes **autonomous execution on Core verifiable**: an agent declares
> what it was authorized to do, executes on Core, and any third party can
> independently re-derive a cryptographic verdict of whether the on-chain
> transaction actually matched that authorization.

## Goal

Not *"here is our project, please fund us."* The goal is:

> **"We need to see this running on Core."**

## The 15 items

| # | Item | Where |
|---|---|---|
| 01 | One-page Executive Brief | [`01-executive-brief.md`](01-executive-brief.md) |
| 02 | 90-second technical demo | [`demo-90s/`](demo-90s/) — run `npm run demo:90s` |
| 03 | Architecture | [`03-architecture.md`](03-architecture.md) |
| 04 | Threat model | [`04-threat-model.md`](04-threat-model.md) |
| 05 | Security / reproducibility evidence | [`05-security-reproducibility.md`](05-security-reproducibility.md) |
| 06 | Mainnet proof | [`06-mainnet-proof.md`](06-mainnet-proof.md) |
| 07 | Why Core should fund this | [`07-why-core-funds-this.md`](07-why-core-funds-this.md) |
| 08 | Competitive landscape | [`08-competitive-landscape.md`](08-competitive-landscape.md) |
| 09 | Business model | [`09-business-model.md`](09-business-model.md) |
| 10 | Funding ask | [`10-funding-ask.md`](10-funding-ask.md) |
| 11 | 12-month roadmap | [`11-roadmap-12-month.md`](11-roadmap-12-month.md) |
| 12 | IP / patent strategy | [`12-ip-strategy.md`](12-ip-strategy.md) |
| 13 | GitHub + release/tag evidence | [`13-github-evidence.md`](13-github-evidence.md) |
| 14 | Investor / Core pitch deck | [`14-pitch-deck.md`](14-pitch-deck.md) |
| 15 | Egypt patent file (lawyer handoff) | [`15-egypt-patent-file.md`](15-egypt-patent-file.md) |

## Fastest start

```bash
git clone https://github.com/EslaM-X/coreguard.git
cd coreguard
npm install
npm run demo:90s        # recorded VERIFIED chain + fail-closed verdicts, ~2s
npm run demo:90s:live   # includes live re-derivation from Core Mainnet (read-only)
```

## Honesty box (quoted from every doc in this repo)

- **VERIFIED ≠ SAFE.** CoreGuard answers *"did execution conform to authorization?"* — never *"is this strategy profitable / safe?"*
- **No fabricated proof.** The VERIFIED path is a real Core Mainnet transaction, recomputable by anyone. The failure paths are labeled, offline, deterministic rejections of the engine's own fail-closed behavior — never presented as real executions.
- **No fake numbers.** No invented users, TVL, partnerships, or adoption. Every number in this pack is reproducible from this repository (`npm test`, `npm run corpus`, `git tag`).
- **Not "Core-backed" until Core says so.** This pack asks Core to run the demo and evaluate, not to adopt or endorse anyone.