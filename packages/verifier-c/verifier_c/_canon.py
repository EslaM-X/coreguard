"""CGEP/1 canonicalization + hex + domain hashing — C's own rules.

Byte-exact with the JS reference (A) and the WS-3 Rust engine (B): sorted object
keys, JS number normalization, minimal escaping, 0x-string lowercasing. These
ARE the canonicalization rules that Dec-C-4 requires C to own; stdlib ``json``
is never used to emit a canonical byte (it would write integral floats as
``1.0`` and escape differently).
"""

import hashlib

from . import _json
from ._json import field, is_str, fmt_f64, js_quote

MAX_SAFE_INT_F64 = _json.MAX_SAFE_INT_F64


class CanonError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


# ---------------------------------------------------------------------------
# Hex helpers (mirror of B's hex.rs)
# ---------------------------------------------------------------------------

def lc_js(s):
    return s.lower()


def hex_chars(s):
    if s == "":
        return False
    return all(c in "0123456789abcdefABCDEF" for c in s)


def is_even_hex0x(s):
    if s.startswith("0x"):
        rest = s[2:]
        return rest != "" and len(rest) % 2 == 0 and hex_chars(rest)
    return False


def _hex_digit(c):
    if "0" <= c <= "9":
        return ord(c) - ord("0")
    if "a" <= c <= "f":
        return ord(c) - ord("a") + 10
    if "A" <= c <= "F":
        return ord(c) - ord("A") + 10
    return 0


def hex_bytes(s):
    t = s[2:] if s.startswith("0x") else s
    if len(t) % 2 == 1:
        t = "0" + t
    out = []
    for i in range(0, len(t), 2):
        out.append((_hex_digit(t[i]) << 4) | _hex_digit(t[i + 1]))
    return bytes(out)


def hex_encode(b):
    return b.hex()


def normalize_hex(s):
    return "0x" + lc_js(s[2:]) if s.startswith("0x") else "0x" + lc_js(s)


# ---------------------------------------------------------------------------
# Canonicalizer
# ---------------------------------------------------------------------------

def canonicalize(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        x = v
        if x == 0.0:
            return "0"
        if not _finite(x):
            raise CanonError(
                "Unsafe JS Number Infinity: pass large integers as canonical decimal strings (CGEP/1 uint)"
            )
        if not x.is_integer():
            raise CanonError("Non-integer numbers not supported")
        if abs(x) > MAX_SAFE_INT_F64:
            raise CanonError(
                "Unsafe JS Number {}: pass large integers as canonical decimal strings (CGEP/1 uint)".format(
                    fmt_f64(x)
                )
            )
        return fmt_f64(x)
    if isinstance(v, str):
        if v.startswith("0x"):
            return js_quote(lc_js(v))
        return js_quote(v)
    if isinstance(v, list):
        parts = []
        for i, e in enumerate(v):
            if i > 0:
                parts.append(",")
            parts.append(canonicalize(e))
        return "[" + "".join(parts) + "]"
    if isinstance(v, dict):
        parts = []
        keys = sorted(v.keys())
        for i, k in enumerate(keys):
            if i > 0:
                parts.append(",")
            parts.append(js_quote(k))
            parts.append(":")
            parts.append(canonicalize(v[k]))
        return "{" + "".join(parts) + "}"
    raise CanonError("unsupported value")


def _finite(x):
    import math
    return math.isfinite(x)


# ---------------------------------------------------------------------------
# Domain hashing (mirror of B's lib.rs)
# ---------------------------------------------------------------------------

def domain_hash(domain, data):
    input_bytes = domain.encode("utf-8") + data.encode("utf-8")
    return "0x" + hashlib.sha256(input_bytes).hexdigest()


def sha256_domain_hash(domain, value):
    return domain_hash(domain, canonicalize(value))