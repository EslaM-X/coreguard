/**
 * Pilot-1 command dispatcher.
 *
 *   plan                 declare intent + WS-1 authorization (never broadcasts)
 *   staged               plan + genuine eth_call preflight + signed-tx stage
 *   capture --tx <hash>  bind + verify a real Mainnet execution read-only
 *   failclosed           deterministic offline rejections (no funds needed)
 *   gate [--json]        readiness matrix
 *   broadcast            GATED: only with funded EOA + stage.json +
 *                        CG_PILOT_ALLOW_BROADCAST=1 + --confirm x2  (default: never)
 *
 * BROADCAST POLICY: this tool does not broadcast unless every gate passes AND
 * the operator explicitly confirms twice AND the environment guard is set.
 * The shipped, default state is STAGED-NOT-SENT.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { plan } from "./plan.mjs";
import { capture } from "./capture.mjs";
import { failclosed } from "./failclosed.mjs";
import { stageExecution } from "./stage.mjs";
import { runPreflight } from "./preflight.mjs";
import { agentFromEnv } from "./agent-key.mjs";
import { resolveScenario } from "./scenario.mjs";
import { chainIdHex, readBalance, readNonce, mainnetProvider, mainnetRpcUrl } from "./provider.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(here, "artifacts");
const json = (v) => JSON.stringify(v, null, 2);

async function writeArtifacts(name, value) {
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(resolve(ARTIFACTS, name), json(value));
}

async function readArtifacts(name) {
  return JSON.parse(await readFile(resolve(ARTIFACTS, name), "utf8"));
}

async function fetchRpc(method, params) {
  const url = await mainnetRpcUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
  return body.result;
}

async function gasPriceHex() {
  return await fetchRpc("eth_gasPrice", []);
}

async function readReadiness() {
  const agent = agentFromEnv();
  const chainHex = await chainIdHex();
  const chainId = parseInt(chainHex, 16);
  const nonce = await readNonce(agent.address);
  const balance = await readBalance(agent.address);
  const scenario = resolveScenario(agent.address);
  const value = BigInt(scenario.executionEnvelope.value);
  const gp = BigInt(await gasPriceHex());
  const gasCost = 21000n * gp;
  const required = value + gasCost;
  return {
    chainId,
    mainnet: chainId === 1116,
    agent: agent.address,
    nonce: nonce.toString(),
    balanceWei: balance.toString(),
    valueWei: value.toString(),
    gasPrice: gp.toString(),
    requiredWei: required.toString(),
    funded: balance >= required,
    defaultRecipient: scenario.executionEnvelope.to,
    policyRules: scenario.policy.rules.map((r) => r.ruleId),
  };
}

export async function run(command, args) {
  if (command === "gate") {
    const r = await readReadiness();
    const report = {
      readiness: r.mainnet ? (r.funded ? "READY-TO-BROADCAST" : "BLOCKED") : "NOT-MAINNET",
      ...r,
      broadcastPolicy: "explicit GO + CG_PILOT_ALLOW_BROADCAST=1 + --confirm x2 required; default NEVER broadcasts",
    };
    if (args.json) process.stdout.write(json(report) + "\n");
    else {
      const line = (k, v) => console.log(`${k.padEnd(20)} ${v}`);
      line("chain", `${r.chainId} (${r.mainnet ? "core-mainnet" : "NOT MAINNET — pilot refuses"})`);
      line("agent", r.agent);
      line("nonce", r.nonce);
      line("balance wei", r.balanceWei);
      line("required wei", r.requiredWei);
      line("funded", r.funded ? "YES" : "NO — awaiting Core Mainnet funding");
      line("readiness", report.readiness);
    }
    return report;
  }

  if (command === "plan") {
    const p = await plan({ outDir: "artifacts" });
    console.log(`plan OK: intentRef=${p.intentRef}`);
    console.log(`   manifestId=${p.manifestId}`);
    console.log(`   gates: mainnet=${p.gates.mainnetRpc.ok} funding=${p.gates.funding.ok} ws1=${p.gates.ws1Authorization.ok}`);
    console.log(`   state: ${p.staged.kind} (never broadcast by plan)`);
    return p;
  }

  if (command === "staged") {
    const p = await plan({ outDir: "artifacts" });
    const agent = agentFromEnv();
    const scenario = resolveScenario(agent.address);
    const chainHex = await chainIdHex();
    const chainId = parseInt(chainHex, 16);
    if (chainId !== 1116) throw new Error("Pilot-1 gate: staged requires chainId 1116.");
    const nonce = await readNonce(agent.address);
    const balance = await readBalance(agent.address);
    const gasPrice = BigInt(await gasPriceHex());
    const gasLimit = 21000n;
    const preflight = await runPreflight({
      provider: mainnetProvider,
      from: agent.address,
      to: scenario.executionEnvelope.to,
      value: scenario.executionEnvelope.value,
      data: "0x",
      gasPrice: "0x" + gasPrice.toString(16),
      gasLimit,
    });

    const payload = {
      plan: p,
      preflight: { ...preflight, at: "genuine eth_call replay at pinned pre-execution block" },
      broadcast: {
        state: "STAGED",
        sent: false,
        blockReason: !preflight.result.ok
          ? `PREFLIGHT REJECTED at pinned block: ${preflight.result.reason}`
          : balance >= BigInt(scenario.executionEnvelope.value) + gasLimit * gasPrice
            ? null
            : "UNFUNDED — awaiting Core Mainnet CORE funding + owner GO",
      },
      gates: {
        mainnet: chainId === 1116,
        funded: preflight.result.ok && balance >= BigInt(scenario.executionEnvelope.value) + gasLimit * gasPrice,
        preflight: preflight.result,
        balanceWei: balance.toString(),
        requiredWei: (BigInt(scenario.executionEnvelope.value) + gasLimit * gasPrice).toString(),
        signedTx: "not generated while unfunded or preflight-rejected",
      },
      notice: "STAGED-NOT-SENT. Broadcast requires explicit GO + CG_PILOT_ALLOW_BROADCAST=1 + double confirmation.",
    };

    if (payload.gates.funded) {
      const st = await stageExecution({
        scenario,
        agent,
        nonce: nonce.toString(),
        gasPrice: gasPrice.toString(),
        gasLimit: gasLimit.toString(),
        balance,
        preflight,
      });
      payload.gates.signedTx = st.tx.rawHex;
      payload.tx = st.tx;
    }

    await writeArtifacts("stage.json", payload);
    console.log(`staged: ${payload.broadcast.state} (${payload.broadcast.blockReason || "funded, signed, not sent"})`);
    return payload;
  }

  if (command === "capture") {
    const i = args.findIndex((a) => a === "--tx");
    if (i < 0 || !args[i + 1]) throw new Error("capture requires --tx <hash>");
    const cap = await capture({ txHash: args[i + 1] });
    console.log(`capture: status=${cap.status}`);
    console.log(`   ws1=${cap.authorization.status} (${cap.authorization.label})`);
    console.log(`   ws4-bind=${cap.ws4.binding.status} (${cap.ws4.binding.label})`);
    console.log(`   policy=${cap.policy.result}`);
    if (cap.legacyL1.present) {
      console.log(`   legacy-L1=${cap.legacyL1.result} (${cap.legacyL1.verdictCode}) receiptId=${cap.legacyL1.receiptId}`);
    } else {
      console.log(`   legacy-L1=NONE ${cap.legacyL1.reason}`);
    }
    console.log(`   attestation=${cap.attestation.integrity.status} ref=${cap.attestation.attestationRef}`);
    return cap;
  }

  if (command === "failclosed") {
    const r = await failclosed();
    for (const d of r.results) {
      console.log(`${d.ok ? "PASS" : "FAIL"} ${d.demo}  expected=${d.expected} observed=${d.observed}`);
      console.log(`          ${d.detail}`);
    }
    console.log(r.ok ? "ALL FAIL-CLOSED DEMOS PASS" : "ONE OR MORE DEMOS FAILED");
    return r;
  }

  if (command === "broadcast") {
    if (!existsSync(resolve(ARTIFACTS, "stage.json"))) throw new Error("broadcast: stage.json missing — run `staged` first.");
    const stage = await readArtifacts("stage.json");
    if (stage.broadcast && stage.broadcast.sent) throw new Error("broadcast: already sent this stage — refusing to double-broadcast.");
    if (process.env.CG_PILOT_ALLOW_BROADCAST !== "1") {
      throw new Error("broadcast: env guard — set CG_PILOT_ALLOW_BROADCAST=1 to enable. Default is NEVER broadcast.");
    }
    const chainHex = await chainIdHex();
    const chainId = parseInt(chainHex, 16);
    if (chainId !== 1116) throw new Error(`broadcast: chain ${chainId} from RPC != 1116 — refusing.`);
    const agent = agentFromEnv();
    const stageAgent = stage.gates?.agent ?? (stage.tx ? stage.tx.from : null);
    if (stageAgent && String(stageAgent).toLowerCase() !== agent.address) throw new Error("broadcast: staged from != current agent — refusing.");
    if (!stage.tx || !stage.tx.rawHex) throw new Error("broadcast: no signed tx in stage (unfunded at staging) — fund the EOA and re-run `staged`.");
    if (args.filter((a) => a === "--confirm").length < 2) {
      throw new Error("broadcast: require --confirm --confirm (operator double-confirmation, explicit GO). No default broadcast.");
    }
    const balance = await readBalance(agent.address);
    if (balance >= BigInt(stage.tx.value) + BigInt(stage.tx.gasLimit) * BigInt(stage.tx.gasPrice)) {
      // balance gate ok
    } else {
      throw new Error(`broadcast: UNFUNDED now (balance=${balance.toString()} wei) — refusing to send.`);
    }

    const txHash = await fetchRpc("eth_sendRawTransaction", [stage.tx.rawHex]);
    const receipt = await waitReceipt(txHash);
    const broadcast = {
      txHash,
      receipt: receipt ? { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: receipt.status } : null,
      sentAt: receipt ? receipt.blockHash : null,
      stage: { preflight: stage.preflight, gates: stage.gates },
    };
    await writeArtifacts("broadcast.json", broadcast);
    stage.broadcast = { state: "SENT", sent: true, txHash };
    await writeArtifacts("stage.json", stage);
    console.log(`broadcast: ${txHash}`);
    console.log("   NEXT: run `coreguard-pilot capture --tx <txHash>` to bind + verify read-only.");
    return broadcast;
  }

  throw new Error(`unknown command: ${command}`);
}

async function waitReceipt(txHash, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const r = await fetchRpc("eth_getTransactionReceipt", [txHash]);
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 4000));
  }
  return null;
}

if (process.argv[2]) {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);
  run(cmd, rest).then(
    () => process.exit(0),
    (e) => {
      console.error(e.message);
      process.exit(1);
    }
  );
}

export default run;