/**
 * WS-2.2 — Selective Disclosure / Merkle Evidence Commitment (fail-closed).
 *
 * Pure, deterministic, substrate-free gate. Evidence = an ordered array of
 * disclosed field-bytes (the WS-3 recomputed evidence seam). We commit to the
 * full ordered set, but VERIFICATION needs only ONE disclosed field + a
 * canonical Merkle inclusion proof: the verifier RECOMPUTES the root from
 * (disclosed bytes + path) and requires BYTE-IDENTITY with the commitment.
 *
 * Fail-closed rules (identical to WS-6):
 *   valid inclusion proof   => VERIFIED   (recomputed root == committed root)
 *   wrong leaf/root/path    => INVALID    (never VERIFIED)
 *   missing disclosure      => NOT_PROVEN (fail-closed; never VERIFIED)
 *   the ROOT/commitment ALONE is NOT proof of execution (WS-2.2/6).
 *   no majority: a VERIFIED inclusion can never convert another INVALID one.
 *
 * Domain-separation of node vs leaf prevents hash-substitution (leaf-for-node
 * swap) — same byte-seam rigor as WS-3/WS-6.
 */
import { createHash } from "node:crypto";
const sha256 = (buf) => createHash("sha256").update(buf).digest();
const LEAF = 0x00, NODE = 0x01; // domain-separation prefixes (byte seam)
const hex = (buf) => Buffer.from(buf).toString("hex");
const bytes = (v) => Buffer.isBuffer(v) ? v : Buffer.from(String(v), "utf8");
const leafHash = (data) => sha256(Buffer.concat([Buffer.from([LEAF]), bytes(data)]));
const nodeHash = (l, r) => sha256(Buffer.concat([Buffer.from([NODE]), l, r]));

function layerUp(hashes) { // canonical even-fold: odd leaf duplicates its sibling
  const out = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const l = hashes[i];
    const r = i + 1 < hashes.length ? hashes[i+1] : hashes[i];
    out.push(nodeHash(l, r));
  }
  return out;
}

/** WS-2.2/0 — commit an ordered disclosure set => { root, hashes, levels }.
 * Empty set => { root: null } (NOT_PROVEN; fail-closed). */
export function sdcCommit(fields = []) {
  const arr = Array.isArray(fields) ? fields : [];
  if (arr.length === 0) return { root: null, hashes: [], levels: [] };
  let hashes = arr.map((f) => leafHash(f));
  const levels = [hashes.map(hex)];
  while (hashes.length > 1) { hashes = layerUp(hashes); levels.push(hashes.map(hex)); }
  return { root: hex(hashes[0]), hashes: levels[0], levels };
}

/** WS-2.2/0 — canonical inclusion path for ONE disclosed index >= 0.
 * Returns null when index/fields invalid (fail-closed). */
export function sdcProof(fields = [], index) {
  const arr = Array.isArray(fields) ? fields : [];
  if (arr.length === 0) return null;
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) return null;
  let hashes = arr.map((f) => leafHash(f));
  const proof = [];
  let i = index;
  while (hashes.length > 1) {
    const sib = (i % 2 === 0) ? (hashes[i+1] ?? hashes[i]) : hashes[i-1];
    proof.push(hex(sib));
    hashes = layerUp(hashes);
    i = (i - (i % 2)) / 2;
  }
  return { index, root: hex(hashes[0]), hashes: arr.map((f) => hex(leafHash(f))), proof };
}

/** WS-2.2 — FAIL-CLOSED inclusion verification. NEVER trusts caller roof;
 * recomputes root byte-for-byte from disclosed bytes + path and requires
 * byte-identity with the committed root. Returns a token-result only. */
export function sdcVerify(disclosed, { root, index, hashes, proof } = {}) {
  const bad = (token, labelEx, reason) => ({ token, label: labelEx, reason, ok: token === "VERIFIED" });
  if (disclosed === null || disclosed === undefined) return bad("NOT_PROVEN", "WS-2.2/5 missing disclosure", "no disclosed evidence; fail-closed NOT_PROVEN");
  if (!Array.isArray(proof) || !Array.isArray(hashes)) return bad("INVALID", "WS-2.2/3", "incomplete disclosure/proof; cannot recompute seam");
  if (!root || !/^[0-9a-f]{64}$/i.test(String(root))) return bad("NOT_PROVEN", "WS-2.2/6 root alone", "no valid commitment root; root/commitment is NEVER execution proof");
  let h = leafHash(disclosed);
  let i = index;
  const full = hashes.length;
  for (const sibling of proof) {
    if (!/^[0-9a-f]{64}$/i.test(String(sibling))) return bad("INVALID", "WS-2.2/4", "malformed path sibling");
    const l = (i % 2 === 0) ? h : Buffer.from(String(sibling), "hex");
    const r = (i % 2 === 0) ? Buffer.from(String(sibling), "hex") : h;
    h = nodeHash(l, r);
    i = (i - (i % 2)) / 2;
  }
  const recomputed = hex(h);
  const byteIdentical = (recomputed === String(root).toLowerCase());
  return byteIdentical
    ? { token: "VERIFIED", label: "WS-2.2/1", reason: "inclusion byte-identical", ok: true, root: recomputed, byteIdentical }
    : bad("INVALID", "WS-2.2/2", "recomputed root != committed root; fail-closed");
}

