import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Container-posture contract — the reference Docker/k8s artifacts cannot
 * drift from the doc (and the doc cannot drift from them), and the pod's
 * start line cannot drift from the APP's own defaults.
 *
 * deploy/k8s/dde-pod.yaml + deploy/k8s/dde-netpol.yaml are the READY-TO-USE
 * artifacts of the documented container posture ("Running in containers" in
 * docs/delivery-dispute-boundary.md). Structural only — no kubectl, no
 * container runtime ([C17]: no test may depend on a tool the dev box may not
 * have). Bound directions:
 *
 *   1. doc → artifacts : the doc's container section must keep naming both
 *      artifacts and this contract, and state the pinned semantics.
 *   2. pod rules      : the app container declares NO port; every probe is
 *      an httpGet on /health (the one endpoint a probe may know); the start
 *      line keeps the loopback/allowlist/backstop shape and never binds
 *      0.0.0.0; the edge is the only declared port.
 *   3. netpol rules   : deny-by-default shape — policyTypes Ingress and
 *      NEVER Egress, no egress section, exactly the edge's 8443, selecting
 *      the pod it guards.
 *   4. app → pod      : the pod's start line binds the port and loopback
 *      host read LIVE from packages/delivery/http.js (never retyped).
 *
 * Negative controls are applied to TMP COPIES inside this file (the
 * nginx-conf pattern): each mutation must apply AND bite, by name —
 * "mutation applied" is asserted separately from "bit" ([C32]).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const POD = join(REPO, "deploy", "k8s", "dde-pod.yaml");
const NETPOL = join(REPO, "deploy", "k8s", "dde-netpol.yaml");
const DOC = join(REPO, "docs", "delivery-dispute-boundary.md");
const APP = join(REPO, "packages", "delivery", "http.js");
const CONTRACT = "test/ci/container-posture-contract.test.js";
const EDGE_PORT = "8443"; // the documented edge's 443, inside the pod network

const read = (p) => readFileSync(p, "utf8").replaceAll("\r\n", "\n");

/** The text of one container entry (from its `- name:` to the next). */
function containerBlock(podText, name) {
  const start = podText.indexOf(`- name: ${name}`);
  if (start < 0) return null;
  const next = podText.indexOf("\n    - name:", start + 1);
  return podText.slice(start, next < 0 ? podText.length : next);
}

/** The value string of `env[]` entry `<name>` (raw, quotes still escaped). */
function envValue(podText, name) {
  const m = podText.match(new RegExp(`name: ${name}\\n\\s+value: "((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1] : null;
}

/** The doc's container section (from its heading to the next ## section). */
function docSection(docText) {
  const start = docText.indexOf("### Running in containers");
  if (start < 0) return null;
  const end = docText.indexOf("\n## ", start);
  return docText.slice(start, end < 0 ? docText.length : end);
}

/**
 * The checker: returns violations ([] = clean). Pure over the four texts so
 * the mutation battery below can bite on tmp copies.
 */
function check(podText, netpolText, docText, appText) {
  const violations = [];

  // Signing: both artifacts must carry the pointer to this contract file.
  for (const [label, text] of [["deploy/k8s/dde-pod.yaml", podText], ["deploy/k8s/dde-netpol.yaml", netpolText]]) {
    if (!text.includes(CONTRACT)) {
      violations.push(`${label} lost its contract pointer (${CONTRACT}) — the artifact no longer names its own guard`);
    }
  }

  // Doc side of the binding: the section must exist and keep naming its
  // artifacts, the contract, and the pinned semantics.
  const section = docSection(docText);
  if (!section) {
    violations.push("the boundary doc's container posture section is missing (### Running in containers …) — the k8s artifacts outlived their contract");
  } else {
    for (const must of ["deploy/k8s/dde-pod.yaml", "deploy/k8s/dde-netpol.yaml", CONTRACT, "/health", "NetworkPolicy", "8443"]) {
      if (!section.includes(must)) {
        violations.push(`the doc's container posture section lost a pinned reference: "${must}"`);
      }
    }
  }

  // ---- pod rules -----------------------------------------------------------
  const appBlock = containerBlock(podText, "dde-delivery");
  if (!appBlock) {
    violations.push('deploy/k8s/dde-pod.yaml lost the app container "dde-delivery"');
  } else {
    // Rule 1: the app container declares NO port — the loopback bind is the
    // guard, and a declared port is the misexposed port the posture contains.
    const appPorts = [...appBlock.matchAll(/containerPort:\s*(\d+)/g)].map((m) => m[1]);
    if (appPorts.length > 0) {
      violations.push(`the app container declares a port (containerPort ${appPorts.join(", ")}) — the app has no reachable port in the container posture`);
    }

    // Rule 3 + 4: the start line keeps the loopback/allowlist/backstop shape.
    const start = envValue(podText, "DDE_START");
    if (!start) {
      violations.push("the pod lost its documented start line (env DDE_START) — the container posture's app anchor is gone");
    } else {
      if (!start.includes("startDeliveryEndpoint")) {
        violations.push('the pod\'s start line no longer calls startDeliveryEndpoint — it is not the documented posture');
      }
      if (!start.includes("allowAddresses: ['127.0.0.1']")) {
        violations.push("the pod's start line lost allowAddresses — the loopback start line is a pinned semantic of the container posture");
      }
      if (!start.includes("rateLimit: { windowMs: 60000, max: 600 }")) {
        violations.push("the pod's start line lost the backstop rateLimit — the in-process limiter is the last line of defense");
      }
      if (/0\.0\.0\.0/.test(start)) {
        violations.push("the container start line must never bind 0.0.0.0 — the pod's loopback is the posture; \"the Service only exposes the proxy\" is not a defense");
      }
    }
  }

  // Rule 2: every probe is an httpGet on /health (at least readiness +
  // liveness) — a probe on any other path makes the platform itself a
  // rate-consuming client on a guarded endpoint.
  const probePaths = [...podText.matchAll(/\n\s+path:\s*(\S+)/g)].map((m) => m[1]);
  if (probePaths.length < 2) {
    violations.push(`the pod declares fewer than two probes (found ${probePaths.length}) — readiness and liveness must both ride the edge's /health`);
  }
  for (const p of probePaths) {
    if (p !== "/health") {
      violations.push(`probe path "${p}" is not /health — /health is the one endpoint a probe may know (limiter-exempt; the others are guarded clients)`);
    }
  }

  // The edge is the only declared port in the pod, and it is the documented one.
  const allPorts = [...podText.matchAll(/containerPort:\s*(\d+)/g)].map((m) => m[1]);
  for (const p of allPorts) {
    if (p !== EDGE_PORT) {
      violations.push(`a declared pod port is not the edge's ${EDGE_PORT}: "${p}" — the edge is the only door`);
    }
  }
  const edgeBlock = containerBlock(podText, "edge");
  if (!edgeBlock || !edgeBlock.includes(`containerPort: ${EDGE_PORT}`)) {
    violations.push(`the edge sidecar does not declare containerPort ${EDGE_PORT} — the pod's only door is gone`);
  }

  // ---- netpol rules --------------------------------------------------------
  // Rule 4: deny-by-default shape. Ingress only — never Egress, and no
  // egress section at all ("in case" is the hole this file refuses).
  if (!netpolText.includes("- Ingress")) {
    violations.push("the NetworkPolicy must request Ingress in policyTypes — an empty-ingress allowlist is the deny-by-default posture");
  }
  if (netpolText.includes("- Egress")) {
    violations.push("the NetworkPolicy must not request Egress — the endpoint verifies nothing on chain; an egress grant is the hole the policy refuses");
  }
  if (/^\s+egress:/m.test(netpolText)) {
    violations.push("the reference NetworkPolicy carries an egress section — the reference posture is ingress-only, by rule");
  }
  if (!netpolText.includes("namespaceSelector")) {
    violations.push("the NetworkPolicy lost its namespaceSelector — nothing would be admitted and the deny-by-default silence becomes the whole answer");
  }
  const npPorts = [...netpolText.matchAll(/\n\s+port:\s*(\d+)/g)].map((m) => m[1]);
  if (npPorts.length === 0) {
    violations.push("the NetworkPolicy admits no port — state the edge's 8443 or the artifact is not an allowlist");
  }
  for (const p of npPorts) {
    if (p !== EDGE_PORT) {
      violations.push(`every NetworkPolicy ingress port must be ${EDGE_PORT} (the documented edge's 443), found "${p}"`);
    }
  }

  // The policy must select the pod it guards (cross-file coupling).
  const podApp = podText.match(/labels:\s*\n\s+app:\s*(\S+)/)?.[1];
  const selApp = netpolText.match(/podSelector:\s*\n\s*matchLabels:\s*\n\s+app:\s*(\S+)/)?.[1];
  if (!podApp || !selApp) {
    violations.push("pod labels / netpol podSelector are unreadable — the cross-file coupling cannot be verified");
  } else if (podApp !== selApp) {
    violations.push(`netpol podSelector "${selApp}" does not select the pod's label "${podApp}" — the policy guards nothing`);
  }

  // ---- app → pod, live constants -------------------------------------------
  const port = appText.match(/startDeliveryEndpoint\(\{\s*port\s*=\s*(\d+)/)?.[1];
  const host = appText.match(/host\s*=\s*"([^"]+)"/)?.[1];
  const start2 = envValue(podText, "DDE_START") || "";
  if (port && !start2.includes(`port: ${port}`)) {
    violations.push(`the pod's start line does not bind the app's live default port (${port}) — the artifact drifted from packages/delivery/http.js`);
  }
  if (host && !start2.includes(`allowAddresses: ['${host}']`)) {
    violations.push(`the pod's start line does not pin the app's default loopback host (${host}) in allowAddresses — the artifact drifted from packages/delivery/http.js`);
  }

  return violations;
}

test("container posture: pod + netpol match the doc's section and the app's live constants", () => {
  const violations = check(read(POD), read(NETPOL), read(DOC), read(APP));
  assert.deepEqual(violations, [], "container posture drifted:\n  " + violations.join("\n  "));
});

// ---------------------------------------------------------------------------
// Negative controls — tmp copies, "applied" asserted separately from "bit".
// ---------------------------------------------------------------------------

function mutated(base, replacements) {
  let s = base;
  for (const [from, to] of replacements) {
    if (!s.includes(from)) return { applied: false, out: null };
    s = s.replaceAll(from, to);
  }
  return { applied: true, out: s };
}

test("container posture negative controls: each mutation applies AND bites, by name", () => {
  const pod = read(POD);
  const netpol = read(NETPOL);
  const doc = read(DOC);
  const app = read(APP);
  const tmp = mkdtempSync(join(tmpdir(), "container-nc-"));

  const cases = [
    {
      label: "declare a port on the app container",
      pod: [["        - name: DDE_EDGE_PORT\n          value: \"8443\"", "      ports:\n        - containerPort: 8787\n        - name: DDE_EDGE_PORT\n          value: \"8443\""]],
      expect: /app container declares a port/,
    },
    {
      label: "point a probe at /verify",
      pod: [["          path: /health", "          path: /verify"]],
      expect: /probe path "\/verify" is not \/health/,
    },
    {
      label: "drop the allowlist from the start line",
      pod: [[", allowAddresses: ['127.0.0.1']", ""]],
      expect: /start line lost allowAddresses/,
    },
    {
      label: "bind 0.0.0.0 inside the pod",
      pod: [["port: 8787, allowAddresses", "port: 8787, host: '0.0.0.0', allowAddresses"]],
      expect: /must never bind 0\.0\.0\.0/,
    },
    {
      label: "lose the contract pointer from the pod header",
      pod: [[CONTRACT, "removed"]],
      expect: /lost its contract pointer/,
    },
    {
      label: "request Egress beside Ingress",
      netpol: [["    - Ingress", "    - Ingress\n    - Egress"]],
      expect: /must not request Egress/,
    },
    {
      label: "move the admitted port off the edge's",
      netpol: [["          port: 8443", "          port: 9000"]],
      expect: /must be 8443/,
    },
    {
      label: "smuggle an egress section into the policy",
      netpol: [["  ingress:", "  ingress:\n  egress:\n    - {}"]],
      expect: /carries an egress section/,
    },
    {
      label: "select a different pod with the policy",
      netpol: [["      app: dde-edge", "      app: dde-other"]],
      expect: /does not select the pod's label/,
    },
    {
      label: "delete the doc's container section",
      doc: [["### Running in containers", "### Removed"]],
      expect: /container posture section is missing/,
    },
  ];

  let applied = 0;
  for (const c of cases) {
    let podOut = pod, netpolOut = netpol, docOut = doc;
    if (c.pod) {
      const m = mutated(pod, c.pod);
      if (!m.applied) continue;
      podOut = m.out;
      applied++;
    }
    if (c.netpol) {
      const m = mutated(netpol, c.netpol);
      if (!m.applied) continue;
      netpolOut = m.out;
      applied++;
    }
    if (c.doc) {
      const m = mutated(doc, c.doc);
      if (!m.applied) continue;
      docOut = m.out;
      applied++;
    }
    const violations = check(podOut, netpolOut, docOut, app);
    assert.ok(
      violations.length > 0,
      `negative control did not bite: "${c.label}" — the checker stayed green over a corrupted triple`,
    );
    assert.match(
      violations.join("\n"),
      c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`,
    );
  }
  assert.ok(applied >= 8, `expected all container negative controls to apply, only ${applied} did — the battery is not testing what it thinks`);
  rmOnExit(tmp);
});

/** Late cleanup so failures above still leave no droppings in tmp. */
function rmOnExit(dir) {
  process.on("exit", () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
  });
}
