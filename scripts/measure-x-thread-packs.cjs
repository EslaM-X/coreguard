// one-shot measuring tool for the X thread packs (not part of the suite)
// usage: node scripts/measure-x-thread-packs.cjs  → exit 1 if any post > 280 (X-weighted)
const fs = require("fs");
const md = fs.readFileSync("docs/outreach/x-thread-packs.md", "utf8");
const sections = md.split(/## Thread /).slice(1);
let bad = 0, count = 0;
for (const s of sections) {
  const name = s.split("\n")[0].trim();
  const posts = [...s.matchAll(/\*\*([AB]\d+\/\d+)\*\*\n([\s\S]*?)(?=\n\*\*[AB]\d+\/\d+\*\*|\n---|$)/g)];
  for (const [, tag, text] of posts) {
    const t = text.trim();
    const raw = [...t].length;
    const urls = t.match(/https?:\/\/[^\s)]+/g) || [];
    // X weighting: every URL counts as 23 characters regardless of its length
    const weighted = urls.reduce((acc, u) => acc - u.length, raw) + urls.length * 23;
    count++;
    const ok = weighted <= 280;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "OVER"} ${tag}  raw=${raw}  x-weighted=${weighted}`);
  }
  console.log(`— ${name}: ${posts.length} posts`);
}
console.log(`total posts: ${count}, over-limit: ${bad}`);
process.exit(bad ? 1 : 0);
