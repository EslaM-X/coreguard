import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Doc-freshness contract — a marker a reader must TRUST (a DNS host, a port,
 * a protocol version, a wire code) must not age out from under the live code.
 *
 * The nginx-conf and container-posture contracts bind deploy artifacts to the
 * doc's prose; THIS one binds every trust-carrying MARKER to the code that
 * owns it. Values are derived LIVE at run time (never retyped here), so a
 * deliberate change to the code turns every doc/artifact occurrence stale in
 * the same push — by name — unless the change is carried through consciously:
 *
 *   - loopback port/host      ← startDeliveryEndpoint({ port, host }) defaults
 *   - status codes            ← send(NNN) sites + the VERIFIED ternary in http.js
 *   - protocol version        ← DDE_VERSION in packages/delivery/index.js
 *   - boundary header code    ← BOUNDARY_BANNER.code
 *   - rate-limit window       ← RATE_LIMIT_DEFAULTS.windowMs
 *   - repo + Pages hosts      ← package.json homepage + repository.url
 *   - RPC example hosts       ← committed fixtures in examples/ ONLY (never the
 *     doc itself — a document must not be the source that vouches for itself)
 *
 * Rules are anchored on marker FORMS, not on any 4-5 digit number: a bare
 * integer (a burst size, an RFC number, a hash length) is not a port, and a
 * dotted token ending in a file extension is a FILE, not a host — the first
 * draft of this test flagged "60000" as a port and "verify-fixture.mjs" as a
 * DNS name, which is the crying-wolf guard [C32] forbids. Tokens that merely
 * LOOK like hosts and the artifact plumbing ports are pinned as sets, so a
 * REAL new host/port can never hide behind a sanctioned one.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DOC = "docs/delivery-dispute-boundary.md";
const ARTIFACTS = ["deploy/nginx.conf", "deploy/k8s/dde-pod.yaml", "deploy/k8s/dde-netpol.yaml"];

const read = (p) => readFileSync(join(REPO, p), "utf8").replaceAll("\r\n", "\n");

/** File extensions that make a dotted token a FILENAME, not a DNS name. */
const FILE_EXT = new Set(["mjs", "js", "cjs", "json", "yaml", "yml", "md", "mdx", "conf", "html", "crt", "key", "svg", "txt", "tap"]);

/** Derive the live marker universe from the code itself. Throws on absence —
 *  refusing to derive 0 markers ([C30]) beats asserting a confident nothing. */
function deriveLive() {
  const appText = read("packages/delivery/http.js");
  const indexText = read("packages/delivery/index.js");

  const port = appText.match(/startDeliveryEndpoint\(\{\s*port\s*=\s*(\d+)/)?.[1];
  const host = appText.match(/startDeliveryEndpoint\(\{\s*port\s*=\s*\d+,\s*host\s*=\s*"([^"]+)"/)?.[1];
  const codes = new Set(
    [...appText.matchAll(/send\((\d{3})/g)].map((m) => m[1])
      .concat([...appText.matchAll(/const code = [^\n]*\?\s*(\d{3})\s*:\s*(\d{3})/g)].flatMap((m) => [m[1], m[2]])),
  );
  const version = indexText.match(/export const DDE_VERSION = "([^"]+)"/)?.[1];
  const banner = indexText.match(/export const BOUNDARY_BANNER = Object\.freeze\(\{\s*code:\s*"([^"]+)"/)?.[1];
  const windowMs = appText.match(/windowMs:\s*([0-9_]+),/)?.[1];

  const pkg = JSON.parse(read("package.json"));
  const repoUrl = pkg.repository?.url ?? "";
  const repoM = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  assert.ok(repoM, "package.json repository.url must name a github owner/repo — the freshness contract lost its Pages anchor");
  const pagesHost = `${repoM[1].toLowerCase()}.github.io`;

  // RPC example hosts: every committed FIXTURE source under examples/ that
  // names an RPC host (the machine's world — deliberately not docs/, which
  // this very test audits and which must not vouch for itself).
  const rpcHosts = new Set();
  const walk = (abs) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(abs, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(json|md)$/.test(e.name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/\brpc\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/g)) rpcHosts.add(m[0]);
      }
    }
  };
  walk(join(REPO, "examples"));

  for (const [name, v] of [["port", port], ["host", host], ["version", version], ["boundary code", banner], ["windowMs", windowMs]]) {
    assert.ok(v, `could not derive the live ${name} from packages/delivery — the freshness contract lost its anchor and refuses to guess`);
  }
  assert.ok(codes.size > 0, "no status codes derivable in packages/delivery/http.js");
  assert.ok(rpcHosts.size > 0, "no RPC hosts derivable from the committed fixtures — refusing to derive an empty allow-set");

  return { port, host, codes: [...codes], version, banner, windowMs, homepageHost: new URL(pkg.homepage).host, pagesHost, rpcHosts: [...rpcHosts] };
}

const LIVE = deriveLive();

/** Tokens that merely LOOK like hostnames (language/API surface), pinned as a
 *  set so a real new host can never hide behind them ([C32]). */
const LOOKALIKE_HOSTS = new Set([
  "console.log", "process.env", "process.stdout.write", "server.address",
  "res.json", "res.status", "report.status", "report.decision",
  "evaluations.length", "e.g", "peoplescourt.ai",
]);

/** Non-derivable infra host SUFFIXES allowed in ARTIFACTS, pinned as a set
 *  ([C32]): an exact host or any subdomain (networking.k8s.io under k8s.io).
 *  A new registry or API-group suffix must join here consciously. */
const ARTIFACT_INFRA_SUFFIXES = ["ghcr.io", "k8s.io", "github.com"];
const isInfraHost = (h, extra = []) =>
  [...ARTIFACT_INFRA_SUFFIXES, ...extra].some((s) => h === s || h.endsWith("." + s));

/** Artifact plumbing ports pinned as a set ([C32]); everything else must be
 *  the live app port. */
const ARTIFACT_INFRA_PORTS = new Set(["443", "8443"]);

/** Non-comment lines of an artifact (comments may say anything). */
function stripped(text) {
  return text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
}

/** A dotted token is a DNS name only if its last label is not a file
 *  extension (verify-fixture.mjs is a file; rpc.coredao.org is a host). */
function isDnsLike(token) {
  const last = token.split(".").pop();
  return !FILE_EXT.has(last);
}

function checkHostToken(h, path, push, allowed) {
  if (LOOKALIKE_HOSTS.has(h)) return;
  if (allowed) return;
  push(path, `stale DNS marker "${h}" — not derivable from the live code (repo ${LIVE.homepageHost}/${LIVE.pagesHost}, rpc: ${LIVE.rpcHosts.join(", ")})`);
}

/**
 * The checker: violations ([] = clean), pure over (docText, artifactTexts)
 * so the battery below bites on mutated strings, not on the repo.
 */
function check(docText, artifactTexts) {
  const v = [];
  const push = (path, msg) => v.push(`${path}: ${msg}`);
  const lines = docText.split("\n");

  // ---- the boundary doc (prose) -------------------------------------------

  // The edge's 8443 may be mentioned only while the container posture exists
  // (its home is guarded by container-posture-contract).
  if (docText.includes("8443") && !docText.includes("### Running in containers")) {
    push(DOC, 'port marker "8443" with no container-posture section — the edge port drifted out of the doc');
  }

  // Loopback SOCKET strings: the doc's curl/proxy examples must target the
  // port the live code still offers.
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(/(?:127\.0\.0\.1|localhost):(\d{4,5})/g)) {
      if (m[1] !== LIVE.port) {
        push(DOC, `line ${i + 1}: stale loopback port "${m[1]}" — the live code offers ${LIVE.port} on ${LIVE.host} (packages/delivery/http.js)`);
      }
    }
    for (const m of line.matchAll(/\bport:\s*(\d{4,5})\b/g)) {
      if (m[1] !== LIVE.port) {
        push(DOC, `line ${i + 1}: stale start-line port "${m[1]}" — the live default is ${LIVE.port}`);
      }
    }
    for (const m of line.matchAll(/\bon :(\d{4,5})\b/g)) {
      if (m[1] !== LIVE.port) {
        push(DOC, `line ${i + 1}: stale ":${m[1]}" banner in a start line — the live default is ${LIVE.port}`);
      }
    }
  }

  // Loopback HOSTS: exact live spelling only.
  for (const m of docText.matchAll(/\b127\.0\.0\.\d+\b/g)) {
    if (m[0] !== LIVE.host) {
      push(DOC, `stale loopback address "${m[0]}" — the live default host is ${LIVE.host} (packages/delivery/http.js)`);
    }
  }

  // The public-bind marker may only appear in a warn context.
  for (const [i, line] of lines.entries()) {
    if (/\b0\.0\.0\.0\b/.test(line) && !/(never|bind )/i.test(line)) {
      push(DOC, `line ${i + 1}: 0.0.0.0 appears without a never/warn context — a positive public-bind mention is the one thing this posture refuses`);
    }
  }

  // DNS hosts: full dotted chains, minus file tokens, minus the derived
  // allow-set (repo host, Pages host, fixture-derived RPC hosts, lookalikes).
  for (const m of docText.matchAll(/\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]+)+\b/g)) {
    const h = m[0];
    if (!isDnsLike(h)) continue;
    const allowed = h === LIVE.homepageHost || h === LIVE.pagesHost || LIVE.rpcHosts.includes(h) || isInfraHost(h);
    checkHostToken(h, DOC, push, allowed);
  }

  // Protocol version: every DDE/N marker must equal the live DDE_VERSION.
  for (const m of docText.matchAll(/\bDDE\/(\d+)\b/g)) {
    if (`DDE/${m[1]}` !== LIVE.version) {
      push(DOC, `stale protocol marker "DDE/${m[1]}" — the live engine is ${LIVE.version} (packages/delivery/index.js); bump the doc consciously`);
    }
  }
  if (docText.includes("CGEP/") && !docText.includes("CGEP/1")) {
    push(DOC, 'a "CGEP/" protocol marker drifted from CGEP/1');
  }

  // Boundary headers: a line citing x-dde-* must cite the LIVE values.
  for (const [i, line] of lines.entries()) {
    if (line.includes("x-dde-version") && !line.includes(LIVE.version)) {
      push(DOC, `line ${i + 1}: x-dde-version marker without the live ${LIVE.version}`);
    }
    if (line.includes("x-dde-boundary") && !line.includes(LIVE.banner)) {
      push(DOC, `line ${i + 1}: x-dde-boundary marker without the live banner code "${LIVE.banner}" (packages/delivery/index.js)`);
    }
  }

  // Wire status codes: the doc's backticked 2xx/4xx tokens are the machine's
  // promise (the status table states every one of them backticked).
  for (const m of docText.matchAll(/`(\d{3})`/g)) {
    if (!LIVE.codes.includes(m[1])) {
      push(DOC, `stale wire code "${m[1]}" — the handler emits only {${LIVE.codes.join(", ")}} (send() sites in packages/delivery/http.js)`);
    }
  }

  // Rate-limit window: a retyped windowMs must equal the live default.
  for (const m of docText.matchAll(/windowMs:\s*([0-9_]+)/g)) {
    if (Number(m[1].replaceAll("_", "")) !== Number(LIVE.windowMs.replaceAll("_", ""))) {
      push(DOC, `stale rate-limit window "${m[1]}" — RATE_LIMIT_DEFAULTS.windowMs is ${LIVE.windowMs}`);
    }
  }

  // ---- deploy artifacts (comments stripped) -------------------------------
  for (const [path, text] of artifactTexts) {
    const body = stripped(text);

    for (const m of body.matchAll(/\b[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]+)+\b/g)) {
      const h = m[0];
      if (!isDnsLike(h)) continue;
      const allowed = h === LIVE.homepageHost || h === LIVE.pagesHost || LIVE.rpcHosts.includes(h) || isInfraHost(h);
      checkHostToken(h, path, push, allowed);
    }

    for (const m of body.matchAll(/\b(?:containerPort|port|listen)\s*:\s*(\d{2,5})\b/g)) {
      if (!ARTIFACT_INFRA_PORTS.has(m[1]) && m[1] !== LIVE.port) {
        push(path, `stale port "${m[1]}" in configuration — neither the live ${LIVE.port} nor pinned infra (${[...ARTIFACT_INFRA_PORTS].join(", ")}); extend ARTIFACT_INFRA_PORTS consciously if it is real`);
      }
    }
    for (const m of body.matchAll(/\bproxy_pass\s+http:\/\/127\.0\.0\.1:(\d{2,5})/g)) {
      if (m[1] !== LIVE.port) {
        push(path, `stale upstream "${m[1]}" in proxy_pass — the live app port is ${LIVE.port}`);
      }
    }

    for (const m of body.matchAll(/\bDDE\/(\d+)\b/g)) {
      if (`DDE/${m[1]}` !== LIVE.version) {
        push(path, `stale protocol marker "DDE/${m[1]}" — the live engine is ${LIVE.version}`);
      }
    }
    for (const m of body.matchAll(/\b127\.0\.0\.\d+\b/g)) {
      if (m[0] !== LIVE.host) {
        push(path, `stale loopback address "${m[0]}" — the live default host is ${LIVE.host}`);
      }
    }
  }

  return v;
}

test("doc + deploy artifacts: every trust marker matches the live code", () => {
  const artifacts = ARTIFACTS.map((p) => [p, read(p)]);
  const violations = check(read(DOC), artifacts);
  assert.deepEqual(violations, [], "doc/deploy freshness drift:\n  " + violations.join("\n  "));
});

// ---------------------------------------------------------------------------
// Negative controls — mutated strings, "applied" asserted separately from
// "bit" ([C32]): a control whose mutation never landed proves nothing.
// ---------------------------------------------------------------------------

function mutated(base, replacements) {
  let s = base;
  for (const [from, to] of replacements) {
    if (!s.includes(from)) return { applied: false, out: null };
    s = s.replaceAll(from, to);
  }
  return { applied: true, out: s };
}

test("doc-freshness negative controls: each staleness mutation applies AND bites, by name", () => {
  const doc = read(DOC);
  const nginx = read("deploy/nginx.conf");
  const pod = read("deploy/k8s/dde-pod.yaml");

  const cases = [
    {
      label: "doc keeps the dead app port",
      doc: [[`http://127.0.0.1:${LIVE.port}`, "http://127.0.0.1:8788"]],
      expect: /stale loopback port "8788"/,
    },
    {
      label: "doc retypes the loopback address",
      doc: [["127.0.0.1", "127.0.0.9"]],
      expect: /stale loopback address "127\.0\.0\.9"/,
    },
    {
      label: "doc promotes a major protocol bump",
      doc: [["DDE/1", "DDE/2"]],
      expect: /stale protocol marker "DDE\/2"/,
    },
    {
      label: "header example cites an old version",
      doc: [["x-dde-version: DDE/1", "x-dde-version: DDE/9"]],
      expect: new RegExp(`x-dde-version marker without the live ${LIVE.version}`),
    },
    {
      label: "wire table keeps a retired code",
      doc: [["`422`", "`421`"]],
      expect: /stale wire code "421"/,
    },
    {
      label: "a positive public-bind mention sneaks in",
      doc: [["bind `0.0.0.0` inside the pod", "safely expose 0.0.0.0 to the cluster"]],
      expect: /0\.0\.0\.0 appears without a never\/warn context/,
    },
    {
      label: "an RPC example host rots",
      doc: [["rpc.coredao.org", "rpc.coredao.example"]],
      expect: /stale DNS marker "rpc\.coredao\.example"/,
    },
    {
      label: "the Pages deep links move off-org",
      doc: [[`${LIVE.pagesHost}/coreguard`, "legacy-pages.github.io/old"]],
      expect: /stale DNS marker "legacy-pages\.github\.io"/,
    },
    {
      label: "the pod's start line drifts from the live port",
      pod: [["port: 8787, allowAddresses", "port: 9999, allowAddresses"]],
      expect: /stale port "9999" in configuration/,
    },
    {
      label: "nginx's upstream moves off the live port",
      nginx: [[`proxy_pass http://127.0.0.1:${LIVE.port};`, "proxy_pass http://127.0.0.1:9999;"]],
      expect: /stale upstream "9999" in proxy_pass/,
    },
    {
      label: "the backstop window is retyped",
      doc: [["windowMs: 60000, max: 600", "windowMs: 30000, max: 600"]],
      expect: /stale rate-limit window "30000"/,
    },
  ];

  let applied = 0;
  for (const c of cases) {
    let docOut = doc, nginxOut = nginx, podOut = pod;
    if (c.doc) {
      const m = mutated(doc, c.doc);
      if (!m.applied) continue;
      docOut = m.out;
      applied++;
    }
    if (c.nginx) {
      const m = mutated(nginx, c.nginx);
      if (!m.applied) continue;
      nginxOut = m.out;
      applied++;
    }
    if (c.pod) {
      const m = mutated(pod, c.pod);
      if (!m.applied) continue;
      podOut = m.out;
      applied++;
    }
    const violations = check(docOut, [["deploy/nginx.conf", nginxOut], ["deploy/k8s/dde-pod.yaml", podOut]]);
    assert.ok(
      violations.length > 0,
      `negative control did not bite: "${c.label}" — the freshness checker stayed green over stale markers`,
    );
    assert.match(
      violations.join("\n"),
      c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`,
    );
  }
  assert.ok(applied >= 11, `expected all freshness controls to apply, only ${applied} did — the battery is not testing what it thinks`);
});
