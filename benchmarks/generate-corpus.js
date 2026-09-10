/**
 * CoreGuard Benchmark Corpus Generator
 *
 * Deterministically generates the 50-55 scenario golden corpus defined in
 * spec/COREGUARD-MASTER-SPEC-v0.1.md §11.
 *
 * Category totals:
 *   Intent Integrity   10
 *   Target Integrity    5
 *   Value Integrity     5
 *   Recipient Integrity 5
 *   Calldata Integrity  5
 *   Deadline/Nonce      5
 *   Slippage            5
 *   Multi-step          5
 *   Adversarial Mutation 5
 *   Oracle Bound        5
 *   (performance budget fixture) 1
 */

import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve("benchmarks");

const ADDR = {
  signer: "0x0000000000000000000000000000000000000001",
  token: "0x0000000000000000000000000000000000000002",
  alice: "0x0000000000000000000000000000000000000003",
  bob: "0x0000000000000000000000000000000000000004",
  attacker: "0x0000000000000000000000000000000000000099",
  router: "0x00000000000000000000000000000000000000a1",
  pool: "0x00000000000000000000000000000000000000a2",
  vault: "0x00000000000000000000000000000000000000a3",
};

const SEL = {
  transfer: "0xa9059cbb",
  transferFrom: "0x23b872dd",
  approve: "0x095ea7b3",
  stake: "0xa694fc3a",
  deposit: "0xd0e30db0",
  swap: "0x38ed1739",
};

const AMOUNT = "100000000";
const MAX = "100000000";

function baseIntent(overrides = {}) {
  return {
    version: "CGEP/1",
    chainId: "1114",
    signer: ADDR.signer,
    nonce: "0",
    validAfter: "0",
    validUntil: "9999999999",
    action: "TRANSFER",
    target: ADDR.token,
    selector: SEL.transfer,
    asset: ADDR.token,
    amount: AMOUNT,
    recipient: ADDR.alice,
    constraints: [
      { type: "MAX_VALUE", value: MAX },
      { type: "RECIPIENT_ALLOWLIST", addresses: [ADDR.alice] },
    ],
    ...overrides,
  };
}

function basePolicy(overrides = {}) {
  return {
    version: "CGEP/1",
    policyId: "0x00000000000000000000000000000000000000aa",
    name: "Transfer Policy",
    rules: [
      { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: MAX }, severity: "CRITICAL" },
      { ruleId: "RECIPIENT_001", type: "RECIPIENT_ALLOWLIST", params: { addresses: [ADDR.alice] }, severity: "CRITICAL" },
      { ruleId: "TARGET_001", type: "TARGET_ALLOWLIST", params: { targets: [ADDR.token] }, severity: "CRITICAL" },
      { ruleId: "SELECTOR_001", type: "SELECTOR_ALLOWLIST", params: { selectors: [SEL.transfer] }, severity: "CRITICAL" },
    ],
    ...overrides,
  };
}

// Complete six-rule policy used as the mutation base (every field can flip).
function basePolicyFull() {
  return {
    version: "CGEP/1",
    policyId: "0x00000000000000000000000000000000000000bb",
    name: "Complete Transfer Policy",
    rules: [
      { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: MAX }, severity: "CRITICAL" },
      { ruleId: "RECIPIENT_001", type: "RECIPIENT_ALLOWLIST", params: { addresses: [ADDR.alice] }, severity: "CRITICAL" },
      { ruleId: "TARGET_001", type: "TARGET_ALLOWLIST", params: { targets: [ADDR.token] }, severity: "CRITICAL" },
      { ruleId: "SELECTOR_001", type: "SELECTOR_ALLOWLIST", params: { selectors: [SEL.transfer] }, severity: "CRITICAL" },
      { ruleId: "DEADLINE_001", type: "DEADLINE", params: { deadline: "3000" }, severity: "CRITICAL" },
      { ruleId: "SLIPPAGE_001", type: "SLIPPAGE_BPS", params: { bps: "5000" }, severity: "HIGH" },
    ],
  };
}

const CAT = {
  INTENT: "Intent Integrity",
  TARGET: "Target Integrity",
  VALUE: "Value Integrity",
  RECIPIENT: "Recipient Integrity",
  CALLDATA: "Calldata Integrity",
  DEADLINE: "Deadline/Nonce",
  SLIPPAGE: "Slippage",
  ORACLE: "Oracle Bound",
  MULTI: "Multi-step",
  MUTATION: "Adversarial Mutation",
};

let seq = 0;
const id = () => `cg-${String(++seq).padStart(3, "0")}`;

/**
 * Build a policy-kind scenario fixture (runner evaluates policy).
 */
function policy({
  name,
  category,
  description,
  intent = baseIntent(),
  policy = basePolicy(),
  trace = {},
  expectedResult = "VALID",
  violation,
  checks = {},
}) {
  return {
    scenario: id(),
    benchmarkId: name,
    category,
    kind: "policy",
    description,
    chain: "core-testnet2",
    chainId: 1114,
    intent,
    policy,
    trace,
    expected: {
      result: expectedResult,
      violation,
      checks,
    },
  };
}

/**
 * Build a narrative-kind scenario fixture (runner asserts expected result statically;
 * the Checks describe how the CoreGuard pipeline reasons about it).
 */
function narrative({
  name,
  category,
  description,
  expectedResult = "INVALID",
  intent = baseIntent(),
  policy = basePolicy(),
  pipeline,
  verificationLevel = "L2",
}) {
  return {
    scenario: id(),
    benchmarkId: name,
    category,
    kind: "narrative",
    description,
    chain: "core-testnet2",
    chainId: 1114,
    intent,
    policy,
    expected: {
      result: expectedResult,
      checks: pipeline,
    },
    verificationLevel,
  };
}

const corpus = [];

// ── Intent Integrity (10) ────────────────────────────────────────────────
corpus.push(
  policy({
    name: "transfer-valid-001",
    category: CAT.INTENT,
    description: "Baseline valid transfer used as mutation base",
    intent: baseIntent(),
    policy: basePolicyFull(),
    expectedResult: "VALID",
  }),
  policy({
    name: "intent-exact-match-002",
    category: CAT.INTENT,
    description: "Execution matches committed intent exactly",
    expectedResult: "VALID",
  }),
  policy({
    name: "intent-max-boundary-002",
    category: CAT.INTENT,
    description: "Execution at the policy ceiling is conformant",
    trace: { value: MAX },
    expectedResult: "VALID",
  }),
  policy({
    name: "intent-one-over-max-003",
    category: CAT.INTENT,
    description: "Execution one wei over the ceiling violates value bound",
    trace: { value: String(BigInt(MAX) + 1n) },
    expectedResult: "INVALID",
    violation: { rule: "VALUE_001", field: "value" },
  }),
  policy({
    name: "intent-allowlist-second-004",
    category: CAT.INTENT,
    description: "Recipient from a multi-entry allowlist is conformant",
    intent: baseIntent({
      recipient: ADDR.bob,
      constraints: [
        { type: "MAX_VALUE", value: MAX },
        { type: "RECIPIENT_ALLOWLIST", addresses: [ADDR.bob, ADDR.alice] },
      ],
    }),
    policy: basePolicy({
      rules: [
        { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: MAX }, severity: "CRITICAL" },
        { ruleId: "RECIPIENT_001", type: "RECIPIENT_ALLOWLIST", params: { addresses: [ADDR.bob, ADDR.alice] }, severity: "CRITICAL" },
      ],
    }),
    expectedResult: "VALID",
  }),
  policy({
    name: "intent-constraint-superset-005",
    category: CAT.INTENT,
    description: "Policy bound stricter than intent is enforced",
    intent: baseIntent({ amount: "50000000" }),
    policy: basePolicy({
      rules: [
        { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: "25000000" }, severity: "CRITICAL" },
      ],
    }),
    trace: { value: "40000000" },
    expectedResult: "INVALID",
    violation: { rule: "VALUE_001", field: "value" },
  }),
  policy({
    name: "intent-selector-transferfrom-006",
    category: CAT.INTENT,
    description: "transferFrom selector outside allowlist is rejected",
    intent: baseIntent({ selector: SEL.transferFrom, action: "TRANSFER_FROM" }),
    policy: basePolicy({ rules: [{ ruleId: "S1", type: "SELECTOR_ALLOWLIST", params: { selectors: [SEL.transfer] }, severity: "CRITICAL" }] }),
    trace: { selector: SEL.transferFrom },
    expectedResult: "INVALID",
    violation: { rule: "S1", field: "selector" },
  }),
  narrative({
    name: "intent-signer-mismatch-007",
    category: CAT.INTENT,
    description: "Execution signed from a different sender than committed",
    pipeline: ["INTENT_HASH stable", "EXECUTION_SENDER != INTENT_SIGNER → INVALID"],
  }),
  narrative({
    name: "intent-chain-id-mismatch-008",
    category: CAT.INTENT,
    description: "Execution occurred on a different chainId than committed",
    pipeline: ["CHAIN_ID binding mismatch → INVALID"],
  }),
  narrative({
    name: "intent-nonce-replay-009",
    category: CAT.INTENT,
    description: "Same intent nonce replayed for a different execution",
    pipeline: ["NONCE_BINDING mismatch → INVALID"],
  }),
);

// ── Target Integrity (5) ─────────────────────────────────────────────────
corpus.push(
  policy({
    name: "target-wrong-001",
    category: CAT.TARGET,
    description: "Execution targets a different contract than committed",
    trace: { target: ADDR.attacker },
    expectedResult: "INVALID",
    violation: { rule: "TARGET_001", field: "target" },
  }),
  policy({
    name: "target-not-allowlisted-002",
    category: CAT.TARGET,
    description: "Target falls outside the contract allowlist",
    policy: basePolicy({ rules: [{ ruleId: "T1", type: "TARGET_ALLOWLIST", params: { targets: [ADDR.token] }, severity: "CRITICAL" }] }),
    trace: { target: ADDR.bob },
    expectedResult: "INVALID",
    violation: { rule: "T1", field: "target" },
  }),
  narrative({
    name: "target-subcall-destruct-003",
    category: CAT.TARGET,
    description: "Hidden sub-call to a selfdestruct address",
    pipeline: ["TRACE call tree → step 3 target = 0xdead CREATE/DESTRUCT → INVALID"],
  }),
  narrative({
    name: "target-hardcode-bypass-004",
    category: CAT.TARGET,
    description: "Calldata embeds a hard-coded contract address to route around allowlist",
    pipeline: ["CALDATA analysis → routed address ≠ allowlisted target → INVALID"],
  }),
  narrative({
    name: "target-approve-to-third-party-005",
    category: CAT.TARGET,
    description: "approve() grants allowance to a non-allowlisted spender",
    pipeline: ["TRACE event Approval(to=0x...99) → CAMPAIGN → INVALID"],
  }),
);

// ── Value Integrity (5) ──────────────────────────────────────────────────
corpus.push(
  policy({
    name: "value-over-limit-001",
    category: CAT.VALUE,
    description: "Transferred value exceeds the committed ceiling",
    trace: { value: "200000000" },
    expectedResult: "INVALID",
    violation: { rule: "VALUE_001", field: "value" },
  }),
  policy({
    name: "value-sweep-002",
    category: CAT.VALUE,
    description: "Attempted balance sweep far above ceiling",
    trace: { value: "99999999999999" },
    expectedResult: "INVALID",
  }),
  policy({
    name: "value-zero-003",
    category: CAT.VALUE,
    description: "Zero-value execution is conformant",
    trace: { value: "0" },
    expectedResult: "VALID",
  }),
  narrative({
    name: "value-negative-rebalance-004",
    category: CAT.VALUE,
    description: "Rebalance step moves value with negative effective delta",
    pipeline: ["STATE DELTA → negative accounting → INVALID"],
  }),
  narrative({
    name: "value-multi-transfer-sum-005",
    category: CAT.VALUE,
    description: "Sum of multiple transfers during execution exceeds committed amount",
    pipeline: ["TRACE aggregate value > INTENT amount → INVALID"],
  }),
);

// ── Recipient Integrity (5) ──────────────────────────────────────────────
corpus.push(
  policy({
    name: "recipient-wrong-001",
    category: CAT.RECIPIENT,
    description: "Transfer recipient differs from committed recipient",
    trace: { recipient: ADDR.attacker },
    expectedResult: "INVALID",
    violation: { rule: "RECIPIENT_001", field: "recipient" },
  }),
  policy({
    name: "recipient-not-allowlisted-002",
    category: CAT.RECIPIENT,
    description: "Recipient does not appear in the allowlist",
    policy: basePolicy({ rules: [{ ruleId: "R1", type: "RECIPIENT_ALLOWLIST", params: { addresses: [ADDR.bob] }, severity: "CRITICAL" }] }),
    trace: { recipient: ADDR.alice },
    expectedResult: "INVALID",
  }),
  policy({
    name: "recipient-attacker-swap-003",
    category: CAT.RECIPIENT,
    description: "Execution output routed to attacker address",
    trace: { recipient: ADDR.attacker },
    expectedResult: "INVALID",
  }),
  narrative({
    name: "recipient-transfers-from-004",
    category: CAT.RECIPIENT,
    description: "transferFrom pulls from victim when only transfer was authorized",
    pipeline: ["SELECTOR check → 0x23b872dd not authorized → INVALID"],
  }),
  narrative({
    name: "recipient-multi-call-third-005",
    category: CAT.RECIPIENT,
    description: "Third hop of a multi-call sends funds to an unauthorized address",
    pipeline: ["TRACE hop 3 recipient ∉ allowlist → INVALID"],
  }),
);

// ── Calldata Integrity (5) ───────────────────────────────────────────────
corpus.push(
  policy({
    name: "calldata-wrong-selector-001",
    category: CAT.CALLDATA,
    description: "Execution uses an unapproved function selector",
    trace: { selector: SEL.transferFrom },
    expectedResult: "INVALID",
    violation: { rule: "SELECTOR_001", field: "selector" },
  }),
  narrative({
    name: "calldata-truncated-002",
    category: CAT.CALLDATA,
    description: "Truncated calldata decode attempts to drop bounds",
    pipeline: ["ABI decode -> malformed args -> INVALID"],
  }),
  narrative({
    name: "calldata-arg-overflow-003",
    category: CAT.CALLDATA,
    description: "Calldata argument overflow masks intended recipient",
    pipeline: ["ABI decode -> recipient 0x00..00 -> INVALID"],
  }),
  narrative({
    name: "calldata-reentrancy-004",
    category: CAT.CALLDATA,
    description: "Reentrant callback re-encodes different calldata",
    pipeline: ["TRACE reentrancy detection -> INVALID"],
  }),
  narrative({
    name: "calldata-extra-value-005",
    category: CAT.CALLDATA,
    description: "msg.value attached though intent declared none",
    pipeline: ["VALUE check -> msg.value > 0 -> INVALID"],
  }),
);

// ── Deadline/Nonce (5) ───────────────────────────────────────────────────
corpus.push(
  policy({
    name: "deadline-expired-001",
    category: CAT.DEADLINE,
    description: "Execution mined after the committed deadline",
    policy: basePolicy({
      rules: [
        { ruleId: "VALUE_001", type: "VALUE_LIMIT", params: { max: MAX }, severity: "CRITICAL" },
        { ruleId: "D1", type: "DEADLINE", params: { deadline: "5000" }, severity: "CRITICAL" },
      ],
    }),
    trace: { blockTimestamp: "6000" },
    expectedResult: "INVALID",
    violation: { rule: "D1", field: "blockTimestamp" },
  }),
  policy({
    name: "deadline-boundary-002",
    category: CAT.DEADLINE,
    description: "Execution mined exactly at the deadline is conformant",
    policy: basePolicy({
      rules: [{ ruleId: "D1", type: "DEADLINE", params: { deadline: "5000" }, severity: "CRITICAL" }],
    }),
    trace: { blockTimestamp: "5000" },
    expectedResult: "VALID",
  }),
  narrative({
    name: "deadline-hole-canonical-003",
    category: CAT.DEADLINE,
    description: "Deadline changed between commits invalidates canonical copy",
    pipeline: ["C2 canonical copy deadline != committed -> INVALID"],
  }),
  narrative({
    name: "nonce-mismatch-004",
    category: CAT.DEADLINE,
    description: "Nonce differs between intent and execution",
    pipeline: ["NONCE_BINDING mismatch -> INVALID"],
  }),
  narrative({
    name: "valid-after-not-reached-005",
    category: CAT.DEADLINE,
    description: "Execution mined before intent validAfter window",
    pipeline: ["blockTimestamp < validAfter -> INVALID"],
  }),
);

// ── Slippage (5) ─────────────────────────────────────────────────────────
corpus.push(
  policy({
    name: "slippage-exceeded-001",
    category: CAT.SLIPPAGE,
    description: "Effective slippage exceeds max bps bound",
    policy: basePolicy({
      rules: [{ ruleId: "S1", type: "SLIPPAGE_BPS", params: { bps: "50" }, severity: "HIGH" }],
    }),
    trace: { slippageBps: "120" },
    expectedResult: "INVALID",
    violation: { rule: "S1", field: "slippageBps" },
  }),
  policy({
    name: "slippage-boundary-002",
    category: CAT.SLIPPAGE,
    description: "Effective slippage equal to max bps is conformant",
    policy: basePolicy({
      rules: [{ ruleId: "S1", type: "SLIPPAGE_BPS", params: { bps: "50" }, severity: "HIGH" }],
    }),
    trace: { slippageBps: "50" },
    expectedResult: "VALID",
  }),
  policy({
    name: "slippage-zero-bound-003",
    category: CAT.SLIPPAGE,
    description: "Zero-slippage bound rejects any price drift",
    policy: basePolicy({
      rules: [{ ruleId: "S1", type: "SLIPPAGE_BPS", params: { bps: "0" }, severity: "HIGH" }],
    }),
    trace: { slippageBps: "1" },
    expectedResult: "INVALID",
  }),
  narrative({
    name: "slippage-hidden-fee-004",
    category: CAT.SLIPPAGE,
    description: "Hidden fee inflates observed slippage beyond bound",
    pipeline: ["STATE DELTA -> effective price drift > bps -> INVALID"],
  }),
  narrative({
    name: "slippage-liquidity-manip-005",
    category: CAT.SLIPPAGE,
    description: "Liquidity manipulation forces slippage beyond bound",
    pipeline: ["ORACLE bound / price drift -> INVALID"],
  }),
);

// ── Oracle Bound (5) ──────────────────────────────────────────────────────
// v0.1 exposes no oracle rule; these document how a value relative to a
// committed oracle bound is evaluated when attached to a SLIPPAGE/DEADLINE
// style bound or an explicit ORACLE_BOUND rule (post-v0.1 extension).
corpus.push(
  policy({
    name: "oracle-bound-violation-001",
    category: CAT.ORACLE,
    description: "Floor price bound violated by observed execution price (guardrail rule reserve)",
    policy: basePolicy({
      rules: [{ ruleId: "O1", type: "ORACLE_BOUND", params: { floorBps: "9500", ref: "BTC/USD" }, severity: "CRITICAL" }],
    }),
    trace: { priceBps: "8500" },
    expectedResult: "INVALID",
  }),
  policy({
    name: "oracle-bound-pass-002",
    category: CAT.ORACLE,
    description: "Observed execution price within oracle floor bound",
    policy: basePolicy({
      rules: [{ ruleId: "O1", type: "ORACLE_BOUND", params: { floorBps: "9500", ref: "BTC/USD" }, severity: "CRITICAL" }],
    }),
    trace: { priceBps: "9800" },
    expectedResult: "VALID",
  }),
  narrative({
    name: "oracle-manipulation-003",
    category: CAT.ORACLE,
    description: "Oracle manipulation moves ref price to approve overpriced execution",
    pipeline: ["privacy/verification of oracle ref → flagged → INVALID"],
  }),
  narrative({
    name: "oracle-ref-staleness-004",
    category: CAT.ORACLE,
    description: "Stale oracle reference feeds execution price check",
    pipeline: ["ORACLE ref timestamp stale → INVALID"],
  }),
  narrative({
    name: "oracle-deferral-005",
    category: CAT.ORACLE,
    description: "Oracle-bound rule attached to v0.2 execution",
    pipeline: ["rule type not in v0.1 → UNVERIFIABLE (documented)"],
    expectedResult: "UNVERIFIABLE",
  }),
);

// ── Multi-step (5) ───────────────────────────────────────────────────────
corpus.push(
  narrative({
    name: "multistep-hidden-recipient-001",
    category: CAT.MULTI,
    description: "Hidden final hop sends funds to attacker",
    pipeline: [
      "CALL 0: Router → Pool   ✓",
      "CALL 1: Pool → Token    ✓",
      "CALL 2: Token → Attacker ✗ VIOLATION",
    ],
  }),
  narrative({
    name: "multistep-extra-call-002",
    category: CAT.MULTI,
    description: "Execution includes a call not present in simulation",
    pipeline: ["expected calls 3 / observed calls 4 → INVALID"],
  }),
  narrative({
    name: "multistep-sandwich-003",
    category: CAT.MULTI,
    description: "Sandwich-style manipulation across the strategy window",
    pipeline: ["ORACLE / slippage drift across steps → INVALID"],
  }),
  narrative({
    name: "multistep-reentrant-exit-004",
    category: CAT.MULTI,
    description: "Reentrant exit step bypasses withdrawal authorization",
    pipeline: ["TRACE reentrancy → withdraw step unauthorized → INVALID"],
  }),
  narrative({
    name: "multistep-order-swap-005",
    category: CAT.MULTI,
    description: "Steps executed in a different order than committed",
    pipeline: ["TRACE sequence mismatch vs simulated sequence → INVALID"],
  }),
);

// ── Adversarial Mutation (5) ─────────────────────────────────────────────
corpus.push(
  {
    scenario: id(),
    benchmarkId: "mutation-recipient-001",
    category: CAT.MUTATION,
    kind: "mutation",
    description: "Mutate valid transfer recipient — must flip to INVALID",
    base: "valid/transfer-valid-001",
    mutations: ["recipient"],
    mutateTo: { recipient: ADDR.attacker },
    expected: { before: "VALID", after: "INVALID" },
  },
  {
    scenario: id(),
    benchmarkId: "mutation-value-001",
    category: CAT.MUTATION,
    kind: "mutation",
    description: "Mutate valid transfer value — must flip to INVALID",
    base: "valid/transfer-valid-001",
    mutations: ["value"],
    mutateTo: { value: "500000000" },
    expected: { before: "VALID", after: "INVALID" },
  },
  {
    scenario: id(),
    benchmarkId: "mutation-target-001",
    category: CAT.MUTATION,
    kind: "mutation",
    description: "Mutate valid transfer target — must flip to INVALID",
    base: "valid/transfer-valid-001",
    mutations: ["target"],
    mutateTo: { target: ADDR.attacker },
    expected: { before: "VALID", after: "INVALID" },
  },
  {
    scenario: id(),
    benchmarkId: "mutation-selector-001",
    category: CAT.MUTATION,
    kind: "mutation",
    description: "Mutate valid transfer selector — must flip to INVALID",
    base: "valid/transfer-valid-001",
    mutations: ["selector"],
    mutateTo: { selector: SEL.transferFrom },
    expected: { before: "VALID", after: "INVALID" },
  },
  {
    scenario: id(),
    benchmarkId: "mutation-deadline-001",
    category: CAT.MUTATION,
    kind: "mutation",
    description: "Mutate valid transfer deadline — must flip to INVALID",
    base: "valid/transfer-valid-001",
    mutations: ["blockTimestamp"],
    mutateTo: { blockTimestamp: "6000" },
    expected: { before: "VALID", after: "INVALID" },
  },
);

// ── Tamper suite (5) ─────────────────────────────────────────────────────
const tamperCases = [
  { name: "tamper-evidence-recipient-001", field: "evidence.transactions[0].to", description: "Modify evidence recipient after generation" },
  { name: "tamper-receipt-result-002", field: "receipt.result", description: "Flip receipt result after creation" },
  { name: "tamper-trace-hash-003", field: "receipt.executionTraceHash", description: "Replace trace hash with a foreign value" },
  { name: "tamper-intent-hash-004", field: "receipt.intentHash", description: "Replace intent hash with a foreign value" },
  { name: "tamper-state-pinning-005", field: "receipt.execution.blockHash", description: "Point state pinning at a different block" },
];
for (const t of tamperCases) {
  corpus.push({
    scenario: id(),
    benchmarkId: t.name,
    category: "Tamper",
    kind: "tamper",
    description: t.description,
    steps: [
      { step: "generate", action: "Create evidence bundle for a valid execution" },
      { step: "tamper", action: `Modify ${t.field}` },
      { step: "verify", expected: "INVALID", reason: "commitment mismatch" },
    ],
    expected: { result: "INVALID" },
  });
}

// ── Performance (1) ──────────────────────────────────────────────────────
corpus.push({
  scenario: id(),
  benchmarkId: "perf-hash-throughput-001",
  category: "Performance",
  kind: "performance",
  description: "Policy evaluation + hashing throughput budget",
  rounds: 1000,
  maxMs: 5000,
  intent: baseIntent(),
  policy: basePolicy(),
});

// ── Manifest ─────────────────────────────────────────────────────────────
const categoryCounts = {};
for (const s of corpus) {
  categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
}

const manifest = {
  version: "1.0.0-draft",
  generatedBy: "benchmarks/generate-corpus.js",
  total: corpus.length,
  categoryCounts,
};

const out = {
  valid: [],
  invalid: [],
  mutations: [],
  tamper: [],
  performance: [],
};

for (const s of corpus) {
  if (s.kind === "mutation") out.mutations.push(s);
  else if (s.kind === "tamper") out.tamper.push(s);
  else if (s.kind === "performance") out.performance.push(s);
  else if (s.expected.result === "VALID") out.valid.push(s);
  else out.invalid.push(s);
}

const FOLDER = {
  valid: "valid",
  invalid: "invalid",
  mutations: "mutations",
  tamper: "tamper",
  performance: "performance",
};

async function main() {
  for (const key of Object.keys(FOLDER)) {
    const dir = resolve(ROOT, FOLDER[key]);
    await mkdir(dir, { recursive: true });
    for (const s of out[key]) {
      await writeFile(resolve(dir, `${s.benchmarkId}.json`), JSON.stringify(s, null, 2) + "\n", "utf8");
    }
  }
  await writeFile(resolve(ROOT, "corpus-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const table = Object.entries(categoryCounts)
    .map(([c, n]) => `  ${n.toString().padStart(2)}  ${c}`)
    .join("\n");
  console.log(`\nCoreGuard benchmark corpus generated: ${manifest.total} scenarios\n\n${table}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}