# EOL Policy — Byte-Exact Sources and Evidence

**Status: CLOSED** · **Policy ID:** `cg-eol-policy-v1` · Supersedes the open advisory in `FINAL-CLOSURE-PACKAGE.md`
**Scope:** every byte-sensitive surface: `packages/verifier-c/**` (Dec-C-9 self-checksum), the assurance evidence trees, `legacy-quarantine/**`

---

## 1. Proven failure (why this policy exists)

A fresh Windows clone with `core.autocrlf=true` rewrote LF→CRLF in `packages/verifier-c/verifier_c/__init__.py`.
The Dec-C-9 self-checksum (recomputed at import in `packages/verifier-c/index.js`) failed closed:

```
Error: verifier-c: source checksum mismatch (Dec-C-9) for __init__.py:
  got      sha256:e8a29936… (CRLF-rewritten)
  expected sha256:d4c2fa2e… (repository blob)
```

Root cause: `verifier-c` had no EOL rule in `.gitattributes`, so Git's text conversion applied.
The failure was reproducible only on Windows clones — invisible to Linux CI and to the author's
local checkout, which is why it survived several verification cycles.

## 2. Policy contract (and where each clause is proven)

| Clause | Definition | Proof |
|---|---|---|
| `.gitattributes` behavior | `packages/verifier-c/** -text` (new, this commit) | `.gitattributes` |
| verifier-c behavior | Dec-C-9 self-checksum recomputed at import; any byte change fails closed | `packages/verifier-c/index.js` (Dec-C-9) |
| Frozen-byte policy | assurance + quarantine trees remain `-text` (pre-existing, unchanged) | `.gitattributes` |
| Unix behavior | no conversion; native LF; checksums hold | native checkout |
| **Windows behavior** | **checkout under `autocrlf=true` is byte-exact** for verifier-c and the freeze record | **`test/eol/eol-policy.test.mjs`** — simulates the poison config per-invocation via `git -c core.autocrlf=true checkout-index`, asserts byte equality vs the repository blob, never touches global config |
| Result captured in evidence | classification + test identity recorded here and in the closure package | this file + `FINAL-CLOSURE-PACKAGE.md` addendum |

## 3. Classification: CLOSED

All clauses defined, all behaviors tested, evidence captured. There is no fourth state.

## 4. Re-open condition

Any byte-change in a `-text` tree (including whitespace or EOL) invalidates this policy: the
Dec-C-9 checksum and the freeze verifier (`validate-freeze.mjs`) are the enforcement points.
A re-open requires a proven byte-diff on a protected surface and its own remediation cycle.
