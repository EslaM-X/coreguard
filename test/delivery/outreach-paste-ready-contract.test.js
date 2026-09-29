import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The paste-ready pack is a CONVENIENCE COPY of the gated outreach sources —
 * it must never become a second place where words drift from what the B6
 * gates actually approved. These tests bind it to its sources at runtime:
 * every letter's subject line and every live surface URL must appear
 * verbatim in BOTH files, the fabricated-news constructs (an attributed
 * breaking-news opener, the unsourced 53-images figure) must appear in NO
 * outreach file, and the pack's own structure (scissors markers, fill-once
 * fields, the 60-second pre-send checklist, the canned-replies discipline)
 * must stay intact.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = join(REPO, "docs", "outreach");
const PACK = readFileSync(join(OUT, "paste-ready-2026-09-29.md"), "utf8");

/** [paste file, source file, a subject/title line that MUST match verbatim in both] */
const BOUND_LETTERS = [
  ["openai-en.md", "A replayable incident-review surface for runaway-agent cases"],
  ["anthropic-en.md", "The operational half of agent-safety research: replayable incident verdicts"],
  ["deepseek-en.md", "A forkable, CI-verified incident-review surface for open agent ecosystems"],
  ["google-gemini-en.md", "An inheritable evidence layer for agent-incident reviews"],
];

const LIVE_SURFACES = [
  "https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html",
  "https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md",
  "https://github.com/EslaM-X/coreguard",
  "https://eslam-x.github.io/coreguard/raer/registry.json",
  "https://eslam-x.github.io/coreguard/raer/feed.json",
];

test("paste-ready: every gated letter's subject binds the pack to its source verbatim", () => {
  for (const [file, line] of BOUND_LETTERS) {
    const src = readFileSync(join(OUT, file), "utf8");
    assert.ok(src.includes(line), `${file} must still carry its approved subject line`);
    assert.ok(PACK.includes(line), `the paste pack's ${file} section must quote the subject verbatim`);
  }
  // the two public posts bind through their distinctive approved sentences
  const agentSafety = readFileSync(join(OUT, "public-post-agent-safety.md"), "utf8");
  const raerLaunch = readFileSync(join(OUT, "public-post-raer-launch.md"), "utf8");
  assert.ok(agentSafety.includes("We didn't build a faster announcement. We built the missing review surface."));
  assert.ok(PACK.includes("We didn't build a faster announcement. We built the missing review surface."));
  assert.ok(raerLaunch.includes("Today we're launching **RAER**"));
  assert.ok(PACK.includes("Today we're launching **RAER**"));
  // the Arabic intake letter and the Arabic RAER post are referenced by their
  // gated files (the pack delegates to them rather than duplicating them)
  assert.ok(PACK.includes("aic-mcit-intake-ar.md"), "the Arabic intake letter must route to its gated file");
  assert.ok(PACK.includes("public-post-raer-launch-ar.md"), "the Arabic RAER post must route to its gated file");
});

test("paste-ready: every live surface link appears in the pack exactly as gated", () => {
  for (const url of LIVE_SURFACES) {
    assert.ok(PACK.includes(url), `the pack must carry the live surface ${url}`);
  }
});

test("fabricated-news constructs appear in NO outreach file", () => {
  // the owner's example text ("عاجل: أعلنت OpenAI… 53 صورة") is a made-up
  // news item; it is discussed as a PATTERN only — never pasted anywhere.
  const forbidden = ["أعلنت OpenAI", "أعلنت جوجل", "أعلنت Google", "53 صورة", "عاجل: أعلنت"];
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith(".md")) continue;
    const text = readFileSync(join(OUT, f), "utf8");
    for (const phrase of forbidden) {
      assert.ok(!text.includes(phrase), `${f} must not contain the fabricated-news construct "${phrase}"`);
    }
  }
  // and the pack must STATE the rule it enforces
  assert.ok(PACK.includes("مثال نمط يُناقَش فقط"), "the pack must keep the pattern-only warning visible");
});

test("paste-ready: structure — scissors markers, fill-once fields, checklist, and the reply ledger", () => {
  assert.ok((PACK.match(/✂️ ابدأ/g) || []).length >= 9, "every paste section opens with a scissors marker");
  assert.ok((PACK.match(/✂️ انتهِ/g) || []).length >= 9, "every paste section closes with a scissors marker");
  assert.ok(PACK.includes("[Name — project owner, CoreGuard]"), "the fill-once sign-off placeholder must stay un-substituted in the repo copy");
  assert.ok(PACK.includes("فحص 60 ثانية"), "the 60-second pre-send checklist must be present");
  assert.ok(PACK.includes("جدول التتبع"), "the pack must route sends to the tracking ledger");
  assert.ok(PACK.includes("ليس بعد؛"), "the canned replies must keep the ledger discipline (Arabic)");
  assert.ok(PACK.includes("Not yet;"), "the canned replies must keep the ledger discipline (English)");
});
