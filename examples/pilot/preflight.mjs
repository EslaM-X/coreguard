/**
 * Pilot-1 GENUINE simulation preflight — eth_call replay at a pinned block.
 *
 * The legacy CGEP/1 receipt requires a `simulation` pin. We never fabricate
 * one: instead we run the agent's execution against the EVM's own eth_call at
 * an EXPLICITLY PINNED (not "latest") block, the block whose state is about to
 * be used. The resulting pin {blockNumber, blockHash, result} is genuine and
 * independently reproducible by anyone (reth-able, or simply re-calling eth_call
 * at that same block).
 *
 * Read-only RPC calls only. Nothing here can alter chain state.
 */

export async function runPreflight({ provider, from, to, value, data = "0x", gasPrice, gasLimit }) {
  const head = await provider.getBlockByNumber("latest", false);
  const numberHex = head.number.trim().toLowerCase().startsWith("0x")
    ? head.number
    : "0x" + BigInt(head.number).toString(16);
  const block = await provider.getBlockByNumber(numberHex, true);
  const pin = {
    blockNumber: BigInt(numberHex).toString(),
    blockHash: block.hash.toLowerCase(),
  };

  let result;
  try {
    const res = await provider.eth_call(
      { from, to, value: "0x" + BigInt(value).toString(16), data, gas: "0x" + BigInt(gasLimit).toString(16), gasPrice },
      numberHex
    );
    result = { ok: true, data: res };
  } catch (e) {
    // Record the genuine revert/error honestly — never swallowed, never faked.
    result = { ok: false, reason: String(e.message || e).replace(/^RPC eth_call:\s*/, "") };
  }

  return { pin, result, at: "pre-execution state block " + pin.blockNumber };
}