# Pricing — plans at hypothesis (Decision Gate-locked)

> Status: **HYPOTHESIS ONLY.** No committed pricing. Per standing rule
> (`docs/adoption/README.md` §Decision-Gate; `economics.md`), pricing and
> outreach decisions stay locked until Counterparty #1 (ElizaOS) is recorded
> and the Decision Gate runs. Everything below is a proposal shaped for
> discussion — never an offer, never a meter, never a lock.
>
> Machine view: `packages/pricing/pricing.js` → `pricingTable()` stamps
> `gated: true` and prints the same disclaimer on every output.

## 1. Why the free tier exists (and why it is honest)

The value CoreGuard ships is per-execution determinism (who ran what, prove it
on-chain, fail closed). Before any counterparty pays, they need a **zero-cost
way to run a real verification** and see the receipt. The free tier funds that
with no revenue fiction: it is a limited-beta on-ramp, not an acquisition
trap and not a "freemium" claim.

## 2. Hypothesis plan table

| Plan | Price (hypothesis) | Limits | Buyer fit (from `use-cases.md`) |
|---|---|---|---|
| 🌱 **Starter** | 0 (free) | 10 verifications/week; public anchor on Core | Individuals, tinkerers, early bots |
| ⚡ **Pro** | 1 CORE/month subscription + on-chain flat commission (`feeWei` in `EvidenceRegistryV3`) | Unlimited verifications; API access; DDE/1 dispute support; analytics | U1 keepers / U2 agent platforms |
| 🏢 **Enterprise / Core team** | Custom (SLA, policy customization, HTTP integration) | Negotiated | U3 treasury/institutional, bot/robot fleets |

*Currency: CORE (Core Mainnet, chainId 1116). Subscription figure is a
placeholder hypothesis pending the Decision Gate — revisit before any
commitment.*

## 3. Commission model (already on-chain, tested)

`EvidenceRegistryV3` implements the commission side of paid plans (Foundry
34/34 green):

- flat `feeWei` paid in the **same call** as `anchorProof` — no silent debit;
- `CommissionMismatch` reverts on overpay **or** underpay (deterministic);
- `feeTo` treasury collects; only the operator (`feeTo`) can `withdrawTreasury`;
- `feeWei = 0` degenerates the contract to pure V2 behavior (free path);
- no reentrancy surface; domain-separated to prevent cross-chain replay.

So the *"pay, but cheap, transparent, and auditable"* half is real, tested
protocol code. The *"how much"* half is explicitly frozen by governance.

## 4. Honesty box

- No billing, no metering, no Stripe/Card/invoice primitives anywhere in the
  repo: the pricing module renders structure only.
- **Zero revenue to date** — this doc proposes, it does not claim.
- Program facts (Core Commit / Buildathon / Ignition) are public, dated,
  planning-only; implying eligibility is prohibited.
- When the gate opens, `packages/pricing/` is the **single** place where real
  numbers flip — CLI, docs and DApp all read from it.

## 5. Files

| File | Role |
|---|---|
| `packages/pricing/pricing.js` | Hypothesis pricing view (read-only, gated) |
| `packages/pricing/package.json` | Workspace package metadata |
| `test/pricing/pricing.test.js` | 9 tests incl. fail-closed + no-enforcement tokens |
| `docs/coreguard-dapp-core.html` | DApp surface rendering the plan table |
| `docs/adoption/economics.md` | Two-sided economics + honest revenue ladder |