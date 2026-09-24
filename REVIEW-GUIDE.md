# REVIEW-GUIDE — review a converted DDE fixture in under 10 minutes

For the external reviewer — People's Court / Epistemic Labs or any third
party. You are holding a fixture produced by the CoreGuard intake pipeline
(a directory, or the ZIP attachment from a discussion comment). This guide
is the shortest honest path through it: five steps, ~9 minutes, every
command copy-paste runnable from a clone of this repo.

> **The one sentence that frames everything:**
> *"Execution verification does not decide delivery conformity."*
> Every report the engine emits carries this line (`DDE-BOUNDARY`). If a
> summary of the evidence ever loses it, the summary is wrong.

What a green review does **and does not** establish:

| Established by the engine | Explicitly NOT established by the engine |
|---|---|
| the evidence record is admissible: records complete, pins intact, authorization chain intact | whether the delivered work satisfied the deal |
| tampering in a delivered artifact is detected (E3) | which party is right (B3 — the engine names no winner) |
| consent, when an EVM adapter is provided, is cryptographically replayed (E5) | consent, when no adapter is available — reported `NOT_RUN`, never faked |

Prerequisite (once, ~1 min, not counted): `git clone --depth 1
https://github.com/EslaM-X/coreguard && cd coreguard`. All commands below
run from the repo root; `<fixture-dir>` is wherever you unzipped/extracted
the fixture. Zero dependencies beyond Node ≥ 18.

## Step 1 — Pin integrity (2 min): the container is not the evidence, the hashes are

Unzip if you received the attachment (you will see the ten records,
`hashes.json`, and `AUDIT-MANIFEST.txt`), then re-hash every pinned record
and compare against `hashes.json`:

```bash
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFileSync } from 'node:fs'; const dir = process.argv[1]; const pins = JSON.parse(readFileSync(dir + '/hashes.json', 'utf8')).files; let bad = 0; for (const [name, pin] of Object.entries(pins)) { const actual = '0x' + createHash('sha256').update(readFileSync(dir + '/' + name)).digest('hex'); if (actual !== pin) { console.log('MISMATCH', name, pin, '!=', actual); bad++; } } console.log(bad === 0 ? 'all pins match' : bad + ' mismatches — tampered'); process.exit(bad ? 1 : 0);" <fixture-dir>
```

**Expected:** `all pins match`, exit 0. The loop covers the ten records;
`hashes.json` itself (self-excluded by design — a file cannot hash itself)
is covered by the `crc32`/`sha256` pins inside `AUDIT-MANIFEST.txt`.

**If this fails:** the submission was modified after conversion. Reject it
by name — the mismatches print both hashes.

## Step 2 — The engine gate (2 min): the same gate CI runs

```bash
node --input-type=module -e "import { verifyFixture } from './packages/delivery/sdk.js'; const r = await verifyFixture({ fixtureDir: process.argv[1] }); console.log(r.status, '·', r.decision); for (const c of r.checks) console.log(' ', c.id, c.result, c.result === 'NOT_RUN' ? '— ' + c.note : '');" <fixture-dir>
```

**Expected, verbatim:**

```
VERIFIED · EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE
  F0 PASS
  F1 PASS
  F2 PASS
  E3 PASS
  E4 PASS
  B1 PASS
  B2 PASS
  B3 PASS
  E5 NOT_RUN — EVM adapter not provided — consent signature replay NOT evaluated (never fabricated)
  F3 PASS
```

Reading the shape: the evidence is **admissible** and the engine has
**not judged the delivery**. `E5 NOT_RUN` is the honest state without an
EVM adapter — a submission that claims `E5 PASS` without one is a red
flag (see the table at the end).

## Step 3 — The tamper probe (2 min): prove the gate actually bites

Trust the gate only after watching it fail on demand. This flips one byte
of one delivered artifact **in memory** (nothing on disk is touched) and
re-verifies:

```bash
node --input-type=module -e "import { loadFixtureFromDir, verifyFixture } from './packages/delivery/sdk.js'; const { fixture } = loadFixtureFromDir(process.argv[1]); const a = fixture.delivery.artifacts[0]; a.content = a.content.slice(0, -1) + (a.content.endsWith('X') ? 'Y' : 'X'); const r = await verifyFixture({ fixture }); const e3 = r.checks.find((c) => c.id === 'E3'); console.log(r.status); console.log('E3:', e3.result, '—', e3.mismatches[0]);" <fixture-dir>
```

**Expected:**

```
REJECTED
E3: FAIL — logo.svg: recorded 0x… != actual 0x…
```

A single flipped byte anywhere in a delivered artifact must fail the whole
record, named by artifact id with both hashes. If your probe comes back
`VERIFIED`, the E3 replay in the engine you are running is broken — file
what you saw.

## Step 4 — Read the conformity question where it actually lives (2 min)

The engine deliberately does not decide conformity; the parties' signed
records do. Three spot-reads:

```bash
node -e "const fs = require('fs'); const d = process.argv[1]; const ag = JSON.parse(fs.readFileSync(d + '/agreement.json', 'utf8')); console.log('agreement:', ag.agreementId ?? ag.id, '· version', ag.version); const cr = JSON.parse(fs.readFileSync(d + '/acceptance-criteria.json', 'utf8')); const list = cr.criteria ?? cr; console.log('criteria:', (list.criteria ?? list).length); const ac = JSON.parse(fs.readFileSync(d + '/acceptance-record.json', 'utf8')); console.log('acceptance grounds:', JSON.stringify(ac.grounds ?? ac.basis ?? ac.verdict).slice(0, 120)); const dr = JSON.parse(fs.readFileSync(d + '/dispute-record.json', 'utf8')); console.log('dispute positions:', (dr.partyA ? 'partyA' : 'A?'), '+', (dr.partyB ? 'partyB' : 'B?'), '· requested remedies:', dr.partyA?.requestedRemedy ?? dr.partyA?.remedy, '/', dr.partyB?.requestedRemedy ?? dr.partyB?.remedy); console.log('engineAdjudication declared:', JSON.stringify(dr.engineAdjudication).slice(0, 80));" <fixture-dir>
```

What to check by eye:

- **acceptance grounds** cite the agreed criteria (and, if rejected, name
  the failed criterion) — never "payment settled" or "receipt proves"
  (that class of grounds is killed structurally by F1/B1).
- **both dispute positions and their requested remedies are present**
  (a party's `requestedRemedy` may legitimately be `NONE`);
  `engineAdjudication` must be a refusal to adjudicate (the engine's own
  B3 posture), not a winner.
- **the record has a closing point** (`recordClosesAtUtc` / `closedAtUtc`)
  — the closed record is what a neutral procedure reviews.

## Step 5 — The People's Court intake projection (1 min)

The C1–C6 evidence-class projection a neutral intake would map from:

```bash
node --input-type=module -e "import { verifyFixture } from './packages/delivery/sdk.js'; const r = await verifyFixture({ fixtureDir: process.argv[1], peoplesCourt: true }); console.log('readiness:', r.peoplesCourt.readiness, '· mappable:', r.peoplesCourt.mappable);" <fixture-dir>
```

**Expected:** `readiness: READY_FOR_CLAIM_MAPPING — evidence classes
complete; conformity question framed, not decided · mappable: true`.
This is a pure classification: no persistence, no judgment, and no
endorsement by People's Court / Epistemic Labs is implied by the output.

## The 10-minute verdict

| ☐ | Check | Pass looks like |
|---|---|---|
| ☐ | Step 1 pins | `all pins match`, exit 0 |
| ☐ | Step 2 gate | `VERIFIED · EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE`, `E5 NOT_RUN` stated honestly |
| ☐ | Step 3 tamper | `REJECTED` + E3 naming the artifact and both hashes |
| ☐ | Step 4 records | criteria-cited grounds, both positions + remedies, closing point, no engine winner |
| ☐ | Step 5 projection | `READY_FOR_CLAIM_MAPPING` (or named gaps — which is a finding, not a failure) |

**Red flags — reject the submission if you see any of these:**

- any summary quoting the engine's verdict **without the boundary line**;
- acceptance grounds resting on execution facts (`PAYMENT_SETTLED`,
  "receipt proves") — F1/B1 must have killed this; if present, the
  producing pipeline is not the one documented here;
- a verdict beside **zero criterion evaluations** (B2 class);
- `E5 PASS` **without** an EVM adapter (fabricated consent);
- the engine (or any summary of it) **naming a winner** or a remedy
  outside the closed vocabulary (B3 class);
- pins that do not match (Step 1) — the archive is not the one converted.

## Where this path is proven continuously

The pipeline this fixture came out of — candidate build → removal gate →
conversion (both modes, deterministic archives) → unzip → engine on the
extraction → red-path refusal — is exercised by CI on **every push**:
[![Intake Pipeline](https://github.com/EslaM-X/coreguard/actions/workflows/intake.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/intake.yml)

Links:

- Boundary document (why execution proof ≠ conformity): <https://github.com/EslaM-X/coreguard/blob/main/docs/delivery-dispute-boundary.md>
- One-page integration (wire API, every curl executed in CI): <https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md>
- Intake kit (consent template, removal checklist, gate, converter): <https://github.com/EslaM-X/coreguard/tree/main/examples/real-fixture-intake>
- Live demo: <https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html>
- Neutral intake for a real bilateral case: <https://peoplescourt.ai/request-demo>

> Quote a report, you quote the boundary with it:
> **Execution verification does not decide delivery conformity.**
