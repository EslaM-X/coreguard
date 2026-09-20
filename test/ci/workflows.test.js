/**
 * Guard: a multi-line plain `run:` scalar makes GitHub build ZERO jobs (the run
 * is marked failure with no logs). History: red run 35480761761 at commit
 * 6c4ca1d added a plain `run:` whose continuation held `{ port: 0 }`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlainContinuations, checkWorkflows } from "../../scripts/check-workflows.mjs";

test("all committed workflow files pass the zero-jobs guard", () => {
  const res = checkWorkflows();
  assert.equal(res.ok, true, JSON.stringify(res.results.filter((r) => r.problems.length)));
  assert.ok(res.results.length >= 2, "expected ci.yml + dde.yml");
});

test("plain run: scalar continuing on a more-indented line is flagged (6c4ca1d shape)", () => {
  const bad = [
    "      - name: DDE HTTP endpoint — live smoke over loopback",
    '        run: node --input-type=module -e "',
    "          import { startDeliveryEndpoint } from './packages/delivery/http.js';",
    "          const server = await startDeliveryEndpoint({ port: 0 });",
    '          "',
  ].join("\n");
  const problems = findPlainContinuations(bad);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line, 2);
  assert.equal(problems[0].continuationLine, 3);
});

test("a block scalar `run: |` is safe", () => {
  const good = ["        run: |", "          node x.js", "          echo done"].join("\n");
  assert.deepEqual(findPlainContinuations(good), []);
});

test("a single-line plain run is safe", () => {
  assert.deepEqual(findPlainContinuations("      - run: node examples/transfer/run-demo.js"), []);
});

test("a quoted scalar run carrying ': ' is safe", () => {
  assert.deepEqual(findPlainContinuations('        run: "node -e { port: 0 }"'), []);
});

test("a comment line after a plain run does not count as a continuation", () => {
  const ok = ["        run: node x.js", "        # trailing note"].join("\n");
  assert.deepEqual(findPlainContinuations(ok), []);
});