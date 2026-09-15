"""Self-contained secp256k1 public-key recovery for ECDSA — Dec-C-3.

No stdlib ECC exists. Mirrors the WS-3 Rust engine's ``secp.rs`` semantics and
message-for-message: the same fail-closed ranges, the same parity rule, and the
exact error strings the JS reference's @noble/curves wrapper surfaces.
Arithmetic is expressed directly over 256-bit integers (curves math is identical;
only the limb encoding differs from B, never the math or the returned bytes).
"""

from ._keccak import keccak256

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def _inv_mod(x, m):
    return pow(x, m - 2, m)


def is_on_curve(x, y):
    return pow(y, 2, P) == (pow(x, 3, P) + 7) % P


def _point_dbl(pt):
    x, y = pt
    if y == 0:
        return None
    lam = (3 * x * x) % P * _inv_mod(2 * y % P, P) % P
    x3 = (lam * lam - 2 * x) % P
    y3 = (lam * (x - x3) - y) % P
    return (x3, y3)


def _point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x1, y1 = a
    x2, y2 = b
    if x1 == x2:
        if y1 == y2:
            return _point_dbl(a)
        if y1 == (-y2) % P:
            return None
    lam = ((y2 - y1) % P) * _inv_mod((x2 - x1) % P, P) % P
    x3 = (lam * lam - x1 - x2) % P
    y3 = (lam * (x1 - x3) - y1) % P
    return (x3, y3)


def _scalar_mul(k, pt):
    result = None
    for bit in range(255, -1, -1):
        result = _point_add(result, result)
        if (k >> bit) & 1:
            result = _point_add(result, pt)
    return result


def recover_signer_address(digest, r, s, v):
    """Recover signer Ethereum address from (digest, r, s, v).

    Args are bytes (32 each) and an int v. Returns ``"0x"+40 lowercase hex``
    or raises ValueError with the exact reference message.
    """
    if len(digest) != 32 or len(r) != 32 or len(s) != 32:
        raise ValueError("recover: digest must be 32 bytes")
    digest_int = int.from_bytes(digest, "big")
    r_int = int.from_bytes(r, "big")
    s_int = int.from_bytes(s, "big")

    if r_int == 0 or r_int >= N:
        raise ValueError("recover: r out of range")
    if s_int == 0 or s_int >= N:
        raise ValueError("recover: s out of range")
    recid = v % 27
    if recid > 1:
        raise ValueError("recover: v must be 27 or 28")

    # Noble uses x = r for recid 0/1 (cofactor-1 curve); parity picks y.
    raw_x = r_int
    if raw_x >= P:
        raise ValueError("recovery id 2 or 3 invalid")

    z = (pow(raw_x, 3, P) + 7) % P
    y = pow(z, (P + 1) // 4, P)
    if pow(y, 2, P) != z:
        raise ValueError("recover: not a quadratic residue")
    if (y & 1) != recid:
        y = (-y) % P
    r_point = (raw_x, y)

    e = digest_int - N if digest_int >= N else digest_int
    r_inv = _inv_mod(r_int, N)
    u1 = (-e * r_inv) % N
    u2 = (s_int * r_inv) % N

    g = (GX, GY)
    q = _point_add(_scalar_mul(u1, g), _scalar_mul(u2, r_point))
    if q is None:
        raise ValueError("recover: point at infinity")
    qx, qy = q
    if not is_on_curve(qx, qy):
        raise ValueError("recover: public key off-curve")

    pub_bytes = qx.to_bytes(32, "big") + qy.to_bytes(32, "big")
    kh = keccak256(pub_bytes)
    return "0x" + kh[12:].hex()