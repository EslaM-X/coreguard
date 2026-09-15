"""Self-contained Keccak-256 (original Keccak, MD padding 0x01) — Dec-C-3.

No stdlib raw Keccak exists; ``hashlib.sha3_*`` is NIST SHA3 and must NOT be
substituted. Mirrors the WS-3 Rust engine's ``keccak.rs`` (rate 136, domain
byte 0x01, final byte 0x80). Test vectors:
    keccak256("")   = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
    keccak256("abc")= 4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45
"""

_M64 = (1 << 64) - 1

# Keccak-f[1600] round constants (24 rounds)
_RC = [
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
]

_ROT = [
    1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
]

_PILANE = [
    10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
]


def _rol(v, n):
    n &= 63
    if n == 0:
        return v & _M64
    return ((v << n) | (v >> (64 - n))) & _M64


def _keccak_f(state):
    bc = [0] * 5
    for round in range(24):
        for i in range(5):
            bc[i] = state[i] ^ state[i + 5] ^ state[i + 10] ^ state[i + 15] ^ state[i + 20]
        for i in range(5):
            t = bc[(i + 4) % 5] ^ _rol(bc[(i + 1) % 5], 1)
            for j in range(0, 25, 5):
                state[j + i] ^= t
        t = state[1]
        for i in range(24):
            j = _PILANE[i]
            x = state[j]
            state[j] = _rol(t, _ROT[i])
            t = x
        for j in range(0, 25, 5):
            for i in range(5):
                bc[i] = state[j + i]
            for i in range(5):
                state[j + i] = bc[i] ^ ((~(bc[(i + 1) % 5])) & bc[(i + 2) % 5])
        state[0] ^= _RC[round]


def keccak256(data):
    """Keccak-256 digest of ``bytes`` object -> 32-byte bytes."""
    rate = 136  # 1088-bit rate for Keccak-256, 512-bit capacity
    state = [0] * 25

    idx = 0
    block = bytearray(rate)
    for b in data:
        block[idx] ^= b
        idx += 1
        if idx == rate:
            _absorb(state, block)
            idx = 0
            block = bytearray(rate)
    block[idx] ^= 0x01
    block[rate - 1] ^= 0x80
    _absorb(state, block)

    out = bytearray()
    filled = 0
    while filled < 32:
        for lane in state:
            for i in range(8):
                if filled < 32:
                    out.append((lane >> (i * 8)) & 0xFF)
                    filled += 1
        if filled < 32:
            _keccak_f(state)
    return bytes(out)


def _absorb(state, block):
    rate = 136
    for lane in range(rate // 8):
        v = 0
        for b in range(8):
            v |= block[lane * 8 + b] << (b * 8)
        state[lane] ^= v
    _keccak_f(state)


# FIPS 180-4 SHA-256 via hashlib (platform primitive, not protocol logic).
def sha256(data):
    import hashlib
    return hashlib.sha256(data).digest()