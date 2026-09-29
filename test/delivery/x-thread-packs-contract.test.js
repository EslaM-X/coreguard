/**
 * The X thread packs (docs/outreach/x-thread-packs.md) are the PASTE-READY
 * X surface split from the two gated posts. Until now their ≤280 discipline
 * was enforced only by a MANUAL one-shot tool (scripts/measure-x-thread-packs.cjs)
 * — nothing stopped an edit from pushing a post over X's limit and finding
 * out after paste. This contract closes that gap on every push:
 *
 *   1. EVERY post is re-measured with X's own weighting (URL counts as 23
 *      characters regardless of its real length; limit 280) — a single post
 *      over the limit fails the push and names the tag and its weight.
 *   2. The manual tool must keep stating the SAME methodology — one
 *      methodology, two consumers, so the manual check and this contract
 *      can never silently disagree.
 *   3. The packs stay bound to their gated sources (the two approved
 *      sentences) and keep the honesty rules (the registry/feed links are
 *      the only quotable surfaces; the fabricated-news constructs appear
 *      nowhere).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "outreach");
const PACKS = readFileSync(join(OUT, "x-thread-packs.md"), "utf8");
const AGENT_SAFETY = readFileSync(join(OUT, "public-post-agent-safety.md"), "utf8");
const RAER_LAUNCH = readFileSync(join(OUT, "public-post-raer-launch.md"), "utf8");

/** X weighting — MUST match scripts/measure-x-thread-packs.cjs (one methodology, two consumers). */
const X_URL_WEIGHT = 23;
const X_POST_LIMIT = 280;

/** One entry per **A#/##** or **B#/##** marker, tolerant of CRLF. */
function posts(md) {
  const out = [];
  for (const section of md.split(/## Thread /).slice(1)) {
    for (const m of section.matchAll(/\*\*([AB]\d+\/\d+)\*\*\r?\n([\s\S]*?)(?=\r?\n\*\*[AB]\d+\/\d+\*\*|\r?\n---|$)/g)) {
      out.push({ tag: m[1], text: m[2].trim() });
    }
  }
  return out;
}

function xWeightedLength(text) {
  const raw = [...text].length;
  const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
  return raw - urls.reduce((acc, u) => acc + u.length, 0) + urls.length * X_URL_WEIGHT;
}

test("every X-thread post stays within the 280-character X-weighted limit — measured on every push", () => {
  const list = posts(PACKS);
  assert.ok(list.length >= 22, `expected the full A+B thread packs, found ${list.length} posts`);
  const over = list
    .map(({ tag, text }) => ({ tag, weighted: xWeightedLength(text) }))
    .filter((p) => p.weighted > X_POST_LIMIT)
    .map((p) => `${p.tag}=${p.weighted}`);
  assert.deepEqual(
    over,
    [],
    `posts exceed the 280-character X-weighted limit (URL counts as ${X_URL_WEIGHT}): ${over.join(", ")} — split or trim the post in the pack, then re-run`
  );
});

test("the manual measuring tool and this contract enforce the SAME methodology", () => {
  // the one-shot tool's header documents the weighting; if either consumer
  // changes the methodology alone, the manual check and CI would disagree —
  // both must move together.
  const tool = readFileSync(join(HERE, "..", "..", "scripts", "measure-x-thread-packs.cjs"), "utf8");
  assert.ok(tool.includes(`* ${X_URL_WEIGHT}`), "the measuring tool must keep the documented X URL weight (23)");
  assert.ok(tool.includes(String(X_POST_LIMIT)), "the measuring tool must keep the documented X limit (280)");
});

test("thread packs bind to their gated sources and keep the honesty rules", () => {
  assert.ok(AGENT_SAFETY.includes("We didn't build a faster announcement. We built the missing review surface."));
  assert.ok(RAER_LAUNCH.includes("Today we're launching **RAER**"));
  // the live registry/feed are the only quotable surfaces for numbers
  assert.ok(PACKS.includes("https://eslam-x.github.io/coreguard/raer/registry.json"));
  assert.ok(PACKS.includes("https://eslam-x.github.io/coreguard/raer/feed.json"));
  // the fabricated-news constructs appear nowhere in the packs
  assert.ok(!PACKS.includes("53 صورة"));
  assert.ok(!PACKS.includes("أعلنت OpenAI"));
  assert.ok(!PACKS.includes("أعلنت جوجل"));
  assert.ok(!PACKS.includes("أعلنت Google"));
});
