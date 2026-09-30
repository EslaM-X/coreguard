import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * nginx.conf contract — the reference proxy conf cannot drift from the doc
 * (and the doc cannot drift from the conf), and neither can drift from the
 * APP's own constants.
 *
 * deploy/nginx.conf is the READY-TO-USE artifact of the documented production
 * posture ("Running behind a reverse proxy" in docs/delivery-dispute-boundary.md).
 * Three binding directions, all structural (no nginx binary required — the
 * [C17] rule: no test may depend on a tool the dev box may not have):
 *
 *   1. doc → conf : every directive in the doc's nginx fence must exist in
 *      deploy/nginx.conf with the same normalized value (the conf is the doc,
 *      deployed).
 *   2. conf → doc : every conf directive must be doc-covered or belong to the
 *      PINNED infrastructure set (worker/listen/TLS plumbing) — a new
 *      directive cannot hide beside sanctioned ones ([C32]: pin the set).
 *   3. conf → app : the edge body cap must be ≤ MAX_BODY_BYTES read from the
 *      live source, proxy_pass must target the DOCUMENTED loopback port, and
 *      the edge rate must stay ≤ the documented backstop (the doc's
 *      "sized above the proxy's ceiling" rule, machine-checked).
 *
 * The conf header carries a pointer to THIS file (its own signing): the test
 * refuses a conf that loses the reference — an artifact nobody knows is
 * guarded is a guard nobody can trust.
 *
 * Negative controls are applied to TMP COPIES inside this file (the
 * status-truth pattern): dropping a doc-required directive, changing the body
 * cap, moving the port, and mutating the doc fence must each turn the checker
 * red BY NAME — "mutation applied" is asserted separately from "bit".
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CONF = join(REPO, "deploy", "nginx.conf");
const DOC = join(REPO, "docs", "delivery-dispute-boundary.md");
const APP = join(REPO, "packages", "delivery", "http.js");

const read = (p) => readFileSync(p, "utf8").replaceAll("\r\n", "\n");

/** Non-comment directive lines, normalized whitespace, blocks flattened. */
function directives(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("http {") && !l.startsWith("server {") && !l.startsWith("location / {") && !l.startsWith("events {") && l !== "}")
    .map((l) => l.replace(/\s+/g, " ").replace(/;$/, ""));
}

/** The doc's single nginx fence — indented 3 spaces inside the numbered rule. */
function docFenceDirectives(docText) {
  const fences = [...docText.matchAll(/```nginx\r?\n([\s\S]*?)```/g)].map((m) =>
    // the fence is indented (inside rule 1 of the production posture); strip
    // the common 3-space indent before parsing so it compares to the conf
    m[1].split("\n").map((l) => l.replace(/^ {3}/, "")).join("\n"),
  );
  if (fences.length !== 1) return { fenceError: `the boundary doc must carry exactly one nginx fence, found ${fences.length}` };
  return directives(fences[0]);
}

/**
 * The checker: returns violations ([] = clean). Pure over (confText, docText,
 * appText) so the mutation battery below can bite on tmp copies.
 */
function check(confText, docText, appText) {
  const violations = [];
  const conf = directives(confText);
  const fence = docFenceDirectives(docText);
  if (fence && fence.fenceError) {
    violations.push(fence.fenceError);
    return violations; // no fence directives to compare against
  }
  const doc = fence;

  // Signing: the conf must carry the pointer to this contract file.
  if (!confText.includes("test/ci/nginx-conf-contract.test.js")) {
    violations.push("deploy/nginx.conf lost its contract pointer (test/ci/nginx-conf-contract.test.js) — the artifact no longer names its own guard");
  }

  // 1. doc → conf: every documented directive must be in the conf, verbatim
  //    after normalization (the conf is the doc, deployed).
  for (const d of doc) {
    if (!conf.includes(d)) violations.push(`doc directive missing from deploy/nginx.conf: "${d}" — the reference conf drifted from the documented posture`);
  }

  // 2. conf → doc: every conf directive is doc-covered or PINNED infra.
  const PINNED = new Set([
    "worker_processes auto",
    "worker_connections 1024",
    "listen 443 ssl",
    "ssl_certificate /etc/nginx/ssl/dde.crt",
    "ssl_certificate_key /etc/nginx/ssl/dde.key",
  ]);
  for (const d of conf) {
    if (!doc.includes(d) && !PINNED.has(d)) {
      violations.push(`conf directive not documented and not pinned: "${d}" — add it to the doc's nginx fence or to the PINNED infra set in nginx-conf-contract.test.js, consciously`);
    }
  }

  // 3. conf → app constants, read LIVE from the source (never retyped).
  //    The expression is evaluated (1024 * 1024), not regex-captured, so a
  //    deliberate change to the app's cap wording still binds here.
  const maxBodyExpr = appText.match(/export const MAX_BODY_BYTES = ([^;]+);/)?.[1];
  const maxBody = maxBodyExpr ? Number(eval(maxBodyExpr)) : NaN;
  assert.ok(Number.isFinite(maxBody) && maxBody > 0, "http.js no longer states MAX_BODY_BYTES — the contract lost its app anchor");
  const cap = conf.find((d) => d.startsWith("client_max_body_size "));
  if (cap) {
    const m = cap.match(/client_max_body_size (\d+)(m|k|)?$/);
    if (!m) violations.push(`unparseable client_max_body_size in conf: "${cap}"`);
    else {
      const bytes = Number(m[1]) * (m[2] === "m" ? 1024 * 1024 : m[2] === "k" ? 1024 : 1);
      if (bytes > maxBody) {
        violations.push(`edge body cap (${cap} = ${bytes} bytes) exceeds the app's MAX_BODY_BYTES (${maxBody}) — oversize would reach the app instead of dying at the proxy`);
      }
    }
  } else {
    violations.push("conf carries no client_max_body_size — the documented edge cap is gone");
  }

  // Documented loopback port: the doc's start line pins port: 8787; the conf
  // must proxy_pass to the same target.
  const portDoc = docText.match(/startDeliveryEndpoint\(\{ port: (\d+)/)?.[1];
  const pass = conf.find((d) => d.startsWith("proxy_pass "));
  if (!pass) violations.push("conf carries no proxy_pass — the documented upstream is gone");
  else if (portDoc && !pass.includes(`127.0.0.1:${portDoc}`)) {
    violations.push(`proxy_pass "${pass}" does not target the documented endpoint port (${portDoc})`);
  }

  // Edge rate ≤ documented backstop: rate=10r/s in the fence, backstop 600/min
  // in the doc's production start line — "sized above the ceiling", checked.
  const edge = doc.join(" ").match(/rate=(\d+)r\/s/)?.[1];
  const backstop = docText.match(/rateLimit: \{ windowMs: 60000, max: (\d+) \}/)?.[1];
  if (edge && backstop && Number(edge) * 60 > Number(backstop)) {
    violations.push(`edge rate ${edge}r/s (${Number(edge) * 60}/min) exceeds the documented backstop ${backstop}/min — the app's limiter would fire before the proxy's`);
  }

  return violations;
}

test("nginx conf: matches the documented fence, stays inside pinned infra, and respects the app's live constants", () => {
  const violations = check(read(CONF), read(DOC), read(APP));
  assert.deepEqual(violations, [], "nginx reference conf drifted:\n  " + violations.join("\n  "));
});

test("nginx conf: the doc's fence itself still states the pinned semantics", () => {
  const doc = read(DOC);
  // The fence the conf mirrors must keep its binding semantics verbatim.
  for (const semantic of [
    "limit_req_zone $binary_remote_addr zone=dde:10m rate=10r/s",
    "limit_req zone=dde burst=20 nodelay",
    "client_max_body_size 1m",
    "proxy_pass http://127.0.0.1:8787",
    "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for",
  ]) {
    assert.ok(doc.includes(semantic), `the doc's nginx fence lost a pinned semantic: "${semantic}"`);
  }
});

// ---------------------------------------------------------------------------
// Negative controls — tmp copies, "applied" asserted separately from "bit".
// ---------------------------------------------------------------------------

function mutated(base, replacements, label) {
  let s = base;
  for (const [from, to] of replacements) {
    if (!s.includes(from)) return { applied: false, out: null, label };
    s = s.replaceAll(from, to);
  }
  return { applied: true, out: s, label };
}

test("nginx conf negative controls: each mutation applies AND bites, by name", () => {
  const conf = read(CONF);
  const doc = read(DOC);
  const app = read(APP);
  const tmp = mkdtempSync(join(tmpdir(), "nginx-conf-nc-"));

  const cases = [
    {
      label: "drop the edge limit_req from the conf",
      conf: [["limit_req zone=dde burst=20 nodelay;", ""]],
      expect: /doc directive missing from deploy\/nginx.conf: "limit_req zone=dde burst=20 nodelay"/,
    },
    {
      label: "raise the edge body cap above the app's",
      conf: [["client_max_body_size 1m;", "client_max_body_size 10m;"]],
      expect: /exceeds the app's MAX_BODY_BYTES/,
    },
    {
      label: "move the upstream off the documented port",
      conf: [["proxy_pass http://127.0.0.1:8787;", "proxy_pass http://127.0.0.1:8788;"]],
      expect: /does not target the documented endpoint port/,
    },
    {
      label: "sneak an undocumented directive into the conf",
      conf: [["proxy_set_header Host $host;", "proxy_set_header Host $host;\n            proxy_set_header X-Real-IP $remote_addr;"]],
      expect: /not documented and not pinned: "proxy_set_header X-Real-IP/,
    },
    {
      label: "lose the contract pointer from the conf header",
      conf: [["test/ci/nginx-conf-contract.test.js", "removed"]],
      expect: /lost its contract pointer/,
    },
    {
      label: "mutate the doc fence away from the conf",
      doc: [["client_max_body_size 1m;", "client_max_body_size 2m;"]],
      expect: /doc directive missing from deploy\/nginx.conf: "client_max_body_size 2m"/,
    },
    {
      label: "delete the doc fence entirely",
      doc: null, // handled specially below (fence removal)
      expect: /exactly one nginx fence/,
    },
  ];

  let applied = 0;
  for (const c of cases) {
    let confOut = conf, docOut = doc;
    if (c.conf) {
      const m = mutated(conf, c.conf, c.label);
      if (!m.applied) continue;
      confOut = m.out;
      applied++;
    }
    if (c.doc) {
      const m = mutated(doc, c.doc, c.label);
      if (!m.applied) continue;
      docOut = m.out;
      applied++;
    }
    if (c.doc === null) {
      // remove the whole nginx fence from the doc copy (CRLF-tolerant: the
      // fence may be stripped to \n by read(), so match both spellings)
      if (!docOut.includes("```nginx")) continue;
      docOut = docOut.replace(/```nginx\r?\n[\s\S]*?```\r?\n?/, "");
      applied++;
    }
    const violations = check(confOut, docOut, app);
    assert.ok(
      violations.length > 0,
      `negative control did not bite: "${c.label}" — the checker stayed green over a corrupted pair`,
    );
    assert.match(
      violations.join("\n"),
      c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`,
    );
  }
  assert.ok(applied >= 7, `expected all 7 negative controls to apply, only ${applied} did — the battery is not testing what it thinks`);
  rmOnExit(tmp);
});

/** Late cleanup so failures above still leave no droppings in tmp. */
import { rmSync } from "node:fs";
function rmOnExit(dir) {
  process.on("exit", () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
  });
}
