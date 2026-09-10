# Contributing to CoreGuard

Thanks for your interest. CoreGuard is an execution-truth protocol for Bitcoin DeFi
on Core. Open source, deterministic, audit-friendly. Zero-dependency Node.js + one
tiny Solidity contract.

## Ground rules

1. **Determinism above all.** Verification must be reproducible by anyone, anywhere.
   No heuristics, no network calls inside the verifier, no mutable global state.
2. **Honesty in claims.** Never claim "100% secure", "audited", "prevents all exploits"
   or anything that attributes safety to CoreGuard that it does not provably provide.
3. **Scope discipline.** Guard against feature creep. If a feature belongs in the
   roadmap, say so instead of silently expanding v0.x.

## Development

```bash
npm install
npm test          # node --test — canonicalization, policy, tamper suites
npm run corpus    # regenerate the deterministic benchmark corpus
npm run benchmark # run all 61 adversarial scenarios
forge build       # Solidity registry
```

Tests must stay green and the benchmark count must stay 61/61 before merging.

## Conventional commits

- `feat:` new capability · `fix:` bug · `docs:` spec/docs · `test:` suites
- `spec:` changes to CGEP/1 and friends · `contract:` Solidity changes

## Code of conduct

Be respectful. Technical disagreement is welcome; personal attacks are not.

## Review

- **Engine changes** must keep the verifier RPC-free and deterministic.
- **Spec changes** must update `spec/` in the same commit.
- **Contract changes** must include the reason the commitment model (not the
  evidence model) changed.

Questions? Open an issue before a large PR.