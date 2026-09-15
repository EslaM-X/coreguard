"""V8-parity JSON engine for Verifier C.

Self-contained reader/writer matching V8 ``JSON.parse`` / ``JSON.stringify``
semantics where they matter for byte-parity of the CGEP/1 canonical form
(Dec-C-4): duplicate keys last-wins keeping first position, all numbers become
IEEE doubles, depth cap 256, and the exact parse-error vocabulary of the
WS-3 Rust engine (Verifier B, ``json.rs``), which the JS reference inherits.

Value model (mirror of B's ``Value`` enum, built on stdlib types):
    Null      ->  None
    Bool      ->  bool
    Num       ->  float           (IEEE double, via Python float)
    Str       ->  str
    Arr       ->  list
    Obj       ->  dict (ordered; first-position duplicate-key insertion)

Only the transport bridge uses stdlib ``json`` (I/O framing). Every byte that
leaves this module is produced by the CGEP/1 canonicalization rules owned by C
(number normalization, minimal escaping, key order) — see Dec-C-4 ground.
"""

import math

MAX_SAFE_INT_F64 = 9007199254740991.0


def field(v, key):
    """Value::get — return the field of an Obj, else None."""
    if isinstance(v, dict):
        return v.get(key)
    return None


def is_obj(v):
    return isinstance(v, dict)


def is_arr(v):
    return isinstance(v, list)


def is_str(v):
    return isinstance(v, str)


def is_bool(v):
    return isinstance(v, bool)


def is_num(v):
    return isinstance(v, float)


def is_null(v):
    return v is None


# ---------------------------------------------------------------------------
# Number formatting: replicate ECMAScript `String(number)` (shortest round-trip
# decimal), which the JS reference canonicalizer relies on. Repr of a double
# carries the same shortest digits V8 picks; we re-normalize the decimal point.
# ---------------------------------------------------------------------------

def _split(x):
    """Return (sign, digits, exp10) with x = sign*digits*10**exp10 and digits
    the shortest significant digits (no leading/trailing zeros)."""
    s = repr(x)
    sign = ""
    if s.startswith("-"):
        sign = "-"
        s = s[1:]
    mant, _, exps = s.partition("e")
    exp = int(exps) if exps else 0
    if "." in mant:
        ip, _, fp = mant.partition(".")
    else:
        ip, fp = mant, ""
    digits = (ip + fp).lstrip("0")
    exp10 = exp - len(fp)
    if not digits:
        return sign, "0", 0
    while digits.endswith("0"):
        digits = digits[:-1]
        exp10 += 1
    return sign, digits, exp10


def _expand_plain(digits, exp_num):
    shift = exp_num - (len(digits) - 1)
    if shift >= 0:
        return digits + ("0" * shift)
    point = len(digits) + shift
    if point <= 0:
        return "0." + ("0" * (-point)) + digits
    return digits[:point] + "." + digits[point:]


def fmt_f64(x):
    """ECMAScript String(number) formatting (mirror of B's json::fmt_f64)."""
    if x == 0.0:
        return "0"
    if not math.isfinite(x):
        return "null"
    sign, digits, exp10 = _split(x)
    ax = abs(x)
    exp_notation = ax >= 1.0e21 or (ax != 0.0 and ax < 1.0e-6)
    exp_num = exp10 + len(digits) - 1
    if exp_notation:
        mantissa = digits[0] + ("." + digits[1:] if len(digits) > 1 else "")
        esign = "+" if exp_num >= 0 else "-"
        return "{}{}e{}{}".format(sign, mantissa, esign, abs(exp_num))
    body = _expand_plain(digits, exp_num)
    return sign + body if sign else body


# V8 BigInt(string) semantics for chain-id coercion.
def bigint_parse_js(s):
    """Return canonical big-int string equivalent to B's u128 parse logic.

    Mirrors B exactly: empty -> 0; '0x' hex; decimal; '-' prefix -> 0; any
    invalid token raises ValueError with the JS BigInt error message.
    """
    if s == "":
        return 0
    neg = s.startswith("-")
    rest = s[1:] if neg else s
    if rest.startswith("0x"):
        hexpart = rest[2:]
        if hexpart == "" or not all(c in "0123456789abcdefABCDEF" for c in hexpart):
            raise ValueError("Cannot convert {} to a BigInt".format(s))
        try:
            value = int(hexpart, 16)
        except (ValueError, OverflowError):
            raise ValueError("Cannot convert {} to a BigInt".format(s))
    else:
        if rest == "" or not rest.isascii() or not rest.isdigit():
            raise ValueError("Cannot convert {} to a BigInt".format(s))
        try:
            value = int(rest, 10)
        except (ValueError, OverflowError):
            raise ValueError("Cannot convert {} to a BigInt".format(s))
    if value > 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:
        raise ValueError("Cannot convert {} to a BigInt".format(s))
    if neg:
        return 0
    return value


# ---------------------------------------------------------------------------
# Parser: replicate V8 `JSON.parse` (duplicate keys last-wins keeping first
# position, surrogate escapes, numbers to IEEE doubles, depth cap 256).
# ---------------------------------------------------------------------------

class _Parser:
    def __init__(self, src):
        self.s = src
        self.i = 0
        self.depth = 0

    def peek(self):
        if self.i >= len(self.s):
            return None
        return self.s[self.i]

    def skip_ws(self):
        n = len(self.s)
        while self.i < n and self.peek() in (" ", "\t", "\n", "\r"):
            self.i += 1

    def parse_value(self):
        self.depth += 1
        if self.depth > 256:
            raise ValueError("JSON: nesting too deep")
        try:
            c = self.peek()
            if c == "{":
                out = self.parse_object()
            elif c == "[":
                out = self.parse_array()
            elif c == '"':
                out = self.parse_string()
            elif c == "t":
                out = self.parse_lit("true", True)
            elif c == "f":
                out = self.parse_lit("false", False)
            elif c == "n":
                out = self.parse_lit("null", None)
            elif c is not None and (c == "-" or c.isascii() and c.isdigit()):
                out = self.parse_number()
            elif c is not None:
                raise ValueError("JSON: unexpected character '{}'".format(c))
            else:
                raise ValueError("JSON: unexpected end of input")
        finally:
            self.depth -= 1
        return out

    def parse_lit(self, word, v):
        if self.s[self.i:].startswith(word):
            self.i += len(word)
            return v
        raise ValueError("JSON: expected '{}'".format(word))

    def parse_object(self):
        self.i += 1
        self.skip_ws()
        m = {}
        if self.peek() == "}":
            self.i += 1
            return m
        while True:
            self.skip_ws()
            if self.peek() != '"':
                raise ValueError("JSON: expected string key")
            key = self.parse_string()
            self.skip_ws()
            if self.peek() != ":":
                raise ValueError("JSON: expected ':'")
            self.i += 1
            self.skip_ws()
            val = self.parse_value()
            if key in m:
                m[key] = val
            else:
                m[key] = val
            self.skip_ws()
            c = self.peek()
            if c == ",":
                self.i += 1
            elif c == "}":
                self.i += 1
                break
            else:
                raise ValueError("JSON: expected ',' or '}'")
        return m

    def parse_array(self):
        self.i += 1
        self.skip_ws()
        a = []
        if self.peek() == "]":
            self.i += 1
            return a
        while True:
            self.skip_ws()
            a.append(self.parse_value())
            self.skip_ws()
            c = self.peek()
            if c == ",":
                self.i += 1
            elif c == "]":
                self.i += 1
                break
            else:
                raise ValueError("JSON: expected ',' or ']'")
        return a

    def parse_string(self):
        if self.peek() != '"':
            raise ValueError("JSON: expected string")
        self.i += 1
        out = []
        while True:
            c = self.peek()
            if c is None:
                raise ValueError("JSON: unterminated string")
            if c == '"':
                self.i += 1
                break
            if c == "\\":
                self.i += 1
                esc = self.peek()
                if esc is None:
                    raise ValueError("JSON: unterminated escape")
                self.i += 1
                if esc == '"':
                    out.append('"')
                elif esc == "\\":
                    out.append("\\")
                elif esc == "/":
                    out.append("/")
                elif esc == "b":
                    out.append("\b")
                elif esc == "t":
                    out.append("\t")
                elif esc == "n":
                    out.append("\n")
                elif esc == "f":
                    out.append("\f")
                elif esc == "r":
                    out.append("\r")
                elif esc == "u":
                    hex4 = self.s[self.i:self.i + 4]
                    if len(hex4) < 4:
                        raise ValueError("JSON: truncated \\u escape")
                    try:
                        cp = int(hex4, 16)
                    except ValueError:
                        raise ValueError("JSON: invalid \\u escape")
                    self.i += 4
                    out.append(_push_cp(cp))
                else:
                    raise ValueError("JSON: invalid escape")
            elif c < "\x20":
                raise ValueError("JSON: raw control character")
            else:
                out.append(c)
                self.i += 1
        return "".join(out)

    def parse_number(self):
        start = self.i
        if self.peek() == "-":
            self.i += 1
        int_digits = False
        while True:
            c = self.peek()
            if c is not None and c.isascii() and c.isdigit():
                int_digits = True
                self.i += 1
            else:
                break
        if not int_digits:
            raise ValueError("JSON: invalid number")
        if self.peek() == ".":
            self.i += 1
            frac = False
            while True:
                c = self.peek()
                if c is not None and c.isascii() and c.isdigit():
                    frac = True
                    self.i += 1
                else:
                    break
            if not frac:
                raise ValueError("JSON: invalid number")
        c = self.peek()
        if c is not None and (c == "e" or c == "E"):
            self.i += 1
            c = self.peek()
            if c is not None and (c == "+" or c == "-"):
                self.i += 1
            exp = False
            while True:
                c = self.peek()
                if c is not None and c.isascii() and c.isdigit():
                    exp = True
                    self.i += 1
                else:
                    break
            if not exp:
                raise ValueError("JSON: invalid exponent")
        tok = self.s[start:self.i]
        try:
            return float(tok)
        except (ValueError, OverflowError):
            raise ValueError("JSON: number overflow")


def _push_cp(cp):
    if 0xD800 <= cp <= 0xDFFF:
        # Lone surrogate (V8 keeps it in the JS string; Python cannot) —
        # documented deviation, mirroring B for the protocol vocabulary.
        return "\ufffd"
    return chr(cp)


def parse_json(src):
    """V8-parity JSON.parse; raises ValueError on malformed input."""
    p = _Parser(src)
    p.skip_ws()
    v = p.parse_value()
    p.skip_ws()
    if p.i != len(p.s):
        raise ValueError("JSON: trailing characters")
    return v


# ---------------------------------------------------------------------------
# Serializer: compact, escape minimal set (post-parse identity guaranteed).
# Order-insensitive equality helper for witness-request comparison (B uses the
# ordered Vec equality; Python dict == ignores order, so we compare explicitly).
# ---------------------------------------------------------------------------

def json_eq(a, b):
    """Recursive order-sensitive equality mirroring B's Value PartialEq."""
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, float) or isinstance(b, float):
        return isinstance(a, float) and isinstance(b, float) and a == b
    if isinstance(a, str) or isinstance(b, str):
        return isinstance(a, str) and isinstance(b, str) and a == b
    if isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)):
            return False
        return len(a) == len(b) and all(json_eq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) or isinstance(b, dict):
        if not (isinstance(a, dict) and isinstance(b, dict)):
            return False
        ka = list(a.keys())
        kb = list(b.keys())
        return ka == kb and all(json_eq(a[k], b[k]) for k in ka)
    return False


def js_quote(s):
    out = ['"']
    for c in s:
        if c == '"':
            out.append('\\"')
        elif c == "\\":
            out.append("\\\\")
        elif c == "\b":
            out.append("\\b")
        elif c == "\t":
            out.append("\\t")
        elif c == "\n":
            out.append("\\n")
        elif c == "\f":
            out.append("\\f")
        elif c == "\r":
            out.append("\\r")
        elif ord(c) < 0x20:
            out.append("\\u{:04x}".format(ord(c)))
        else:
            out.append(c)
    out.append('"')
    return "".join(out)


def ser_num(x):
    if not math.isfinite(x):
        return "null"
    # Integral doubles within the safe integer range are written as plain
    # integers; everything else uses JS decimal formatting.
    if x.is_integer() and abs(x) <= MAX_SAFE_INT_F64:
        d = fmt_f64(x)
        if "." in d:
            d = d.split(".")[0]
        return d
    return fmt_f64(x)


def _ser_string(s, out):
    out.append('"')
    for c in s:
        if c == '"':
            out.append('\\"')
        elif c == "\\":
            out.append("\\\\")
        elif c == "\b":
            out.append("\\b")
        elif c == "\t":
            out.append("\\t")
        elif c == "\n":
            out.append("\\n")
        elif c == "\f":
            out.append("\\f")
        elif c == "\r":
            out.append("\\r")
        elif ord(c) < 0x20:
            out.append("\\u{:04x}".format(ord(c)))
        else:
            out.append(c)
    out.append('"')


def _ser_value(v, out):
    if v is None:
        out.append("null")
    elif isinstance(v, bool):
        out.append("true" if v else "false")
    elif isinstance(v, float):
        out.append(ser_num(v))
    elif isinstance(v, str):
        _ser_string(v, out)
    elif isinstance(v, list):
        out.append("[")
        for i, e in enumerate(v):
            if i > 0:
                out.append(",")
            _ser_value(e, out)
        out.append("]")
    elif isinstance(v, dict):
        out.append("{")
        for i, (k, e) in enumerate(v.items()):
            if i > 0:
                out.append(",")
            _ser_string(k, out)
            out.append(":")
            _ser_value(e, out)
        out.append("}")
    else:
        raise TypeError("unsupported JSON value: {!r}".format(v))


def serialize(v):
    """Compact serializer (mirror of B's json::serialize)."""
    out = []
    _ser_value(v, out)
    return "".join(out)


def s(v):
    return str(v)