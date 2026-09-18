# Gate 4.1 - commitIntent Broadcast Gate Review Report

Status: **CONDITIONAL NO-GO (owner). Mainnet broadcast NOT authorized. Phase 2 (final local
verification) and Phase 3 (local-fork send test) executed and documented below. Owner keystore steps
(C6/C7/C9) and independent review (C8) remain pending. THIS REPORT IS FROZEN v5 (ASCII-PURE) - see
the final manifest for its SHA-256.**

Date: 2026-09-18 | Revision **v5 (FROZEN)**
Repo commit under review: `545e0e1a13215e6cf34a7573b847086fffb0ff0d`
Encoding: ASCII-only (0x20-0x7E), UTF-8 without BOM, no diacritics/control chars - so its SHA-256 is
byte-stable across readers/platforms (same rule applied to gate/lib/harness).

Scope: independent review of `scripts/mainnet/gate-4.1-broadcast.ps1`. The v1 report's six NO-GO
blocker points were addressed; the owner then issued CONDITIONAL NO-GO items that must be closed
before any Broadcast GO. This revision responds to each item. **The decision remains CONDITIONAL
NO-GO, NOT a GO.** Broadcasting is NOT authorized - a separate, explicit GO is required before any
`cast send`, after the owner-executed steps in section 6 are complete, and after an independent
reviewer has re-verified the final hashes.

This report intentionally contains **no private key, no keystore passphrase, and no authorization
signature**.

----------------------------------------------------------------------------------------------------

## 0. Owner's CONDITIONAL-NO-GO items - response matrix

Status convention: **Done** = closed by this revision's artifacts/verification; **Pending** = requires
owner-executed or independent-reviewer action and CANNOT be closed from an automated report.

Evidence status (owner's distinction, adopted): every row is **Evidence reported** (executed in this
environment, reproducible by re-running the listed commands) - it is NOT **Evidence independently
verified** (the owner has not personally re-checked files/lines/hashes in their own environment).

| # | Owner condition | Status | Evidence |
|---|---|---|---|
| C1 | `runtimeCodeSha256` must be unambiguous: hash of the HEX TEXT (`0x...` string) or of the RAW bytecode | **Done** | Two never-confused SHA-256 views, distinct names (sec 3b): `runtimeCodeTextSha256` (UTF-8 bytes of the `0x...` hex text) vs `runtimeCodeBytesSha256` (raw bytecode bytes). Both printed live, both in success evidence, harness S7a-S7c. Live: text `0x4219a335...`, bytes `0x3a384dac...` (stable across runs). |
| C2 | Recovery evidence must be written even when `cast send` OUTPUT PARSING fails after a tx was sent | **Done (code-verified)** | Actual gate code re-read this revision (line numbers corrected after B3 shifted sec M): line 144 sets `$script:sendDone = $true` BEFORE the exit-code check (line 145); the txHash-parse throw (line 427 `could not parse txHash`) sits inside the try (421); the catch (503-509) calls `Write-RecoveryEvidenceRecord -SendAttempted $script:sendDone` (508-509), so the recovery file is ALWAYS written with `txHashParsed=false` when the hash cannot be parsed. Phase-3 fork confirmation (sec 2.7): real `cast send --json` on a local anvil fork returned a JSON receipt whose `transactionHash` was extracted via the shared `ExtractTxHash`; deliberately failing sends exit!=0 -> InvokeCastSend throws (145) -> recovery path. Harness S1/S9 assert the same offline. |
| C3 | Recovery must be tested with a mock harness, not a real Mainnet tx | **Done** | Offline harness (ASCII-only, no network/cast/tx/repo writes) - **39/39 PASS** (sec 2.3b); output preserved in `reviews/gate-4.1-harness-results.txt` (pinned in sec 1 and final manifest). Limitation adopted: harness proves covered behavior, not full live integration; that integration is partially covered by the Phase-3 fork run (sec 2.7) and completed only by the owner's keystore test. |
| C4 | ABI/event topics must match the published SOURCE and DEPLOYED bytecode | **Done (deployed fingerprint)** | B3 (new): the gate scans the live `eth_getCode` hex every run - `Get-DeployedSelectors` extracts PUSH4 (0x63) selects; `Assert-DeployedAbiFingerprint` requires the three pinned selectors AND the event topic0 as PUSH32 (0x7f); any absence aborts. Live run: on-chain PUSH4 set (20 unique) contains `0x4fd0505d`, `0x46f2d74b`, `0x9291d3a5`; topic0 present as PUSH32. Pure offline, harness S10a-f. |
| C5 | Race cannot be prevented by a pre-check alone | **Done (accepted)** | Pre-check is precondition only; contract `AlreadyCommitted` revert is the atomic guard; post-failure readback records the on-chain winner (harness S4). |
| C6 | `--help` does not prove real send behavior | **Residual (accepted)** | NOT closed automatically. Real cast behavior is provable only by a send (fork test sec 2.7 de-risks the plumbing; keystore signing remains unproven until owner runs it - C7/C9). Owner's plan item 4 (documented final command, keystore source, RPC+chain, nonce/gas, hash-capture, recovery-on-parse-fail, tested on a local/fork env ONLY) is queued as the pre-GO owner action. |
| C7 | Signed `eth_call` + `estimateGas` via keystore | **Pending-Owner** | Requires owner-imported keystore (owner holds the key). sec 6 step 5. This report does NOT substitute for it. |
| C8 | Independent review of FINAL version + hashes | **Pending (independent reviewer)** | Hashes and artifacts provided (sec 1) for the holder/independent reviewer to re-compute. No independent review is claimed here. sec 6 step 7. |
| C9 | Keystore import, local, protected password file, never in Git/logs | **Pending-Owner** | sec 6 steps 1-3. The gate enforces path-no-spaces, existence, `--password-file` only, no arg/env echo. |

Statement of fact: this revision completes all remediation items executable in this automated setting,
INCLUDING the C4 deployed-bytecode fingerprint closure; it does NOT perform C6-closure end-to-end
keystore (C7), independent review (C8), or the keystore import (C9). Harness success proves covered
function behavior, not live integration. **The status therefore remains CONDITIONAL NO-GO, not GO.**

### 0.1 Evidence reported vs evidence independently verified (owner's note, adopted)

- Everything in this report is **evidence reported**: executed in this environment, reproducible by the
  owner by re-running the exact commands (harness, `-ReviewOnly`, hash recomputation below).
- It is **not** evidence the owner or a third party has independently verified by opening the files,
  reading the cited lines, or recomputing the hashes in their own environment.
- Therefore: **no GO may be recorded on the basis of passing local tests alone.** At most, this phase
  is **READY FOR EXPLICIT AUTHORIZATION**, pending owner cryptographic validation (C6/C7/C9), an
  actual review of the final files + hash recomputation (C8), and a separate explicit authorization
  covering only `commitIntent`.

## 1. Artifacts under review (v5-final)

| File | SHA-256 |
|---|---|
| `scripts/mainnet/gate-4.1-broadcast.ps1` (B3 deployed fingerprint) | `0x4635e506ddd4e139fb8d622854ccfe0a8bf87bc8d838a51e162f6e09461a8ce6` |
| `scripts/mainnet/gate-4.1-recovery-lib.ps1` (recovery + fingerprint lib, single source of truth) | `0x408c808df7ce01f3197a8974935cbfab5c00b435e0d4cb8d0d27b61ebd586bed` |
| `scripts/mainnet/tests/gate-4.1-recovery-harness.ps1` (offline mock harness, S10+S11) | `0x8b9b8e2b534beb759960be5e1e9fc194a0ef436d5fe9dc68ec65bf0e79f8b612` |
| `contracts/EvidenceRegistryV2.sol` (ABI proof source, pinned) | `0x781d55e7f89722f698424b45758a2ebac7027e63c2c19b79a13ce7887f773415` |
| `evidence/gate-4.0-identity-preflight.json` (rev3, frozen) | `0x675dc752322e28013d3d944ac75acc4cfb468f7638cb7c5e2c9391149049e3cf` |
| `evidence/gate-4.1-identity-preflight.json` (frozen) | `0x61d127f258a781561ffd9c9431efc667c5df111029fc23d03e4fed48304dbccf` |
| `reviews/gate-4.1-harness-results.txt` (preserved harness output, sec 2.3b) | `0x57bfb765fb39c7e89e63395a1b864566f1a3221a9386f83d38491b13949ee7be` |
| `reviews/gate-4.1-final-hashes.txt` (final manifest) | non-circular; its own hash is NOT embedded (recorded externally) |
| `reviews/gate-4.1-broadcast-review.md` (THIS report, v5 FROZEN) | not embedded in itself; its SHA-256 is pinned in the final manifest after freeze |

Static checks (v5): gate/lib/harness SYNTAX OK, ASCII OK, exactly ONE `InvokeCastSend` call site in
the gate, no `eth_sendRawTransaction`, pinned hashes enforced, the only `--private-key` matches are
guard/reject strings, no evidence/recovery files exist (re-verified this revision).

## 2. NO-GO response - how each blocker point was resolved

### 2.1 (CRITICAL) Unsafe balance handling - FIXED
Removed `UInt64.MaxValue` saturation. Balance and gas cost handled with `System.Numerics.BigInteger`:
- `Convert-HexToBigInt` parses exact uint256 hex (positive, no signed-parse trap, no saturation);
- `gasCostBig = gasLimit * gasPrice`, margin check `+ 0.02 CORE` run entirely in BigInteger;
- any balance value, including >64-bit, is compared exactly.
Observed in `-ReviewOnly`: balanceWei=917293380000000000, gasPrice=60000000000, margin checked in
BigInteger (no ToUInt64 saturation path remains).

### 2.2 (CRITICAL) Private key exposed on the command line - FIXED
The gate **never reads MAINNET_PRIVATE_KEY** and passes **no `--private-key <key>`** to any process:
- signing via owner-imported cast keystore (`cast wallet import <name> --interactive`, key never on argv);
- `cast wallet address --account ... --password-file <file>` derives the address; gate requires it to
  equal `.env` MAINNET_DEPLOYER_ADDRESS AND the gate-4.0 archived signer;
- `cast wallet sign --no-hash ...` and `cast send` use `--account/--keystore` + `--password-file` only;
  argv contains a file PATH, never a key and never the passphrase;
- `InvokeCast`/`InvokeCastSend` reject any `--private-key` at runtime (defense in depth);
- failure paths never echo `$argList` or environment; errors carry exit code + stderr only.

Owner precondition (NOT automated): import the keystore once, store the passphrase in a gitignored
space-free file, set MAINNET_KEYSTORE_ACCOUNT (or MAINNET_KEYSTORE) and
MAINNET_KEYSTORE_PASSWORD_FILE in `.env`. The gate aborts with instructions when unsatisfied.

### 2.3 Post-send failure not actually recorded - FIXED
The send + post-send verification + evidence-writing path is wrapped in try/catch; recovery
construction + write live in the SHARED lib (`Write-RecoveryEvidenceRecord`, `New-RecoveryRecord`)
used by BOTH gate and harness:
- `failurePhase` tracks the exact phase (send/blob-identity/receipt/readback/evidence);
- ANY failure after a send attempt writes `evidence/gate-4.1-broadcast-recovery.json` with
  `recoveryRequired=true`, `automaticResend=false`, txHash (if any), txHashParsed, phase, reason,
  receipt status if available, and on-chain `intentCommits` state (who committed, if anyone);
- unparseable `cast send` stdout after a live send still writes the record with `txHashParsed=false`
  (harness S1/S9) - the tx may be on-chain even though we cannot name its hash; it says so explicitly;
- the recovery path sends nothing; the gate never auto-resends;
- a pre-existing recovery file blocks any later run (sec A) until manual resolution;
- a failure BEFORE the send aborts clean via the lib's `CLEAN-ABORT` path - no evidence, no tx
  reached the chain (harness S5).

### 2.3b Offline recovery mock harness - DONE
`scripts/mainnet/tests/gate-4.1-recovery-harness.ps1` (ASCII-only, no network, no cast, no repo writes)
dot-sources the SAME lib the gate executes and asserts the recovery contract:
- S1 send attempted + stdout unparseable -> file written, txHashParsed=false, txHash empty;
- S2 `ExtractTxHash` JSON hash / JSON transactionHash / bare `0x...64` / no match -> null;
- S3 receipt status=0x0 captured (mined but reverted, e.g. race/AlreadyCommitted);
- S4 readback shows intent NOW committed by another -> onChainNowCommitted, winner recorded;
- S5 no send attempted -> throws CLEAN-ABORT, nothing written;
- S6 hygiene: no private key / passphrase / 65-byte signature blob in the record;
- S7 hash views: text-sha != bytes-sha, both deterministic, `0x`-removal tolerant;
- S8 success-path schema: gate/status/intentId/calldataSha256 (hash only), recovery+no-resend;
- S9 end-to-end: evidence still written when hash cannot be parsed after send;
- S10a-f deployed ABI fingerprint: PUSH4 set parsed, selectors present, passes when complete, throws
  when missing;
- S11 harness output artifact written (per-assertion log with its own SHA-256 for reproduction).
Result: **39 assertions, all PASS**. Full output preserved in `reviews/gate-4.1-harness-results.txt`.
Limitation adopted: harness proves covered behavior, not full live integration (that remains owner
pre-GO per sec 6.4).

### 2.3c Deployed ABI fingerprint - DONE (B3 section in the gate, v5)
Owner's C4 note: a bytecode hash alone is not enough; the derived ABI must be shown to match published
on-chain behavior. The gate does this against the LIVE deployed bytecode at every run:
- `Get-DeployedSelectors` extracts every PUSH4 (0x63) selector immediate from the eth_getCode hex;
- `Assert-DeployedAbiFingerprint` requires the three pinned selectors AND topic0 as PUSH32 (0x7f);
  any absence throws `[ABORT]`.
Live v5 run: on-chain PUSH4 set (20 unique) includes `0x4fd0505d`, `0x46f2d74b`, `0x9291d3a5`; topic0
`0x21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127` present as PUSH32.

### 2.4 Event ABI cannot be trusted from code alone - FIXED (pinned + re-derived at runtime)
The event/function layout is pinned from source AND re-derived by `cast` at runtime, aborting on ANY
divergence (`AssertAbiConsistency`):

| Item | Value | Source proof |
|---|---|---|
| `IntentCommitted` topic0 | `0x21185740565de73255b4ef838318b711254ec3031e2f21af71bbcf7bef3f8127` | `cast keccak "IntentCommitted(bytes32,bytes32,address,uint256,uint256,uint256)"` == pinned constant; canonical sig EvidenceRegistryV2.sol:91-98, emitted :236 |
| indexed args order | intentId, intentCommitment, signer -> topics[1], topics[2], topics[3] | source :92-94 |
| `commitIntent` selector | `0x4fd0505d` | `cast sig` == pinned; source :212, _authorize :174-205 |
| `commitIntentDigest` selector | `0x46f2d74b` | `cast sig` == pinned; source :120-125 |
| `intentCommits` getter | `0x9291d3a5` | `cast sig` == pinned; public mapping :88, returns (bytes32,bytes32,bytes32,uint256,address) |
| source file hash | `0x781d55e7...` | gate asserts git working file == pinned constant |

The receipt-log check verifies topics[0..3] all match. ABI-proof block carried into evidence with
`abiDerivedThisRun=true`. Selector vs deployed runtime additionally bound by codeLen 3128 + runtime
hashes + the B3 PUSH4/PUSH32 fingerprint.

### 2.5 intentId-free check is not race-proof - ACKNOWLEDGED + handled as expected state
The FREE check is a precondition only; commitIntent's own `AlreadyCommitted` revert is the atomic
guard. Consequences:
- if a race commits between pre-check and `cast send`, the send fails and the gate re-reads
  `intentCommits` to record who committed (winner + commitment) in the recovery evidence;
- cast-send errors after a race are expected outcomes, never retried, never assumed to mean free;
- the gate never reads stored calldata or falls back to archived values.

### 2.6 Cast flag behavior verified on the pinned cast version
- `cast send --help` (cast 1.8.0): `--data`, `--from`, `--keystore`, `--account`, `--password-file`,
  `--legacy`, `--gas-price`, `--gas-limit`, `--nonce`, `--chain`, `--json`, `--confirmations` present;
- `cast wallet address` / `cast wallet sign`: `--account`, `--keystore`, `--password-file` present;
- gate pre-derives the keystore address and requires it to equal the requested sender; `--from <addr>`
  is passed so any keystore/from mismatch fails the send (cast errors, gate catches, no tx);
- `--legacy` (Type-0) with explicit `--gas-price` and `--gas-limit`;
- `ExtractTxHash` tries `hash`, then `transactionHash`, then a `0x[0-9a-f]{64}` regex; parse failure
  with a live send attempt enters the recovery path (never a silent loss);
- RESIDUAL (documented): full keystore runtime behavior remains until the owner runs it.

### 2.7 Phase-3 local-fork `cast send` test - EXECUTED (2026-09-18, owner plan item: local/fork ONLY)
Executed against a local anvil instance (127.0.0.1:8545, chain-id 1116) - throwaway blank EVM, NO
Mainnet RPC, NO keystore, NO `--private-key`, NO command-history exposure (`--unlocked` uses anvil's
unlocked test account). Repeatable:
1. Real `cast send --json` (same arg shape as InvokeCastSend): exit 0; stdout was a JSON receipt
   (not a bare {hash}) - status, transactionHash, from, to, gasUsed, blockNumber.
2. Shared `ExtractTxHash` on that real output extracted the hash (matched the `transactionHash`
   branch) - parse proven on genuine cast output.
3. `eth_getTransactionByHash` on the fork confirmed the tx exists (gasPrice=0xdf8475800, nonce=0,
   v=0x8db legacy type-0).
4. Negative control: malformed target -> cast exit 2, empty stdout -> the exit!=0 throw (line 145) ->
   recovery path. No tx created.
5. C2 fork confirmation: successful real send whose parse was forced to null -> line 427 throw fires
   while sendDone=true (line 144 before line 145) -> catch writes recovery with txHashParsed=false.
Scope/limitation, honestly recorded: tests the REAL cast binary + REAL shared lib + REAL local EVM,
but NOT (a) keystore signing (`--unlocked` differs from `--account/--password-file`), (b) canonical
signer identity, (c) real registry bytecode (fork was blank; the gate's B-section on-chain checks were
proven against Mainnet read-only in sec 4). C6 is substantially de-risked but NOT fully closed; keystore
signing remains owner step (C7/C9).

## 3. ABI digest facts (unchanged from Gate 4.0)
- `commitIntent(bytes32,bytes32,address,uint256,bytes)` selector `0x4fd0505d`
- `commitIntentDigest` selector `0x46f2d74b`; intentId `0xc4799b1d...`, intentCommitment
  `0xb82f1f80...`, signer `0xEa41BecDeb612d8625bF3060809964F1DAB43244`, registry
  `0x66268a47e81b8f657798d7b5bbedc956df7b13fd`
- calldata layout (encore-verified): offset word `0xa0`, length word `0x41` (65), 65 B sig + 31 B pad
  = 96 B tail, total 292 B

## 3b. runtimeCode SHA-256 views - DEFINITION (responds to C1)
runtimeCode = eth_getCode hex TEXT string (`0x...`, 6256 hex chars + prefix). Two hash views:

| Field | What is hashed | Live value (v3 ReviewOnly run) |
|---|---|---|
| `runtimeCodeTextSha256` | UTF-8 bytes of the `0x...` hex string exactly as returned by eth_getCode | `0x4219a335455148bcfd21dab3be4c59c150bc218d191ff9825ee5a5fcdee033fd` |
| `runtimeCodeBytesSha256` | raw bytecode bytes after `0x` stripping + hex decoding | `0x3a384dac4be374a706d521f1500e87d4afa6fad0dadd022270342c80d01dd0df` |

They differ (different encodings); never conflated. `Get-HexTextSha256` / `Get-RawBytesSha256` in the
shared lib, harness S7a-S7c. Expected stable across runs (immutable chain state); sec 7 recomputes in a
fresh session.

## 4. `-ReviewOnly` rehearsal v3 - COMPLETED (2026-09-18, after B3 fingerprint added)
No keystore configured yet (owner action), so signer/signature/simulation reported as PENDING-OWNER;
every key-independent check ran, including B3:
- chainId 1116 (live) | registry codeLen 3128 | textSha `0x4219a335...` + bytesSha `0x3a384dac...`
- ABI self-proof: topic0 + 3 selectors + source hash all match pinned -> PASS
- B3 deployed fingerprint: on-chain PUSH4 set (20 unique) contains the 3 selectors; topic0 PUSH32 -> PASS
- intentId FREE (precondition) | fresh validUntil=1789696451 (in window, != archived)
- nonce 8 | balance 917293380000000000 wei (BigInteger) | gasPrice 60000000000
- live digest `0x47da6fffe683faf85b6d7bc05713dbe931a6accfc8d47df384581df1350a5b50` (fresh, != archived)
- preview plan printed | NO confirmation requested, NO transaction, NO evidence written (re-verified:
  gate-4.1-broadcast.json and gate-4.1-broadcast-recovery.json both absent)

## 5. Gates
| Step | Status |
|---|---|
| Gate 4.0 rev3 | COMPLETE (hashes pinned, unchanged) |
| Unsigned preflight + local -Sign simulation | COMPLETE (preflight review report) |
| Broadcast script responding to NO-GO (v1) | COMPLETE |
| v2 recovery-lib refactor + v3 deployed-ABI fingerprint | COMPLETE - gate + lib + harness hashes pinned (sec 1) |
| Offline recovery harness (39 assertions incl. S10/S11) | COMPLETE - all PASS (sec 2.3b); output preserved |
| `-ReviewOnly` rehearsal v3 (incl. B3) | COMPLETE (sec 4, reproducible by owner) |
| Local-fork cast send real-path test (anvil, --unlocked, NO keystore/secrets) | COMPLETE (sec 2.7) - real cast + lib + EVM, local only |
| Keystore end-to-end: signer derivation, fresh signature, signed eth_call, estimateGas | PENDING-OWNER (C7/C9) - fork used --unlocked; keystore signing unproven |
| Independent review of FINAL script + lib + harness + manifest hashes | PENDING - independent reviewer (C8) |
| Keystore import + protected password file (gitignored, no logs) | PENDING-OWNER (C9) |
| Final self-review in a fresh PowerShell session | COMPLETE (sec 7) - NOT an independent review (C8 pending) |
| Broadcast (cast send) | NOT AUTHORIZED - separate, explicit GO required |
| Gate 4.2 anchorProof | not started |

## 6. Owner actions REQUIRED before any Broadcast GO (none optional)
1. `cast wallet import coreguard-anchor --interactive` (key never on argv; owner ONLY).
2. Passphrase into a gitignored, space-free file (e.g. `C:\Users\DeLL-L\AppData\Local\Temp\opencode\cg-anchor.pass`);
   tight OS permissions; NEVER committed, NEVER in logs (gate uses only `--password-file`).
3. Set in `.env`: MAINNET_KEYSTORE_ACCOUNT=coreguard-anchor and MAINNET_KEYSTORE_PASSWORD_FILE=<path>.
4. (Plan item 4) Verify send behavior WITHOUT broadcasting: documented final command + keystore source
   + RPC/chain + nonce/gas + tx-hash-capture + recovery-on-parse-fail, on a local/fork env ONLY (fork
   exercise sec 2.7 used --unlocked; the keystore variant remains to run).
5. Re-run `-ReviewOnly` with keystore: signer derivation, fresh signature, signed eth_call, estimateGas,
   BigInteger cost/budget output.
6. Verify NO stale gate-4.1-broadcast-recovery.json and no unexpected broadcast evidence before any run.
7. Independent reviewer (not this automated report): review the FINAL gate/lib/harness/manifest,
   recompute hashes from sec 1, then issue a separate explicitly-scoped Broadcast GO covering ONLY
   `commitIntent` - not Gate 4.2, not other transactions.
8. (SEPARATE-SCOPE option) Real low-risk test transactions: dedicated test wallet with strictly limited
   balance; predefined recipient/value/gas-limit; never via `commitIntent` or any state-changing call of
   this system; review receipt/status/logs after send; NO automatic resend on timeout/parse failure.
   Fully independent of the CoreGuard gate path.

After any send attempt, `gate-4.1-broadcast.json` is written ONLY on full success (receipt status=1,
topics[0..3] verified, readback verified). Any post-send failure - including unparseable stdout - writes
`gate-4.1-broadcast-recovery.json` (txHashParsed flag included) and blocks further runs until manual
resolution.

## 7. Phase-2 final local verification (executed in a fresh PowerShell session, against ACTUAL files)
Does NOT substitute for the independent review (C8). All PASS:
- Hashes vs manifest (recomputed in-session): gate, lib, harness, contract, gate-4.0 preflight,
  gate-4.1 preflight - all 6 MATCH `reviews/gate-4.1-final-hashes.txt` (MATCH printed per file).
- File existence: manifest present; this report (v5) present.
- Manifest non-circular: 0 self-hash claims; only the 6-8 artifacts listed, no report/manifest self-hash.
- No unexpected evidence: 0 gate-4.1-broadcast*.json, 0 *recovery*.json in the tree.
- Parse-failure -> recovery structural (re-read): sendDone=true (144) before exit-code throw (145);
  parse throw (427) in try (421); catch (503-509) writes via Write-RecoveryEvidenceRecord (508-509).
- Working tree: `git diff HEAD --stat` empty; reviewed artifacts new/untracked, unchanged; `.env`
  gitignored, unchanged.
- `-ReviewOnly` PASS + 39/39 harness PASS re-executed; no keystore/passphrase/signature anywhere.
- Report's own hash NOT embedded in itself (circular); final manifest (sec 8) is the hash-verified artifact.

Recorded conclusion: no check failed -> this phase is READY FOR EXPLICIT AUTHORIZATION under the
CONDITIONAL-NO-GO framework: suitable to hand to the owner/independent reviewer for sec 6 steps 1-7 and
a separate explicitly-scoped Broadcast GO. This is NOT a GO record.

## 8. Final hash-verified artifact (owner's plan step 5)
The frozen manifest `reviews/gate-4.1-final-hashes.txt` pins the SHA-256 of: gate, recovery-lib,
harness, contract, gate-4.0 preflight, gate-4.1 preflight, preserved harness output, and the FINAL
frozen report (v5). Non-circular rules:
- the report does NOT embed its own hash (any edit changes the value); the FINAL report hash is computed
  only after this text is frozen, then APPENDED to the manifest - the manifest and the report do not
  mutually depend on each other's text;
- the manifest does NOT embed its own hash (impossible self-reference); it is recorded externally.

Freeze sequence applied at close of this revision (deterministic, no edits after):
(1) report text finalised (this file, ASCII-pure);
(2) report SHA-256 computed in a fresh session;
(3) that value written into `reviews/gate-4.1-final-hashes.txt`;
(4) manifest conformity re-verified (all lines MATCH actual files);
(5) NO further edits to any pinned file.
The owner/independent reviewer repeat (2) and compare against the manifest. Only then may a separately-
scoped GO authorizing `commitIntent` on Mainnet be issued, after sec 6 steps 1-7. Until then the status
line at the top remains in force: **CONDITIONAL NO-GO - broadcast NOT authorized.**

## 8b. Recorded operational status (owner's final decision, 2026-09-18) - Phase 2 & 3 closed
| Operating mode | Recorded status |
|---|---|
| Services / running processes | CONTINUE RUNNING - nothing stopped or modified |
| `-ReviewOnly` | ALLOWED - only gate mode invoked; last run (v3) PASS, no tx, no evidence |
| Mainnet read-only checks | ALLOWED - chainId/registry/codeLen/hash views/fingerprint (sec 4) |
| Low-risk controlled test transaction | SEPARATE SCOPE - NOT part of the CoreGuard commitIntent path |
| `commitIntent` broadcast (Mainnet) | NOT AUTHORIZED - no cast send to Mainnet; no GO recorded |
| Time of the freeze | in the final manifest |

Closing conditions pre-GO - owner/independent-reviewed truth table:

| Condition | State as of v5 |
|---|---|
| All hashes recomputed from actual files, matching manifest | MET (sec 7 - 6/6 MATCH at v4 stage; re-verified at freeze in sec 8) |
| Final manifest non-circular | MET - 0 self-hash claims (sec 8) |
| ABI/bytecode match with target contract | MET - source hashes + on-chain PUSH4/PUSH32 fingerprint (sec 2.3c, 2.4) |
| Keystore matches expected signer | PENDING-OWNER - keystore not imported (C7/C9) |
| Signed eth_call + estimateGas succeed | PENDING-OWNER - requires keystore (C7) |
| No unhandled race in decision logic | MET (by design) - FREE check precondition only; contract revert atomic guard; post-failure readback winner (harness S4) |
| Post-send recovery documented on parse failure | MET - structural (144/145/427/503-509) + offline (S1/S9) + local-fork (sec 2.7) |
| Explicit, non-automatic approval path | MET (by design) - CG41-BROADCAST-COMMIT-<validUntil> typed confirmation + single gated InvokeCastSend |
| Final documented local self-check | MET (sec 7) - self-check != independent review (C8 pending) |
| Separate explicit owner GO for state change | PENDING-OWNER - the operational GO decision, not inferred here |

Recorded conclusion for the log: Services CONTINUE RUNNING | ReviewOnly ALLOWED | Mainnet read-only
ALLOWED | Harness local 39/39 PASS | Local-fork send test COMPLETE (per this report) | Keystore +
signed simulation PENDING-OWNER | C8 PENDING (no independent review performed) | commitIntent broadcast
NOT AUTHORIZED | Overall CONDITIONAL NO-GO. This phase is READY FOR EXPLICIT AUTHORIZATION - it is NOT a
broadcast GO; no broadcast may proceed without the owner's separate explicit authorization after sec 6
steps 1-7.

Final re-run confirmation (v5 close): harness re-executed -> exit 0 (39/39 PASS); gate -ReviewOnly
re-executed -> exit 0, NO confirmation requested, NO transaction, NO evidence written. Post-rerun
integrity -> dirty tracked files 0, gate-4.1-broadcast*.json 0, *recovery*.json 0, gate SHA-256
unchanged (0x4635e506...). Manifest conformity re-verified at freeze.