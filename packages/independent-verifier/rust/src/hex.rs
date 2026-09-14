// Hex helpers matching the JS reference's handling of 0x-prefixed byte strings.

pub fn lc_js(s: &str) -> String {
    s.chars().flat_map(|c| c.to_lowercase()).collect()
}

pub fn hex_digit(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => b - b'a' + 10,
        b'A'..=b'F' => b - b'A' + 10,
        _ => 0,
    }
}

pub fn hex_chars(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_hexdigit())
}

pub fn is_even_hex0x(s: &str) -> bool {
    if let Some(rest) = s.strip_prefix("0x") {
        !rest.is_empty() && rest.len() % 2 == 0 && hex_chars(rest)
    } else {
        false
    }
}

pub fn hex_bytes(s: &str) -> Vec<u8> {
    let t = s.strip_prefix("0x").unwrap_or(s);
    let t = if t.len() % 2 == 1 { format!("0{}", t) } else { t.to_string() };
    t.as_bytes()
        .chunks(2)
        .map(|c| ((hex_digit(c[0]) << 4) | hex_digit(c[1])) as u8)
        .collect()
}

pub fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use core::fmt::Write;
        let _ = write!(s, "{:02x}", b);
    }
    s
}

pub fn normalize_hex(s: &str) -> String {
    if let Some(rest) = s.strip_prefix("0x") {
        format!("0x{}", lc_js(rest))
    } else {
        format!("0x{}", lc_js(s))
    }
}