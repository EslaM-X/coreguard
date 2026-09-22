# Real-Fixture Intake Kit — from a real bilateral dispute to a DDE fixture

[![Intake Pipeline](https://github.com/EslaM-X/coreguard/actions/workflows/intake.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/intake.yml)
*every command on this page is executed by CI on every push — candidate
build → gate → both conversion modes → unzip → engine on the extraction →
red-path refusal (`workflows/intake.yml`)*

People's Court's own words set the bar — *"not a synthetic demo"* — and ask
for the disclosure scope both parties authorized. This kit turns a real paid
transaction with two reachable, consenting parties into a redacted DDE
fixture: a bilateral consent template (with a **named disclosure scope**
section — reviewers-may-see / withheld / duration / revocation, signed over
one `fixtureRef`), a removal checklist, a fail-closed pre-publication gate,
and the conversion procedure.

> **The disclosure scope is the intake's core record.** Both parties sign it
> (consent-template.json `B_disclosureScope`), it binds the review channels,
> and its `crossChecks` integrity block is **enforced by the gate** — a
> candidate whose signed scope omits or falsifies a cross-check stays RED.

Everything People's Court / Epistemic Labs asked for, in the order they
asked: **a real, redacted bilateral failure fixture with reachable
parties** — not a synthetic demo. This kit is how a real dispute becomes
one, without leaking secrets and without anyone's lawyer having a bad
afternoon.

**Status:** intake procedure — no real fixture has been submitted yet.
Everything here is exercised by the synthetic fixture in
[`../delivery-fixture/`](../delivery-fixture/), whose execution layer
anchors to a real Core Mainnet transaction.

> **Boundary (binding):** *Execution verification does not decide delivery
> conformity.* CoreGuard preserves the evidence; the parties — or a neutral
> procedure — decide the dispute.

> **Not legal advice.** Consent templates here are engineering artifacts.
> Parties should have counsel review the underlying agreement and the
> disclosure scope before signing anything.

## What's in the kit

| File | Purpose |
|---|---|
| [`OUTREACH.md`](./OUTREACH.md) | The ready-to-send first-parties message: the letter, the counterparty forward block, the verified link table, and the do-not-say list |
| [`consent-template.json`](./consent-template.json) | Both parties' consent: EIP-712 redaction grants (E5 wire format), disclosure scope, record-closure agreement, declarations |
| [`removal-checklist.json`](./removal-checklist.json) | Pre-publication secret/personal-data removal — machine gates + (HUMAN) judgment items with operator sign-off |
| [`prelude.mjs`](./prelude.mjs) | The machine-checkable gate: secret scan, origin truth, both-party consent replay, pin integrity — fail-closed, `NOT_CHECKED` never faked |
| [`convert-to-fixture.mjs`](./convert-to-fixture.mjs) | Candidate → DDE fixture in one command: green gate mandatory → ten records + pin manifest → engine-verified. Directory or `--out-zip` attachment archive. Exit `0` ready · `1` gate red/rejected · `2` usage |
| [`make-intake-candidate.mjs`](./make-intake-candidate.mjs) | Build the modeled REAL candidate (ten records + pins) used by CI's surveillance run and the contract tests — one source of truth for the candidate shape |
| [`REVIEW-GUIDE.md`](../../REVIEW-GUIDE.md) (repo root) | The reviewer's one-page path through a converted fixture: pins → engine gate → tamper probe → conformity records → intake projection, in under 10 minutes |

## The procedure — five steps, no shortcuts

### 0. Eligibility

Both parties are reachable and willing. There is a real paid transaction
(the execution anchor). There is a genuine disagreement about whether the
delivered work satisfied the agreed acceptance criteria. If any of these
is false, stop — that case belongs to the synthetic fixture, not intake.

### 1. Freeze the evidence (both parties, off-platform)

Each party captures, and both sides hash-agree on:

- the exact agreement text **and acceptance-criteria version**;
- agent / principal / operator identities **and their authority**;
- declared intent, policy constraints, signer, transaction hash, and any
  execution attestation;
- delivery artifacts **with their bytes** and timestamps;
- each side's position and requested remedy (closed vocabulary:
  `NONE · REWORK · PARTIAL_REFUND · FULL_REFUND · CREDIT`).

### 2. Compute the fixture reference

The `fixtureRef` both consent grants must sign:

```bash
node -e "
import('./packages/canonical/index.js').then(async ({ domainHash }) => {
  console.log(await domainHash('DDE/1:FIXTURE-REF', {
    agreementId: '<THE AGREEMENT ID>',
    version: '<THE AGREEMENT VERSION>',
  }));
});"
```

Both parties sign the **same** `fixtureRef` — one fixture, one reference.

### 3. Fill consent + removal checklist

- Fill [`consent-template.json`](./consent-template.json): disclosure
  scope, closure terms, and both parties' redaction grants. Signatures are
  made **off-platform with each party's own key** over the EIP-712 digest
  of `grantor / fixtureRef / scope`. Private keys never touch this
  repository, this process, or any CoreGuard tool.
- Fill [`removal-checklist.json`](./removal-checklist.json). The `(HUMAN)`
  items are answered in writing by the intake operator — a script cannot
  decide what is commercially sensitive.

### 4. Run the gate

```bash
node examples/real-fixture-intake/prelude.mjs <candidate-dir>
```

Exit `0` = machine gate green. Exit `1` = named findings (fix them; the
gate prints exactly what). Items that cannot be checked offline are
reported `NOT_CHECKED` — never silently passed.

### 5. Convert + submit

With the gate green, conversion is **one command** — `convert-to-fixture.mjs` runs the
gate again itself (nothing converts without GATE GREEN), packages the ten
records faithfully (JSON, 2-space, LF — no field rewriting: the candidate is
the truth), generates `hashes.json` from the written bytes with a re-read
proof, and runs the engine gate on the result. It never overwrites an
existing output directory and never modifies the candidate:

```bash
node examples/real-fixture-intake/convert-to-fixture.mjs <candidate-dir> <out-dir>
# exit 0 = out-dir ready: ten records + hashes.json, engine VERIFIED
# exit 1 = gate red, or the engine rejected the converted fixture
# exit 2 = usage error (missing args, candidate missing, out-dir exists)
```

#### Attachment mode — `--out-zip`

For submission as a **GitHub discussion/comment attachment**, the second
form produces a single archive instead of a directory:

```bash
node examples/real-fixture-intake/convert-to-fixture.mjs <candidate-dir> --out-zip <archive.zip>
```

Same gate and engine flow as directory mode — the engine judges the
packaged bytes via a temp directory *before* the archive is written. The
archive is hand-built with Node's stdlib only (no zip dependency):

- **STORE-only, deterministic bytes** — fixed member timestamps plus
  provenance fields derived from the candidate's pinned bytes (no
  wall-clock, no machine-local paths). Two runs over identical candidate
  bytes produce **byte-identical archives**, so the archive's own SHA-256
  (printed by the converter) is quotable in the submission note. A manifest
  inside an archive cannot hash that archive — the hash belongs in the note.
- **`AUDIT-MANIFEST.txt` inside** — member `crc32` + `sha256` for all ten
  records and `hashes.json`, the gate/engine verdict, and the reviewer
  steps. It quotes the binding boundary verbatim.
- **Reviewer path (no trust in the container)**: unzip → re-hash each
  member against `hashes.json` → re-run the engine on the extraction →
  quote outputs only with the boundary line. Any flipped byte inside a
  member diverges from the manifest's `crc32`/`sha256` pins.

Independent re-verification of the output (same gate a reviewer runs):

```bash
node -e "import('packages/delivery/sdk.js').then(m => m.verifyFixture({ fixtureDir: '<out-dir>' })).then(r => console.log(r.status, r.decision))"
```

The converter's success report already quotes the decision with every
engine check verdict (E5 `NOT_RUN` is honest, never faked) and the
binding boundary verbatim — *"Execution verification does not decide
delivery conformity."*

Submission paths, in order of preference:

1. **Comment on the public discussion thread** with the fixture attached
   or linked — the path People's Court offered for safely redacted public
   fixtures.
2. **https://peoplescourt.ai/request-demo** — their manual-scoping intake.

Include in the submission: synthetic-or-real (it will say `REAL`), the
permitted review and disclosure scope both parties signed, the exact
agreement and acceptance-criteria versions, identities/authority,
intent → transaction → attestation, delivery references and hashes, the
acceptance/rejection record, both positions and requested remedies, and
the retention limits. That list is People's Court's own checklist,
verbatim in substance.

## What CoreGuard claims — and what it never claims

- `REAL` records carry real signatures over real facts; the engine
  replays them (E5) or reports `NOT_RUN`.
- The DDE engine **never** decides conformity, never names a winner, and
  never derives acceptance from payment or receipts (B1–B3, enforced).
- A `READY_FOR_CLAIM_MAPPING` projection means the evidence classes are
  complete for a neutral procedure to pick up — it is not a legal
  conclusion, not a filing, and implies no endorsement by People's Court
  / Epistemic Labs.
