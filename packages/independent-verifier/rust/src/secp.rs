// Self-contained secp256k1 public-key recovery for ECDSA (no signing, no RNG).
// Re-derives the signer address from (digest, r, s, v) exactly as the CGEP/1
// JS reference does. Arithmetic is standard 256-bit modulo p / modulo n with
// the special-form reduction 2^256 ≡ c (mod m).
//
// Curve: y^2 = x^3 + 7  (mod p)
//   p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
//   n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

const P: [u64; 4] = [
    0xFFFFFFFEFFFFFC2F,
    0xFFFFFFFFFFFFFFFF,
    0xFFFFFFFFFFFFFFFF,
    0xFFFFFFFFFFFFFFFF,
];

const N: [u64; 4] = [
    0xBFD25E8CD0364141,
    0xBAAEDCE6AF48A03B,
    0xFFFFFFFFFFFFFFFE,
    0xFFFFFFFFFFFFFFFF,
];

// c = 2^256 - m as 64-bit limbs (little-endian order), used for reduction.
const C_P: [u64; 3] = [0x00000001000003D1, 0, 0];
const C_N: [u64; 3] = [0x402DA1732FC9BEBF, 0x4551231950B75FC4, 0x0000000000000001];

const GX: [u64; 4] = [
    0x59F2815B16F81798,
    0x029BFCDB2DCE28D9,
    0x55A06295CE870B07,
    0x79BE667EF9DCBBAC,
];

const GY: [u64; 4] = [
    0x9C47D08FFB10D4B8,
    0xFD17B448A6855419,
    0x5DA4FBFC0E1108A8,
    0x483ADA7726A3C465,
];

const MOD_P_MINUS_2: [u64; 4] = [
    0xFFFFFFFEFFFFFC2D,
    0xFFFFFFFFFFFFFFFF,
    0xFFFFFFFFFFFFFFFF,
    0xFFFFFFFFFFFFFFFF,
];

const MOD_N_MINUS_2: [u64; 4] = [
    0xBFD25E8CD036413F,
    0xBAAEDCE6AF48A03B,
    0xFFFFFFFFFFFFFFFE,
    0xFFFFFFFFFFFFFFFF,
];

type U256 = [u64; 4];

fn from_be_bytes(b: &[u8; 32]) -> U256 {
    let mut o = [0u64; 4];
    for i in 0..4 {
        let mut v = 0u64;
        for j in 0..8 {
            v = (v << 8) | b[i * 8 + j] as u64;
        }
        o[3 - i] = v;
    }
    o
}

fn to_be_bytes(a: U256) -> [u8; 32] {
    let mut o = [0u8; 32];
    for i in 0..4 {
        o[i * 8..i * 8 + 8].copy_from_slice(&a[3 - i].to_be_bytes());
    }
    o
}

fn ge(a: &[u64; 4], b: &[u64; 4]) -> bool {
    for i in (0..4).rev() {
        if a[i] != b[i] {
            return a[i] > b[i];
        }
    }
    true
}

fn addc(a: U256, b: U256) -> (U256, u64) {
    let mut o = [0u64; 4];
    let mut carry = 0u64;
    for i in 0..4 {
        let s = a[i] as u128 + b[i] as u128 + carry as u128;
        o[i] = s as u64;
        carry = (s >> 64) as u64;
    }
    (o, carry)
}

fn sub_borrow(a: U256, b: U256) -> (U256, u64) {
    let mut o = [0u64; 4];
    let mut borrow = 0u64;
    for i in 0..4 {
        let ai = a[i] as u128;
        let bi = (b[i] as u128) + borrow as u128;
        if ai >= bi {
            o[i] = (ai - bi) as u64;
            borrow = 0;
        } else {
            o[i] = (ai + (1u128 << 64) - bi) as u64;
            borrow = 1;
        }
    }
    (o, borrow)
}

fn neg_mod(a: U256) -> U256 {
    // 2^256 - a
    let not_a = [a[0] ^ u64::MAX, a[1] ^ u64::MAX, a[2] ^ u64::MAX, a[3] ^ u64::MAX];
    addc(not_a, [1, 0, 0, 0]).0
}

fn add_mod(a: U256, b: U256, m: U256) -> U256 {
    let (s, carry) = addc(a, b);
    if carry == 1 {
        // a + b = 2^256 + s;  (a + b) mod m = s + (2^256 - m) (no re-wrap).
        addc(s, neg_mod(m)).0
    } else if ge(&s, &m) {
        sub_borrow(s, m).0
    } else {
        s
    }
}

fn sub_mod(a: U256, b: U256, m: U256) -> U256 {
    let (d, borrow) = sub_borrow(a, b);
    if borrow == 1 {
        // a < b:  d = 2^256 + a - b;  result = a - b + m.
        addc(d, m).0
    } else {
        d
    }
}

fn add_word_at(t: &mut [u64; 8], mut v: u128, mut i: usize) {
    while v != 0 && i < 8 {
        let sum = t[i] as u128 + (v & u64::MAX as u128);
        let carry = sum >> 64;
        t[i] = sum as u64;
        v = carry + (v >> 64);
        i += 1;
    }
    debug_assert!(v == 0, "carry out of 512-bit accumulator");
}

fn mul_full(a: U256, b: U256) -> [u64; 8] {
    let mut t = [0u64; 8];
    for i in 0..4 {
        for j in 0..4 {
            let prod = a[i] as u128 * b[j] as u128;
            add_word_at(&mut t, prod, i + j);
        }
    }
    t
}

fn reduce8(t: &mut [u64; 8], c: [u64; 3], m: U256) -> U256 {
    // Fold high limbs down using 2^256 ≡ c (mod m). Repeats until the high
    // limbs clear (converges in a few passes for c < 2^130).
    for _ in 0..12 {
        let mut top = 7usize;
        while top >= 4 && t[top] == 0 {
            top -= 1;
        }
        if top < 4 {
            break;
        }
        for i in (4..=top).rev() {
            let x = t[i] as u128;
            if x == 0 {
                continue;
            }
            t[i] = 0;
            add_word_at(t, x * c[0] as u128, i - 4);
            add_word_at(t, x * c[1] as u128, i - 3);
            if c[2] != 0 {
                add_word_at(t, x * c[2] as u128, i - 2);
            }
        }
    }
    debug_assert!(t[4] == 0 && t[5] == 0 && t[6] == 0 && t[7] == 0, "reduction did not converge");
    // Drop to < m.
    let low = [t[0], t[1], t[2], t[3]];
    let mut out = low;
    let iters = if ge(&out, &m) { 8 } else { 1 };
    for _ in 0..iters {
        if ge(&out, &m) {
            out = sub_borrow(out, m).0;
        } else {
            break;
        }
    }
    out
}

fn mul_mod(a: U256, b: U256, m: U256, c: [u64; 3]) -> U256 {
    let mut t = mul_full(a, b);
    reduce8(&mut t, c, m)
}

fn pow_mod(base: U256, exp: U256, m: U256, c: [u64; 3]) -> U256 {
    let mut result = [1u64, 0, 0, 0];
    for bit in (0..256).rev() {
        if bit != 255 {
            result = mul_mod(result, result, m, c);
        }
        if (exp[bit / 64] >> (bit % 64)) & 1 == 1 {
            result = mul_mod(result, base, m, c);
        }
    }
    result
}

fn inv_mod(x: U256, m: U256, m_minus_2: U256, c: [u64; 3]) -> U256 {
    pow_mod(x, m_minus_2, m, c)
}

fn shr2(a: U256) -> U256 {
    let mut o = [0u64; 4];
    let mut carry = 0u64;
    for i in (0..4).rev() {
        let v: u128 = ((carry as u128) << 64) | a[i] as u128;
        o[i] = (v >> 2) as u64;
        carry = a[i] & 0b11;
    }
    o
}

// ---------------------------------------------------------------------------
// Point arithmetic (affine, mod p)
// ---------------------------------------------------------------------------

fn is_on_curve(x: U256, y: U256) -> bool {
    let x3 = mul_mod(mul_mod(x, x, P, C_P), x, P, C_P);
    let lhs = mul_mod(y, y, P, C_P);
    let rhs = add_mod(x3, [7u64, 0, 0, 0], P);
    lhs == rhs
}

fn point_dbl(pt: (U256, U256)) -> Option<(U256, U256)> {
    let (x, y) = pt;
    if ge(&y, &[0, 0, 0, 0]) == false {
        return None;
    }
    let two_y = add_mod(y, y, P);
    if two_y == [0, 0, 0, 0] {
        return None;
    }
    let x2 = mul_mod(x, x, P, C_P);
    let three_x2 = add_mod(add_mod(x2, x2, P), x2, P);
    let lambda = mul_mod(three_x2, inv_mod(two_y, P, MOD_P_MINUS_2, C_P), P, C_P);
    let lambda2 = mul_mod(lambda, lambda, P, C_P);
    let x3 = sub_mod(sub_mod(lambda2, x, P), x, P);
    let y3 = sub_mod(mul_mod(lambda, sub_mod(x, x3, P), P, C_P), y, P);
    Some((x3, y3))
}

fn point_add(a: Option<(U256, U256)>, b: Option<(U256, U256)>) -> Option<(U256, U256)> {
    match (a, b) {
        (None, b) => b,
        (a, None) => a,
        (Some((x1, y1)), Some((x2, y2))) => {
            if x1 == x2 {
                if y1 == y2 {
                    return point_dbl((x1, y1));
                }
                if y1 == sub_mod([0, 0, 0, 0], y2, P) {
                    return None;
                }
            }
            let dx = sub_mod(x2, x1, P);
            let dy = sub_mod(y2, y1, P);
            let lambda = mul_mod(dy, inv_mod(dx, P, MOD_P_MINUS_2, C_P), P, C_P);
            let lambda2 = mul_mod(lambda, lambda, P, C_P);
            let x3 = sub_mod(sub_mod(lambda2, x1, P), x2, P);
            let y3 = sub_mod(mul_mod(lambda, sub_mod(x1, x3, P), P, C_P), y1, P);
            Some((x3, y3))
        }
    }
}

fn scalar_mul(k: U256, pt: Option<(U256, U256)>) -> Option<(U256, U256)> {
    let mut result = None;
    for bit in (0..256).rev() {
        result = point_add(result, result);
        if (k[bit / 64] >> (bit % 64)) & 1 == 1 {
            result = point_add(result, pt);
        }
    }
    result
}

// ---------------------------------------------------------------------------
// Public API: recover the signer's Ethereum address (0x-prefixed lowercase hex)
// or an Err(..) message mirroring the JS reference semantics.
// ---------------------------------------------------------------------------

pub fn recover_signer_address(digest: &[u8; 32], r: &[u8; 32], s: &[u8; 32], v: u8) -> Result<String, String> {
    let digest_int = from_be_bytes(digest);
    let r_int = from_be_bytes(r);
    let s_int = from_be_bytes(s);
    // Message parity with the JS reference (@noble/curves wrapper).
    if r_int == [0, 0, 0, 0] || ge(&r_int, &N) {
        return Err("recover: r out of range".to_string());
    }
    if s_int == [0, 0, 0, 0] || ge(&s_int, &N) {
        return Err("recover: s out of range".to_string());
    }
    let recid = v % 27;
    if recid > 1 {
        return Err("recover: v must be 27 or 28".to_string());
    }

    // Noble uses x = r for recid 0/1 (cofactor-1 curve); parity picks y.
    // When r >= p the compressed-point decode fails like the reference.
    let raw_x = r_int;
    if ge(&raw_x, &P) {
        return Err("recovery id 2 or 3 invalid".to_string());
    }

    // y = sqrt(x^3 + 7) mod p
    let x3 = mul_mod(mul_mod(raw_x, raw_x, P, C_P), raw_x, P, C_P);
    let z = add_mod(x3, [7u64, 0, 0, 0], P);
    let p_plus_1 = addc(P, [1u64, 0, 0, 0]).0; // (P+1) < 2^256, no carry
    let exp = shr2(p_plus_1); // (P+1)/4
    let y = pow_mod(z, exp, P, C_P);
    if mul_mod(y, y, P, C_P) != z {
        return Err("recover: not a quadratic residue".to_string());
    }
    let y = if (y[0] & 1) as u8 != recid {
        sub_mod([0, 0, 0, 0], y, P)
    } else {
        y
    };
    let r_point = Some((raw_x, y));

    // Q = r^-1 (s R - e G)
    let e = if ge(&digest_int, &N) {
        sub_borrow(digest_int, N).0
    } else {
        digest_int
    };
    let r_inv = inv_mod(r_int, N, MOD_N_MINUS_2, C_N);
    let u1 = mul_mod(sub_mod([0, 0, 0, 0], e, N), r_inv, N, C_N);
    let u2 = mul_mod(s_int, r_inv, N, C_N);

    let g = Some((GX, GY));
    let q = point_add(scalar_mul(u1, g), scalar_mul(u2, r_point));
    let (qx, qy) = q.ok_or_else(|| "recover: point at infinity".to_string())?;
    if !is_on_curve(qx, qy) {
        return Err("recover: public key off-curve".to_string());
    }

    let mut pub_bytes = [0u8; 64];
    let bx = to_be_bytes(qx);
    let by = to_be_bytes(qy);
    pub_bytes[..32].copy_from_slice(&bx);
    pub_bytes[32..].copy_from_slice(&by);
    let kh = crate::keccak::keccak256(&pub_bytes);
    Ok(format!("0x{}", crate::hex::hex_encode(&kh[12..])))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_point_scalar_1() {
        let q = scalar_mul([1u64, 0, 0, 0], Some((GX, GY))).unwrap();
        assert_eq!(q, (GX, GY));
    }

    #[test]
    fn self_consistent_recovery_returns_g() {
        // R = G (v = 27, y even), s = 2, e = 1  =>  Q = 2G - G = G
        let gx = to_be_bytes(GX);
        let mut r = [0u8; 32];
        r.copy_from_slice(&gx);
        let mut s = [0u8; 32];
        s[31] = 2;
        let mut e = [0u8; 32];
        e[31] = 1;
        let addr = recover_signer_address(&e, &r, &s, 27).expect("recovery");
        // address(G): keccak of the 64-byte pubkey x||y
        let mut pub_bytes = [0u8; 64];
        pub_bytes[..32].copy_from_slice(&to_be_bytes(GX));
        pub_bytes[32..].copy_from_slice(&to_be_bytes(GY));
        let kh = crate::keccak::keccak256(&pub_bytes);
        let expected = format!("0x{}", crate::hex::hex_encode(&kh[12..]));
        assert_eq!(addr, expected);
    }

    #[test]
    fn double_vs_add() {
        let g = Some((GX, GY));
        let two = scalar_mul([2u64, 0, 0, 0], g);
        let doubled = point_dbl((GX, GY));
        assert_eq!(two, doubled);
        // three = dbl + G
        let three = scalar_mul([3u64, 0, 0, 0], g);
        assert_eq!(three, point_add(doubled, g));
    }

    #[test]
    fn on_curve() {
        assert!(is_on_curve(GX, GY));
    }

    #[test]
    fn out_of_range_r_fails() {
        assert!(recover_signer_address(&[0u8; 32], &[0xff; 32], &[1u8; 32], 27).is_err());
    }
}