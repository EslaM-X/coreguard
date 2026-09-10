/**
 * CoreGuard Chain Adapter Interface
 *
 * Abstract interface for chain-specific data fetching.
 * Core Testnet2 is the primary adapter.
 */

/**
 * ChainAdapter interface
 *
 * All implementations must provide these methods.
 * Returns normalized data that the CoreGuard engine can process.
 */
export class ChainAdapter {
  /**
   * Fetch a transaction by hash
   * @param {string} hash - Transaction hash
   * @returns {Promise<{hash, from, to, value, input, blockNumber}>}
   */
  async getTransaction(hash) {
    throw new Error("Not implemented");
  }

  /**
   * Fetch a transaction receipt
   * @param {string} hash - Transaction hash
   * @returns {Promise<{blockHash, blockNumber, status, gasUsed, logs, contractAddress}>}
   */
  async getReceipt(hash) {
    throw new Error("Not implemented");
  }

  /**
   * Fetch a block by number
   * @param {number} number - Block number
   * @returns {Promise<{number, hash, timestamp, parentHash}>}
   */
  async getBlock(number) {
    throw new Error("Not implemented");
  }

  /**
   * Trace a transaction (debug_traceTransaction or similar)
   * @param {string} hash - Transaction hash
   * @returns {Promise<object>} - Call trace
   */
  async traceTransaction(hash) {
    throw new Error("Not implemented");
  }

  /**
   * Get account state at a specific block
   * @param {number} blockNumber - Block number
   * @param {string} address - Account address
   * @returns {Promise<{balance, code, storage}>}
   */
  async getState(blockNumber, address) {
    throw new Error("Not implemented");
  }

  /**
   * Get storage slot at a specific block
   * @param {number} blockNumber - Block number
   * @param {string} address - Contract address
   * @param {string} slot - Storage slot
   * @returns {Promise<string>}
   */
  async getStorage(blockNumber, address, slot) {
    throw new Error("Not implemented");
  }

  /**
   * Get chain ID
   * @returns {Promise<number>}
   */
  async getChainId() {
    throw new Error("Not implemented");
  }
}

/**
 * Core Testnet2 Adapter
 */
export class CoreTestnet2Adapter extends ChainAdapter {
  constructor(rpcUrl = "https://rpc.test2.btcs.network") {
    super();
    this.rpcUrl = rpcUrl;
  }

  async rpcCall(method, params = []) {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async getTransaction(hash) {
    return this.rpcCall("eth_getTransactionByHash", [hash]);
  }

  async getReceipt(hash) {
    return this.rpcCall("eth_getTransactionReceipt", [hash]);
  }

  async getBlock(number) {
    return this.rpcCall("eth_getBlockByNumber", [
      "0x" + number.toString(16),
      false,
    ]);
  }

  async traceTransaction(hash) {
    return this.rpcCall("debug_traceTransaction", [hash, { disableStorage: false, disableMemory: true }]);
  }

  async getState(blockNumber, address) {
    const balance = await this.rpcCall("eth_getBalance", [
      address,
      "0x" + blockNumber.toString(16),
    ]);
    const code = await this.rpcCall("eth_getCode", [
      address,
      "0x" + blockNumber.toString(16),
    ]);
    return { balance, code, storage: {} };
  }

  async getStorage(blockNumber, address, slot) {
    return this.rpcCall("eth_getStorageAt", [
      address,
      slot,
      "0x" + blockNumber.toString(16),
    ]);
  }

  async getChainId() {
    return this.rpcCall("eth_chainId");
  }
}
