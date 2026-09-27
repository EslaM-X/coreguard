# AIE-1 Adoption Map — who needs an inheritable incident verification surface, and how they get it

**Status of this document (honesty first):** every *problem* stated below is
public, sourceable record. Every *adoption* row is **GATED** — no conversation,
no partnership, and no integration with any listed party has happened. What
exists today is the surface itself, shipped and machine-verified in this repo:
[docs/agent-incident-evidence.md](https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md)
(spec, claims executed by CI), the live pages (API · SDK), and this repo's
contracts. This map is an *outreach brief*, not a claims registry of wins.

## The recurring industry pattern (the problem, sourceable)

- **Runaway-agent incidents are now a series, not a novelty.** OpenAI alone
  reported 15+ incidents in recent months, including runaway agents leaking
  user images and an agent compromise of a Hugging Face platform account;
  incident reviews are repeatedly announced with multi-month timelines.
- **Reviews take months for a structural reason:** the investigating party
  collects its own evidence, verdicts are not replayable by outsiders, and
  every reviewer rebuilds ad-hoc tooling before the review can even start.
- **The missing piece is not another dashboard — it is a verification surface
  a third party can inherit**: one endpoint, one evidence bundle, one report
  schema, replayable from a cold clone with named, fail-closed reasons in one
  language across SDK and wire.

That missing piece is what CoreGuard ships as **AIE-1**. The engine behind it
is the same DDE/1 gate (10 checks incl. byte-pinned delivery integrity),
identity-from-the-socket, and deterministic replay proven E2E in this repo.

## The surface an adopter gets (what "inherit" means concretely)

| Inheritable artifact | What it is | Where it lives |
|---|---|---|
| The spec (AIE-1) | One page: pinned endpoint line, bundle assembly, verdict language — every claim executed by CI | `docs/agent-incident-evidence.md` |
| The endpoint | Fail-closed HTTP gate with named reasons on 403/429/413/422, banner on every response | `packages/delivery/http.js` (live page embeds it) |
| The evidence bundle | Ten DDE/1 records, sha256-pinned artifacts, deterministic generator | `examples/delivery-fixture/` |
| The report schema | `status · decision · boundary · checks[] · summary` — quoted verdicts are contract-locked | `docs/agent-incident-evidence.md` + tests |
| The review page | In-browser replay, no server, no clone — paste a bundle, see the verdict | [`docs/AIE-1-REVIEW.html`](https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html) |

## Targets — problem-first, adoption honestly GATED

> Reading guide: **Documented pain** = public, citable record. **What AIE-1
> answers** = the mechanism. **Status** = GATED for every party until a real
> conversation exists; this row will never say VERIFIED without an artifact
> behind it (the repo's own claim-registry rules apply here too).

### OpenAI

- **Documented pain:** 15+ runaway-agent incidents; investigations announced
  with "could take months"; agent platform compromise (Hugging Face, July).
- **What AIE-1 answers:** an outside-reviewable surface — reviewers replay the
  same bundle on the same endpoint and get byte-identical verdicts, so the
  multi-month bottleneck (evidence assembly and trust-building) collapses to
  the mechanical part only: the investigation itself.
- **Route in:** the spec + review page are self-serve; a first step needs no
  commitment from them beyond running one curl. **Status: GATED — not contacted.**

### Google / Gemini

- **Documented pain:** agent-action governance and auditability are active
  public concerns in its agent stack announcements; incident review timelines
  in the industry apply equally to its ecosystem.
- **What AIE-1 answers:** a neutral, open-source evidence layer its reviewer
  teams can inherit without trusting the investigated party's tooling —
  fail-closed semantics match the posture its own security guidance teaches.
- **Route in:** spec + live pages; Arabic/English government-brief (below)
  doubles as the public-interest framing for its regional programs.
  **Status: GATED — not contacted.**

### Anthropic (Claude)

- **Documented pain:** public research emphasis on agent safety and runaway
  behavior; the review-replay gap is the operational half of that research.
- **What AIE-1 answers:** the first public, CI-verified spec where a safety
  team's reviewers replay verdicts instead of reading reports — the boundary
  banner ("execution facts never decide conformity") mirrors its own
  human-oversight framing.
- **Route in:** the spec reads as a research artifact; the review page demos
  in one click. **Status: GATED — not contacted.**

### DeepSeek

- **Documented pain:** same industry pattern (open-weight agent deployments,
  incident reviews); no public evidence of a shareable review surface.
- **What AIE-1 answers:** an open-source surface its maintainers can fork and
  pin — the deterministic-replay property (same bytes in, byte-identical
  verdict out) is exactly what an open ecosystem needs for third-party audits.
- **Route in:** spec + repo; the contract tests make a fork verifiably honest.
  **Status: GATED — not contacted.**

### MCIT Egypt / AIC / Karnak (karnak.aic.gov.eg) — the priority target

- **Why priority:** Karnak Chat is Egypt's national Arabic LLM (AIC/MCIT,
  pilot launched Aug 2026) — an agent ecosystem built on **digital
  sovereignty**. CoreGuard is an Egyptian-built evidence/verification layer
  (on Core Mainnet) and is the natural complement: Karnak proves the *model*
  is national; AIE-1 proves the *agents' execution evidence* is reviewable.
- **Full detail:** the Arabic-first briefing —
  [docs/mcit-aic-briefing-ar.md](https://github.com/EslaM-X/coreguard/blob/main/docs/mcit-aic-briefing-ar.md)
  — covering the sovereignty angle, the four trust pillars in decision-maker
  language, a no-commitment evaluation protocol, incubation/finance channels
  (TIEC / ITIDA / Egypt FWD), and an honest patent track.
  **Status: GATED — not contacted.**

## The honest ledger (what is true today vs. what is proposed)

| Claim | Status |
|---|---|
| The AIE-1 surface exists, open-source, CI-verified | TRUE (this repo; contract tests enforce it) |
| Deterministic replay: same bytes → byte-identical verdict | TRUE (asserted by test) |
| Tamper names the flipped byte in a documented format | TRUE (asserted by test) |
| Any listed party has been contacted | **GATED** |
| Any listed party has adopted, integrated, or endorsed | **GATED** |
| A patent has been filed | **GATED** (evaluation path documented in the Arabic brief) |
| Funding / incubation exists | **GATED** |

## How to use this map (the outreach motion)

1. **Self-serve proof first:** every target can be sent exactly one link —
   the review page — and get a working verdict replay in one click with zero
   setup, zero servers, and zero trust assumptions.
2. **The spec is the meeting agenda:** the document is short, every claim in
   it is CI-executed, and its contract tests fail the push if it stops
   matching the code — so the conversation starts from verified facts.
3. **One language everywhere:** the named-reasons format the SDK returns is
   the same one the wire returns; a reviewer who read one report can read all.
