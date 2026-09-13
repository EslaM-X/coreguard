/**
 * CoreGuard EVM signer adapter — raw byte helpers (zero-decision utilities).
 *
 * Purely structural; no crypto. Exists so the crypto modules in this package
 * never duplicate byte/conversion logic.
 */

export function hexToBytes(hex) {
  if (hex instanceof Uint8Array) return hex;
  if (Buffer.isBuffer(hex)) return Uint8Array.from(hex);
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}

export function asBytes(u) {
  return u instanceof Uint8Array ? u : hexToBytes(u);
}

export function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function bytesToHex(u) {
  return Buffer.from(u).toString("hex");
}