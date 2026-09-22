/**
 * Shared candidate builder for the real-fixture intake contract tests.
 *
 * DELEGATES to examples/real-fixture-intake/make-intake-candidate.mjs —
 * the single source of truth for the modeled REAL candidate shape. CI's
 * intake surveillance run (workflows/intake.yml) builds its candidate with
 * the same module's CLI, so the contract tests and the continuous pipeline
 * exercise byte-identical candidate shapes: the builder cannot drift away
 * from CI without a red run naming it.
 *
 * Every intake test (intake.test.js) and every converter-feature test
 * (convert-zip.test.js) builds its candidate from here.
 */

export { RECORDS, sha256, makeCandidate } from "../../examples/real-fixture-intake/make-intake-candidate.mjs";

