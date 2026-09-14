// Self-contained Keccak-256 (original Keccak, MD padding 0x01, as used by
// Ethereum and the CGEP/1 reference). Test vectors:
//   keccak256("")           = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
//   keccak256("abc")        = 4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45

// Keccak-f[1600] round constants (24 rounds)
const RC: [u64; 24] = [
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808a,
    0x8000000080008000,
    0x000000000000808b,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008a,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000a,
    0x000000008000808b,
    0x800000000000008b,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800a,
    0x800000008000000a,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
];

const ROT: [u32; 24] = [
    1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];

const PILANE: [usize; 24] = [
    10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
];

pub fn keccak256(data: &[u8]) -> [u8; 32] {
    const RATE: usize = 136; // 1088 bits for Keccak-256, capacity 512 bits
    let mut state = [0u64; 25];

    let mut idx = 0usize;
    let mut block = [0u8; RATE];
    for &b in data {
        block[idx] ^= b;
        idx += 1;
        if idx == RATE {
            absorb(&mut state, &block);
            idx = 0;
            block = [0u8; RATE];
        }
    }
    block[idx] ^= 0x01;
    block[RATE - 1] ^= 0x80;
    absorb(&mut state, &block);

    let mut out = [0u8; 32];
    let mut filled = 0usize;
    while filled < 32 {
        for lane in state.iter() {
            for i in 0..8 {
                if filled < 32 {
                    out[filled] = (lane >> (i * 8)) as u8;
                    filled += 1;
                }
            }
        }
        if filled < 32 {
            keccak_f(&mut state);
        }
    }
    out
}

fn absorb(state: &mut [u64; 25], block: &[u8; 136]) {
    for lane in 0..17 {
        let mut v = 0u64;
        for b in 0..8 {
            v |= (block[lane * 8 + b] as u64) << (b * 8);
        }
        state[lane] ^= v;
    }
    keccak_f(state);
}

fn keccak_f(a: &mut [u64; 25]) {
    let mut bc = [0u64; 5];
    for round in 0..24 {
        // Theta
        for i in 0..5 {
            bc[i] = a[i] ^ a[i + 5] ^ a[i + 10] ^ a[i + 15] ^ a[i + 20];
        }
        for i in 0..5 {
            let t = bc[(i + 4) % 5] ^ bc[(i + 1) % 5].rotate_left(1);
            for j in (0..25).step_by(5) {
                a[j + i] ^= t;
            }
        }
        // Rho + Pi (canonical 24-lane swizzle)
        let mut t = a[1];
        for i in 0..24 {
            let j = PILANE[i];
            let s = a[j];
            a[j] = t.rotate_left(ROT[i]);
            t = s;
        }
        // Chi
        for j in (0..25).step_by(5) {
            for i in 0..5 {
                bc[i] = a[j + i];
            }
            for i in 0..5 {
                a[j + i] = bc[i] ^ ((!bc[(i + 1) % 5]) & bc[(i + 2) % 5]);
            }
        }
        // Iota
        a[0] ^= RC[round];
    }
}