# Agent Incident Evidence — AIE-1

**The verification surface every AI-agent incident review can inherit — instead of rebuilding it.**

The industry pattern repeats with every runaway-agent incident: the investigating party collects its own evidence, then takes months because nobody outside it can replay the verdict on the same bytes. CoreGuard ships that surface today: one endpoint, one fixture, one report schema — fail-closed by construction, with named reasons in one language across the SDK gate and the wire.

> **The claim, mechanically checkable:** any reviewer at any org can, from a cold clone, stand up the same gate, replay the same evidence bundle, and get the same verdict — byte-identical across two independent submissions. Nothing below is a promise; every claim in this document is executed by `test/delivery/doc-curl-contract.test.js` and fails the push if the code stops matching the prose.

## تثبيت نقطة التحقق — the pinned verification surface

The loopback bind is already its own guard; arm the allowlist explicitly (dual-stack loopback only — deliberately documented posture, per the boundary doc):

```bash
node --input-type=module -e "import { startDeliveryEndpoint } from './packages/delivery/http.js'; const server = await startDeliveryEndpoint({ port: 8787, allowAddresses: ['127.0.0.1', '::1'] }); console.log('AIE-1 verification surface on :8787 —', server.address());"
```

## حزمة الأدلة — the evidence bundle

The bundle is the case file: ten DDE/1 records with sha256 pins over each delivery artifact. AIE-1's one channel is the bundle itself; there is no side channel. Assemble it with the documented one-liner:

```bash
node --input-type=module -e "import { loadFixtureFromDir } from './packages/delivery/sdk.js'; process.stdout.write(JSON.stringify(loadFixtureFromDir('./examples/delivery-fixture').fixture));" > fixture.json
```

Verify over the wire (the documented run; the report is the shared verdict language):

```bash
curl -sS -X POST http://127.0.0.1:8787/verify -H "content-type: application/json" --data-binary @fixture.json
```

## كيف تُثبت الهوية والأدلة — how identity and evidence are proven

Four pillars, each with a live, mechanical proof — executed by the doc-curl contract:

1. **الهوية من السلك لا من الترويسة — Identity from the socket, not from headers.** The peer is its TCP peer address; forwarded headers are log data, never identity. An attacker claiming the allowlisted proxy's address *verbatim* in `X-Forwarded-For` still gets 403 before a byte is read — proven E2E over a real dual-stack proxy topology (`test/delivery/proxy-allowlist-e2e.test.js`).

2. **أدلة مثبتة بالالتزام — Commit-anchored evidence.** Reports hash from `git show` not the working tree — what you quote is what was committed; everything is re-producible from the committed tree at a pinned SHA.

3. **الأحكام مربوطة بالبايتات — Byte-anchored verdicts.** Every delivery artifact is sha256-pinned; the engine **re-computes** each hash from the artifact bytes on every run. A single flipped byte in a recorded pin (`logo.svg: recorded 0x43233704… != actual 0xc3233704…`) flips the verdict to `FIXTURE_REJECTED` / HTTP 422 — the engine names the exact mismatch, not a vague failure.

4. **إعادة التشغيل الحتمية — Deterministic replay: same bytes, same verdict.** Two independent submissions of the same bundle return byte-identical reports — determinism is the property that lets an outsider's replay equal the first investigator's verdict. The claim "two independent submissions are byte-identical" is itself asserted by the contract (see `#aie-replay`).

## الإثبات الحي — the live pages (gate-41 surfaces)

The two live reference pages prove the pillars in-tab; deep links auto-run each scenario:

- **API reference page** — the wire surface: [`#run=honest`](DDE-API-REFERENCE.html#run=honest) → `200 / VERIFIED` (evidence admissible, conformity undecided), [`#run=peoples-court`](DDE-API-REFERENCE.html#run=peoples-court) → the neutral evidence-class projection, [`#run=tamper`](DDE-API-REFERENCE.html#run=tamper) → `422 / FIXTURE_REJECTED` naming the byte mismatch.
- **SDK reference page** — the gate surface: [`#run=verify`](DDE-SDK-REFERENCE.html#run=verify) → HOLD, [`#run=accepted`](DDE-SDK-REFERENCE.html#run=accepted) → RELEASE, [`#run=tamper`](DDE-SDK-REFERENCE.html#run=tamper) → REFUSED (the false acceptance predicate is never consulted — refusal is structural).

## لغة الأحكام — verdict language (fail-closed everywhere)

The admissible verdict, quoted exactly as the engine emits it over the wire:

`EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE`

Every rejection carries the same structure — `status: REJECTED`, a named `reasons[]` in releaseWhen style — across the SDK (`releaseWhen` refuses structurally: no release without a VERIFIED report) and the wire guards (403/429/413 + 422). A reviewer integrating the SDK reads the same refusal language as one probing the endpoint from curl.

## حزمة التحقيق — the incident review pack

A reviewer inherits, from a cold clone:

1. the pinned verification surface (the documented start line above),
2. the bundle (the documented assembly one-liner), and
3. the verdict language (this report schema).

## خلاصة للمستثمر — the investor one-liner

> Incident reviews take months because evidence is gathered by the party under investigation and verdicts are not replayable. CoreGuard makes the review surface itself a product: one endpoint, one bundle, one schema — every claim on this page is executed by CI, and the doc that stops matching the code fails the push.

## الخلاصة — bottom line

CoreGuard's contribution to agent-safety infrastructure is a **verification surface, not a verdict**: identity from the socket, evidence anchored to commits and bytes, verdicts that replay deterministically. Every claim in this document is a runnable claim — and the contract that runs it fails the push if the surface stops matching the words.
