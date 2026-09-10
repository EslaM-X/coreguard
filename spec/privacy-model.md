# CoreGuard Privacy Model v0.1

## Design Principle

> CoreGuard is designed not to require centralized collection or profiling of wallet identities. It needs to know whether execution was correct, not who executed it.

## Data Classification

### What CoreGuard Does NOT Require

- User identity
- Behavioral profiling
- Centralized user tracking
- IP addresses or device fingerprints

### What CoreGuard Processes

| Data | Lifetime | Storage | Purpose |
|---|---|---|---|
| Intent | Ephemeral | User's device | Input for verification |
| Execution trace | User-controlled | Local or user-chosen | Evidence generation |
| Policy rules | User-controlled | User's device | Policy evaluation |
| Evidence receipt | User-controlled | User chooses | Core output |

### What CoreGuard Generates

| Data | Control | User Can |
|---|---|---|
| Evidence receipts | User-owned | Store, share, delete, verify independently |
| On-chain commitments | Public | Verify permissionlessly |

## Privacy Tiers

| Tier | Privacy Level | Use Case |
|---|---|---|
| CLI | Maximum | All processing local, no network required |
| Self-hosted verifier | High | Local verification, no external calls |
| Hosted Verify | Variable | User-initiated verification only |
| Enterprise | Customer-controlled | Dedicated deployment |

## Anti-Surveillance Guarantees

1. **No wallet profiling.** CoreGuard does not track or aggregate wallet activity.
2. **No transaction data selling.** CoreGuard does not sell or share transaction data.
3. **Local-first.** All processing can happen on the user's machine.
4. **Open source.** Anyone can audit the code to verify these guarantees.

## Selective Disclosure

Users can share specific fields without revealing all:

```
Full receipt:
  - Intent, execution, policy, evidence

Selective disclosure:
  - Policy ID + verification result only
  - No wallet address, no value, no target
```

## Legal Considerations

- Blockchain addresses may be personal data in some jurisdictions
- CoreGuard is designed to minimize processing of such data
- Users control what evidence they share
- No centralized data collection point
