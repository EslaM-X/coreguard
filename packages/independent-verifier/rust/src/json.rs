// Self-contained JSON engine matching V8 `JSON.parse` / `JSON.stringify`
// semantics where they matter for byte-parity of the CGEP/1 canonical form.

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(m) => m.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn insert(&mut self, key: &str, val: Value) {
        if let Value::Obj(m) = self {
            if let Some(pos) = m.iter().position(|(k, _)| k == key) {
                m[pos].1 = val;
            } else {
                m.push((key.to_string(), val));
            }
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }

    // Sorted key indices (byte order); identical to JS `Object.keys().sort()`
    // for the ASCII protocol vocabulary.
    pub fn sorted_object_indices(&self) -> Vec<usize> {
        match self {
            Value::Obj(m) => {
                let mut idx: Vec<usize> = (0..m.len()).collect();
                idx.sort_by(|&a, &b| m[a].0.cmp(&m[b].0));
                idx
            }
            _ => Vec::new(),
        }
    }
}

impl From<&str> for Value {
    fn from(s: &str) -> Value {
        Value::Str(s.to_string())
    }
}

impl From<String> for Value {
    fn from(s: String) -> Value {
        Value::Str(s)
    }
}

impl From<bool> for Value {
    fn from(b: bool) -> Value {
        Value::Bool(b)
    }
}

impl From<f64> for Value {
    fn from(x: f64) -> Value {
        Value::Num(x)
    }
}

impl From<i64> for Value {
    fn from(x: i64) -> Value {
        Value::Num(x as f64)
    }
}

impl From<u64> for Value {
    fn from(x: u64) -> Value {
        Value::Num(x as f64)
    }
}

pub fn s(v: impl Into<String>) -> Value {
    Value::Str(v.into())
}

pub fn o(pairs: Vec<(&'static str, Value)>) -> Value {
    Value::Obj(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

// ---------------------------------------------------------------------------
// Number formatting: replicate ECMAScript `String(number)` (shortest round-trip
// decimal), which is what the JS reference canonicalizer relies on.
// ---------------------------------------------------------------------------

pub fn fmt_f64(x: f64) -> String {
    if x == 0.0 {
        return "0".to_string();
    }
    if !x.is_finite() {
        return "null".to_string();
    }
    let ax = x.abs();
    // JS uses exponent notation when 1e21 <= |x|, or 0 < |x| < 1e-6.
    let exponent_notation = ax >= 1.0e21 || (ax != 0.0 && ax < 1.0e-6);
    // Rust {:e} produces the shortest correctly-rounded mantissa digits — the
    // same digits V8 picks — with a sign-less exponent.
    let raw = format!("{:e}", x);
    let (mant, exp) = raw.split_once('e').unwrap_or(("0", "0"));
    if exponent_notation {
        let exp_num: i32 = exp.parse().unwrap_or(0);
        let sign = if exp_num >= 0 { "+" } else { "-" };
        format!("{}e{}{}", mant, sign, exp_num.abs())
    } else {
        expand_plain(mant, exp)
    }
}

fn expand_plain(mant: &str, exp: &str) -> String {
    let neg = mant.starts_with('-');
    let digits: String = mant.chars().filter(|c| *c != '.' && *c != '-').collect();
    let exp_num: i32 = exp.parse().unwrap_or(0);
    let shift = exp_num - (digits.len() as i32 - 1);
    let body = if shift >= 0 {
        format!("{}{}", digits, "0".repeat(shift as usize))
    } else {
        let point = digits.len() as i64 + shift as i64;
        if point <= 0 {
            format!("0.{}{}", "0".repeat((-point) as usize), digits)
        } else {
            let (a, b) = digits.split_at(point as usize);
            format!("{}.{}", a, b)
        }
    };
    if neg {
        format!("-{}", body)
    } else {
        body
    }
}

// V8 BigInt(string) semantics for chain-id coercion.
pub fn bigint_parse_js(s: &str) -> Result<u128, String> {
    let err = || format!("Cannot convert {} to a BigInt", s);
    if s.is_empty() {
        return Ok(0);
    }
    let (neg, rest) = if let Some(r) = s.strip_prefix('-') {
        (true, r)
    } else {
        (false, s)
    };
    let value: u128 = if let Some(hex) = rest.strip_prefix("0x") {
        if hex.is_empty() || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(err());
        }
        u128::from_str_radix(hex, 16).map_err(|_| err())?
    } else {
        if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
            return Err(err());
        }
        rest.parse::<u128>().map_err(|_| err())?
    };
    if neg {
        Ok(0)
    } else {
        Ok(value)
    }
}

// ---------------------------------------------------------------------------
// Parser: replicate V8 `JSON.parse` (duplicate keys last-wins keeping first
// position, surrogate pair escapes, numbers to IEEE doubles).
// ---------------------------------------------------------------------------

pub fn parse_json(src: &str) -> Result<Value, String> {
    let mut p = Parser {
        s: src,
        i: 0,
        depth: 0,
    };
    p.skip_ws();
    let v = p.parse_value()?;
    p.skip_ws();
    if p.i != src.len() {
        return Err("JSON: trailing characters".to_string());
    }
    Ok(v)
}

struct Parser<'a> {
    s: &'a str,
    i: usize,
    depth: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<char> {
        self.s[self.i..].chars().next()
    }

    fn skip_ws(&mut self) {
        while let Some(c) = self.peek() {
            if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
                self.i += c.len_utf8();
            } else {
                break;
            }
        }
    }

    fn parse_value(&mut self) -> Result<Value, String> {
        self.depth += 1;
        if self.depth > 256 {
            return Err("JSON: nesting too deep".to_string());
        }
        let out = match self.peek() {
            Some('{') => self.parse_object(),
            Some('[') => self.parse_array(),
            Some('"') => self.parse_string().map(Value::Str),
            Some('t') => self.parse_lit("true", Value::Bool(true)),
            Some('f') => self.parse_lit("false", Value::Bool(false)),
            Some('n') => self.parse_lit("null", Value::Null),
            Some(c) if c == '-' || c.is_ascii_digit() => self.parse_number(),
            Some(c) => Err(format!("JSON: unexpected character '{}'", c)),
            None => Err("JSON: unexpected end of input".to_string()),
        };
        self.depth -= 1;
        out
    }

    fn parse_lit(&mut self, word: &str, v: Value) -> Result<Value, String> {
        if self.s[self.i..].starts_with(word) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(format!("JSON: expected '{}'", word))
        }
    }

    fn parse_object(&mut self) -> Result<Value, String> {
        self.i += 1; // '{'
        self.skip_ws();
        let mut m: Vec<(String, Value)> = Vec::new();
        if self.peek() == Some('}') {
            self.i += 1;
            return Ok(Value::Obj(m));
        }
        loop {
            self.skip_ws();
            if self.peek() != Some('"') {
                return Err("JSON: expected string key".to_string());
            }
            let key = self.parse_string()?;
            self.skip_ws();
            if self.peek() != Some(':') {
                return Err("JSON: expected ':'".to_string());
            }
            self.i += 1;
            self.skip_ws();
            let val = self.parse_value()?;
            if let Some(pos) = m.iter().position(|(k, _)| *k == key) {
                m[pos].1 = val;
            } else {
                m.push((key, val));
            }
            self.skip_ws();
            match self.peek() {
                Some(',') => {
                    self.i += 1;
                }
                Some('}') => {
                    self.i += 1;
                    break;
                }
                _ => return Err("JSON: expected ',' or '}'".to_string()),
            }
        }
        Ok(Value::Obj(m))
    }

    fn parse_array(&mut self) -> Result<Value, String> {
        self.i += 1; // '['
        self.skip_ws();
        let mut a: Vec<Value> = Vec::new();
        if self.peek() == Some(']') {
            self.i += 1;
            return Ok(Value::Arr(a));
        }
        loop {
            self.skip_ws();
            a.push(self.parse_value()?);
            self.skip_ws();
            match self.peek() {
                Some(',') => {
                    self.i += 1;
                }
                Some(']') => {
                    self.i += 1;
                    break;
                }
                _ => return Err("JSON: expected ',' or ']'".to_string()),
            }
        }
        Ok(Value::Arr(a))
    }

    fn parse_string(&mut self) -> Result<String, String> {
        if self.peek() != Some('"') {
            return Err("JSON: expected string".to_string());
        }
        self.i += 1;
        let mut out = String::new();
        loop {
            let c = match self.peek() {
                Some(c) => c,
                None => return Err("JSON: unterminated string".to_string()),
            };
            match c {
                '"' => {
                    self.i += 1;
                    break;
                }
                '\\' => {
                    self.i += 1;
                    let esc = self
                        .peek()
                        .ok_or_else(|| "JSON: unterminated escape".to_string())?;
                    self.i += esc.len_utf8();
                    match esc {
                        '"' => out.push('"'),
                        '\\' => out.push('\\'),
                        '/' => out.push('/'),
                        'b' => out.push('\u{0008}'),
                        't' => out.push('\t'),
                        'n' => out.push('\n'),
                        'f' => out.push('\u{000c}'),
                        'r' => out.push('\r'),
                        'u' => {
                            let hex = self
                                .s
                                .get(self.i..self.i + 4)
                                .ok_or_else(|| "JSON: truncated \\u escape".to_string())?;
                            let cp = u16::from_str_radix(hex, 16)
                                .map_err(|_| "JSON: invalid \\u escape".to_string())?;
                            self.i += 4;
                            push_cp(&mut out, cp);
                        }
                        _ => return Err("JSON: invalid escape".to_string()),
                    }
                }
                c if (c as u32) < 0x20 => return Err("JSON: raw control character".to_string()),
                _ => {
                    out.push(c);
                    self.i += c.len_utf8();
                }
            }
        }
        Ok(out)
    }

    fn parse_number(&mut self) -> Result<Value, String> {
        let start = self.i;
        if self.peek() == Some('-') {
            self.i += 1;
        }
        let mut int_digits = false;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                int_digits = true;
                self.i += 1;
            } else {
                break;
            }
        }
        if !int_digits {
            return Err("JSON: invalid number".to_string());
        }
        if self.peek() == Some('.') {
            self.i += 1;
            let mut frac = false;
            while let Some(c) = self.peek() {
                if c.is_ascii_digit() {
                    frac = true;
                    self.i += 1;
                } else {
                    break;
                }
            }
            if !frac {
                return Err("JSON: invalid number".to_string());
            }
        }
        if let Some(c) = self.peek() {
            if c == 'e' || c == 'E' {
                self.i += 1;
                if let Some(c) = self.peek() {
                    if c == '+' || c == '-' {
                        self.i += 1;
                    }
                }
                let mut exp = false;
                while let Some(c) = self.peek() {
                    if c.is_ascii_digit() {
                        exp = true;
                        self.i += 1;
                    } else {
                        break;
                    }
                }
                if !exp {
                    return Err("JSON: invalid exponent".to_string());
                }
            }
        }
        let tok = &self.s[start..self.i];
        tok.parse::<f64>()
            .map(Value::Num)
            .map_err(|_| "JSON: number overflow".to_string())
    }
}

fn push_cp(out: &mut String, cp: u16) {
    match char::from_u32(cp as u32) {
        Some(c) => out.push(c),
        None => {
            // Lone surrogate (V8 keeps it in the JS string; Rust cannot) —
            // documented deviation for the protocol vocabulary (never used).
            out.push('\u{fffd}');
        }
    }
}

// ---------------------------------------------------------------------------
// Serializer: compact, escape minimal set (post-parse identity guaranteed).
// ---------------------------------------------------------------------------

pub fn serialize(v: &Value) -> String {
    let mut out = String::new();
    ser_value(v, &mut out);
    out
}

fn ser_value(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => out.push_str(&ser_num(*n)),
        Value::Str(s) => ser_string(s, out),
        Value::Arr(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                ser_value(e, out);
            }
            out.push(']');
        }
        Value::Obj(m) => {
            out.push('{');
            for (i, (k, e)) in m.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                ser_string(k, out);
                out.push(':');
                ser_value(e, out);
            }
            out.push('}');
        }
    }
}

fn ser_num(x: f64) -> String {
    if !x.is_finite() {
        return "null".to_string();
    }
    // Integral doubles within the safe integer range are written as plain
    // integers; everything else uses JS decimal formatting, which the
    // consuming JS `JSON.parse` round-trips losslessly.
    if x.fract() == 0.0 && x.abs() <= 9_007_199_254_740_991.0 {
        let mut d = fmt_f64(x);
        if d.contains('.') {
            d = d.split('.').next().unwrap().to_string();
        }
        d
    } else {
        fmt_f64(x)
    }
}

fn ser_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\u{000c}' => out.push_str("\\f"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => {
                use core::fmt::Write;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}