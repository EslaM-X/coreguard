// CoreGuard WS-3 independent verifier — self-contained Rust implementation.
// Re-derives the CGEP/1 authorization chain (canonicalize -> refs -> scope ->
// authority) in WASM, independent of the JS reference. Zero external crates,
// zero runtime environment imports. Transport/marshalling lives in the JS
// wrapper (index.js); this module never evaluates a protocol fact by itself
// except through its own byte-exact re-derivation.

mod hex;
mod json;
mod keccak;
mod secp;
mod sha256;

use core::cell::UnsafeCell;
use json::{o, s, Value};

const FW_DECISION_DOMAIN: &str = "CGEP/1:FW-DECISION";
const FW_DECISION_RECORD_VERSION: &str = "CGEP/1:FW-DECISION/1";
const RECORD_KIND: &str = "DECISION";
const DECLARATION_KIND: &str = "INTENT_DECLARATION";
const BINDING_DOMAIN: &str = "CGEP/1:FW-BINDING";
const PROVENANCE_DOMAIN: &str = "CGEP/1:AGENT-PROVENANCE";
const INTENT_DOMAIN: &str = "CGEP/1:INTENT";

const EIP712_DOMAIN_NAME: &str = "CoreGuard AgentProof";
const EIP712_DOMAIN_VERSION: &str = "1";
const EIP712_DOMAIN_TYPE: &str = "EIP712Domain(string name,string version,uint256 chainId)";
const MANIFEST_PRIMARY_TYPE: &str = "ManifestDeclaration(bytes32 manifestId)";
const ERC1271_MAGIC: &str = "0x1626ba7e";
const ERC1271_FN_SIG: &str = "isValidSignature(bytes32,bytes)";

const MAX_SAFE_INT_F64: f64 = 9007199254740991.0;

const EXECUTION_EVIDENCE_KEYS: [&str; 7] = [
    "executionRef",
    "executionBinding",
    "CONTRACT_AUTHORIZATION",
    "CONTRACT_EXECUTION_BINDING",
    "executionBlock",
    "txHash",
    "receipt",
];

struct OutputCell(UnsafeCell<Vec<u8>>);
unsafe impl Sync for OutputCell {}

static OUTPUT: OutputCell = OutputCell(UnsafeCell::new(Vec::new()));

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, len);
    }
}

#[no_mangle]
pub extern "C" fn verify(ptr: *const u8, len: usize) -> usize {
    store_output(dispatch(unsafe { read_input(ptr, len) }, false))
}

#[no_mangle]
pub extern "C" fn canon(ptr: *const u8, len: usize) -> usize {
    store_output(dispatch(unsafe { read_input(ptr, len) }, true))
}

#[no_mangle]
pub extern "C" fn output_ptr() -> *const u8 {
    unsafe {
        OUTPUT
            .0
            .get()
            .as_ref()
            .map(|v| v.as_ptr())
            .unwrap_or(core::ptr::null())
    }
}

#[no_mangle]
pub extern "C" fn output_len() -> usize {
    unsafe { OUTPUT.0.get().as_ref().map(|v| v.len()).unwrap_or(0) }
}

fn store_output(v: Vec<u8>) -> usize {
    unsafe {
        let slot = OUTPUT.0.get();
        *slot = v;
        (*slot).len()
    }
}

unsafe fn read_input<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    core::slice::from_raw_parts(ptr, len)
}

fn dispatch(outer: &[u8], canonical_only: bool) -> Vec<u8> {
    let input = String::from_utf8_lossy(outer);
    let parsed = match json::parse_json(&input) {
        Ok(v) => v,
        Err(e) => {
            return json::serialize(&o(vec![
                ("kind", s("input_error")),
                ("message", s(format!("invalid JSON input: {}", e))),
            ]))
            .into_bytes();
        }
    };
    if canonical_only {
        return canon_top(&parsed).into_bytes();
    }
    match pipeline(&parsed) {
        Ok(v) => json::serialize(&v).into_bytes(),
        Err(p) => json::serialize(&pipe_to_value(p)).into_bytes(),
    }
}

fn canon_top(outer: &Value) -> String {
    match canonicalize(outer) {
        Ok(c) => json::serialize(&o(vec![("ok", Value::Bool(true)), ("value", s(c))])),
        Err(e) => json::serialize(&o(vec![("ok", Value::Bool(false)), ("error", s(e.0))])),
    }
}

fn field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key)
}

// ---------------------------------------------------------------------------
// JS semantics emulation
// ---------------------------------------------------------------------------

fn js_falsy(v: Option<&Value>) -> bool {
    match v {
        None => true,
        Some(Value::Null) => true,
        Some(Value::Bool(b)) => !b,
        Some(Value::Num(n)) => *n == 0.0,
        Some(Value::Str(s)) => s.is_empty(),
        Some(_) => false,
    }
}

fn js_truthy(v: Option<&Value>) -> bool {
    !js_falsy(v)
}

fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        Value::Num(n) => json::fmt_f64(*n),
        Value::Str(x) => x.clone(),
        Value::Arr(a) => {
            if a.is_empty() {
                String::new()
            } else {
                a.iter().map(js_string).collect::<Vec<_>>().join(",")
            }
        }
        Value::Obj(_) => "[object Object]".to_string(),
    }
}

fn js_string_or_empty(v: Option<&Value>) -> String {
    if js_falsy(v) {
        String::new()
    } else {
        js_string(v.unwrap())
    }
}

fn js_string_nullish(v: Option<&Value>) -> String {
    match v {
        None => String::new(),
        Some(Value::Null) => String::new(),
        Some(x) => js_string(x),
    }
}

// ---------------------------------------------------------------------------
// Canonicalizer (byte-exact to the JS canonicalize reference)
// ---------------------------------------------------------------------------

struct CanonError(String);

fn canonicalize(v: &Value) -> Result<String, CanonError> {
    match v {
        Value::Null => Ok("null".to_string()),
        Value::Bool(b) => Ok(if *b { "true".to_string() } else { "false".to_string() }),
        Value::Num(n) => {
            let x = *n;
            if x == 0.0 {
                return Ok("0".to_string());
            }
            if !x.is_finite() {
                return Err(CanonError("Unsafe JS Number Infinity: pass large integers as canonical decimal strings (CGEP/1 uint)".to_string()));
            }
            if x.fract() != 0.0 {
                return Err(CanonError("Non-integer numbers not supported".to_string()));
            }
            if x.abs() > MAX_SAFE_INT_F64 {
                return Err(CanonError(format!(
                    "Unsafe JS Number {}: pass large integers as canonical decimal strings (CGEP/1 uint)",
                    json::fmt_f64(x)
                )));
            }
            Ok(json::fmt_f64(x))
        }
        Value::Str(s) => {
            if s.starts_with("0x") {
                Ok(js_quote(&hex::lc_js(s)))
            } else {
                Ok(js_quote(s))
            }
        }
        Value::Arr(a) => {
            let mut out = String::from("[");
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonicalize(e)?);
            }
            out.push(']');
            Ok(out)
        }
        Value::Obj(m) => {
            let mut out = String::from("{");
            let idx = v.sorted_object_indices();
            for (i, &pos) in idx.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let (k, val) = &m[pos];
                out.push_str(&js_quote(k));
                out.push(':');
                out.push_str(&canonicalize(val)?);
            }
            out.push('}');
            Ok(out)
        }
    }
}

fn js_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{0009}' => out.push_str("\\t"),
            '\u{000a}' => out.push_str("\\n"),
            '\u{000c}' => out.push_str("\\f"),
            '\u{000d}' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => {
                use core::fmt::Write;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn domain_hash(domain: &str, data: &str) -> String {
    let mut input = Vec::with_capacity(domain.len() + data.len());
    input.extend_from_slice(domain.as_bytes());
    input.extend_from_slice(data.as_bytes());
    format!("0x{}", hex::hex_encode(&sha256::sha256(&input)))
}

fn sha256_domain_hash(domain: &str, value: &Value) -> Result<String, CanonError> {
    Ok(domain_hash(domain, &canonicalize(value)?))
}

fn declaration_core(declaration: &Value) -> Value {
    let mut m: Vec<(String, Value)> = Vec::new();
    if let Value::Obj(decl) = declaration {
        for (k, v) in decl.iter() {
            if k == "manifestId" || k == "signature" || k == "commit" {
                continue;
            }
            m.push((k.clone(), v.clone()));
        }
    }
    Value::Obj(m)
}

fn manifest_id(declaration: &Value) -> Result<String, CanonError> {
    sha256_domain_hash(PROVENANCE_DOMAIN, &declaration_core(declaration))
}

fn record_decision_ref(record: &Value) -> Result<String, CanonError> {
    let mut m: Vec<(String, Value)> = Vec::new();
    if let Value::Obj(rec) = record {
        for (k, v) in rec.iter() {
            if k == "decisionRef" {
                continue;
            }
            m.push((k.clone(), v.clone()));
        }
    }
    sha256_domain_hash(FW_DECISION_DOMAIN, &Value::Obj(m))
}

fn scope_of_intent(intent: &Value) -> Value {
    let get = |k: &str| field(intent, k).cloned().unwrap_or(Value::Null);
    o(vec![
        ("chainId", get("chainId")),
        ("validAfter", get("validAfter")),
        ("validUntil", get("validUntil")),
        ("target", get("target")),
        ("selector", get("selector")),
        ("asset", get("asset")),
        ("amount", get("amount")),
        ("recipient", get("recipient")),
    ])
}

fn address_re(s: &str) -> bool {
    s.len() == 42 && s.starts_with("0x") && hex::hex_chars(&s[2..])
}

fn hex64_re(s: &str) -> bool {
    s.len() == 64 && hex::hex_chars(s)
}

fn decimal_re(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

fn all_zero(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b == b'0')
}

fn signature_envelope_ok(signature: &Value, kind: &str) -> Result<(), String> {
    if !matches!(signature, Value::Obj(_)) {
        return Err("declaration.signature is required".to_string());
    }
    let signer = js_string_or_empty(field(signature, "signer"));
    if !address_re(&signer) {
        return Err("signature.signer must be an address".to_string());
    }
    match field(signature, "scheme").and_then(Value::as_str) {
        Some("EIP-712") => {
            if kind == "EIP1271" {
                return Err("EIP-712 envelope with kind EIP1271".to_string());
            }
            let r = js_string_or_empty(field(signature, "r"));
            let s_val = js_string_or_empty(field(signature, "s"));
            if !hex64_re(&r) || !hex64_re(&s_val) {
                return Err("r/s must each be 32 bytes of hex".to_string());
            }
            if all_zero(&r) || all_zero(&s_val) {
                return Err("r/s must be non-zero".to_string());
            }
            match field(signature, "v").and_then(Value::as_f64) {
                Some(v) if (v == 27.0 || v == 28.0) => Ok(()),
                _ => Err("v must be 27 or 28".to_string()),
            }
        }
        Some("EIP-1271") => {
            if kind != "EIP1271" {
                return Err("EIP-1271 envelope requires kind EIP1271".to_string());
            }
            let bytes = match field(signature, "bytes") {
                Some(Value::Str(b)) => b.clone(),
                _ => String::new(),
            };
            if !hex::is_even_hex0x(&bytes) {
                return Err("signature.bytes must be even-length 0x hex".to_string());
            }
            Ok(())
        }
        _ => Err("signature.scheme must be \"EIP-712\" or \"EIP-1271\"".to_string()),
    }
}

struct SemanticRefs {
    status: String,
    label: String,
    reason: Option<String>,
    semantics: Option<Value>,
    instance: Option<Value>,
    binding_ref: Option<String>,
    kind: String,
}

fn build_authorization(intent: &Value, declaration: &Value) -> Result<SemanticRefs, Pipe> {
    let fail = |status: &str, label: &str, reason: &str| Ok(SemanticRefs {
        status: status.to_string(),
        label: label.to_string(),
        reason: Some(reason.to_string()),
        semantics: None,
        instance: None,
        binding_ref: None,
        kind: String::new(),
    });

    if !matches!(intent, Value::Obj(_)) {
        return fail("NOT_RUN", "INTENT_MISSING", "intent object is required");
    }
    if !matches!(declaration, Value::Obj(_)) {
        return fail("NOT_RUN", "DECLARATION_MISSING", "declaration object is required");
    }
    let version = js_string_or_empty(field(declaration, "version"));
    let kind_str = js_string_or_empty(field(declaration, "kind"));
    if version != "CGEP/1" || kind_str != DECLARATION_KIND {
        return fail(
            "NOT_PROVEN",
            "DECLARATION_INVALID",
            "declaration must be { version:\"CGEP/1\", kind:\"INTENT_DECLARATION\", ... }",
        );
    }

    let intent_ref = match sha256_domain_hash(INTENT_DOMAIN, intent) {
        Ok(x) => x,
        Err(e) => return Err(thrown("Error", e.0)),
    };

    let mut errors: Vec<String> = Vec::new();

    match field(declaration, "intent") {
        None => errors.push("declaration.intent is required (the signed intent)".to_string()),
        Some(di) if !matches!(di, Value::Obj(_)) => {
            errors.push("declaration.intent is required (the signed intent)".to_string());
        }
        Some(di) => {
            let a = canonicalize(di).map_err(|e| thrown("Error", e.0))?;
            let b = canonicalize(intent).map_err(|e| thrown("Error", e.0))?;
            if a != b {
                errors.push("declared intent != supplied intent (canonical mismatch)".to_string());
            }
        }
    }

    if js_string_or_empty(field(declaration, "chainId"))
        != js_string_or_empty(field(intent, "chainId"))
    {
        errors.push("declaration.chainId != intent.chainId".to_string());
    }
    if js_string_nullish(field(declaration, "nonce")) != js_string_nullish(field(intent, "nonce")) {
        errors.push("declaration.nonce != intent.nonce".to_string());
    }

    let signer_binding = field(declaration, "signerBinding").cloned().unwrap_or(Value::Null);
    let kind = if js_string_or_empty(field(&signer_binding, "kind")) == "EIP1271" {
        "EIP1271"
    } else {
        "EOA"
    };
    let sb_addr = js_string_or_empty(field(&signer_binding, "address"));
    if !address_re(&sb_addr) {
        errors.push("signerBinding.address must be an address".to_string());
    } else if hex::lc_js(&sb_addr) != hex::lc_js(&js_string_or_empty(field(intent, "signer"))) {
        errors.push("signerBinding.address != intent.signer".to_string());
    }

    let sig = field(declaration, "signature").cloned().unwrap_or(Value::Null);
    if let Err(reason) = signature_envelope_ok(&sig, kind) {
        errors.push(format!("signature: {}", reason));
    }

    let mut manifest_id_val: Option<String> = None;
    match manifest_id(declaration) {
        Ok(mid) => {
            manifest_id_val = Some(mid.clone());
            if hex::lc_js(&js_string_or_empty(field(declaration, "manifestId"))) != mid {
                errors.push(format!(
                    "declaration.manifestId != recomputed manifestId ({})",
                    mid
                ));
            }
        }
        Err(_) => {
            errors.push("declaration is not canonicalizable".to_string());
        }
    }

    let binding_ref = match bind_ref_value(&intent_ref, &manifest_id_val, &sig) {
        Ok(x) => x,
        Err(e) => return Err(thrown("Error", e.0)),
    };

    let mut semantics_map: Vec<(String, Value)> = Vec::new();
    semantics_map.push(("intentRef".to_string(), s(&intent_ref)));
    semantics_map.push(("chainId".to_string(), s(js_string_or_empty(field(intent, "chainId")))));
    semantics_map.push(("nonce".to_string(), s(js_string_nullish(field(intent, "nonce")))));
    semantics_map
        .push(("signer".to_string(), s(hex::lc_js(&js_string_or_empty(field(intent, "signer"))))));
    semantics_map.push(("scope".to_string(), scope_of_intent(intent)));
    if let Some(mid) = &manifest_id_val {
        semantics_map.push(("manifestId".to_string(), s(mid.clone())));
    }
    let semantics = Value::Obj(semantics_map);

    let mut instance_map: Vec<(String, Value)> = Vec::new();
    instance_map.push(("bindingRef".to_string(), s(binding_ref.clone())));
    if matches!(sig, Value::Obj(_)) {
        instance_map.push(("signature".to_string(), sig.clone()));
    }
    let instance_val = Value::Obj(instance_map);

    if !errors.is_empty() {
        return Ok(SemanticRefs {
            status: "NOT_PROVEN".into(),
            label: "DECLARATION_NOT_BOUND".into(),
            reason: Some(errors.join("; ")),
            semantics: Some(semantics),
            instance: Some(instance_val),
            binding_ref: Some(binding_ref),
            kind: kind.to_string(),
        });
    }

    Ok(SemanticRefs {
        status: "OK".into(),
        label: "BOUND".into(),
        reason: None,
        semantics: Some(semantics),
        instance: Some(instance_val),
        binding_ref: Some(binding_ref),
        kind: kind.to_string(),
    })
}

fn bind_ref_value(
    intent_ref: &str,
    manifest_id_val: &Option<String>,
    signature: &Value,
) -> Result<String, CanonError> {
    let mut m: Vec<(String, Value)> = Vec::new();
    m.push(("intentRef".to_string(), s(intent_ref.to_string())));
    m.push((
        "manifestId".to_string(),
        manifest_id_val.clone().map(s).unwrap_or(Value::Null),
    ));
    m.push(("signature".to_string(), signature.clone()));
    sha256_domain_hash(BINDING_DOMAIN, &Value::Obj(m))
}

fn recomputed_of(semantics: &Option<Value>, instance: &Option<Value>) -> Value {
    let (Some(sem), Some(inst)) = (semantics, instance) else {
        return Value::Null;
    };
    let mut m: Vec<(String, Value)> = Vec::new();
    if let Some(Value::Str(x)) = field(sem, "intentRef") {
        m.push(("intentRef".to_string(), s(x.clone())));
    }
    if let Some(Value::Str(x)) = field(sem, "manifestId") {
        m.push(("manifestId".to_string(), s(x.clone())));
    }
    if let Some(Value::Str(x)) = field(inst, "bindingRef") {
        m.push(("bindingRef".to_string(), s(x.clone())));
    }
    Value::Obj(m)
}

struct ScopeResult {
    ok: bool,
    status: String,
    label: String,
    reason: String,
    execution_scope: Option<Value>,
    decision_ref: Option<String>,
}

fn scope_from_frozen_record(intent: &Value, frozen_record: &Value) -> ScopeResult {
    if !matches!(frozen_record, Value::Obj(_)) {
        return ScopeResult {
            ok: false,
            status: "NOT_RUN".into(),
            label: "DECISION_RECORD_MISSING".into(),
            reason: "authoritative frozen decision record is required (FSR-1) — without it executionScope cannot be derived".into(),
            execution_scope: None,
            decision_ref: None,
        };
    }
    let version = js_string_or_empty(field(frozen_record, "version"));
    let kind = js_string_or_empty(field(frozen_record, "kind"));
    if version != FW_DECISION_RECORD_VERSION || kind != RECORD_KIND {
        return ScopeResult {
            ok: false,
            status: "NOT_RUN".into(),
            label: "DECISION_RECORD_INVALID".into(),
            reason: format!(
                "frozenRecord must be {{ version: \"{}\", kind: \"{}\", ... }}",
                FW_DECISION_RECORD_VERSION, RECORD_KIND
            ),
            execution_scope: None,
            decision_ref: None,
        };
    }

    let decision_ref = match record_decision_ref(frozen_record) {
        Ok(d) => d,
        Err(e) => {
            return ScopeResult {
                ok: false,
                status: "NOT_RUN".into(),
                label: "DECISION_RECORD_INVALID".into(),
                reason: format!("decision record is not canonicalizable: {}", e.0),
                execution_scope: None,
                decision_ref: None,
            };
        }
    };

    let declared_lc = hex::lc_js(&js_string_or_empty(field(frozen_record, "decisionRef")));
    if !declared_lc.starts_with("0x") || declared_lc != decision_ref {
        return ScopeResult {
            ok: false,
            status: "NOT_RUN".into(),
            label: "DECISION_RECORD_INVALID".into(),
            reason: "frozenRecord.decisionRef != H(CGEP/1:FW-DECISION, record) — content-address mismatch".into(),
            execution_scope: None,
            decision_ref: None,
        };
    }

    let record_scope = match field(frozen_record, "binding") {
        Some(Value::Obj(b)) => b
            .iter()
            .find(|(k, _)| k == "executionScope")
            .map(|(_, v)| v.clone()),
        _ => None,
    };
    let record_scope = match record_scope {
        Some(v @ Value::Obj(_)) => v,
        _ => {
            return ScopeResult {
                ok: false,
                status: "NOT_PROVEN".into(),
                label: "SCOPE_MISMATCH".into(),
                reason: "frozen record carries no binding.executionScope; cannot derive a scope (WS-1 SIA-I3)".into(),
                execution_scope: None,
                decision_ref: None,
            };
        }
    };

    match (canonicalize(&record_scope), canonicalize(&scope_of_intent(intent))) {
        (Ok(a), Ok(b)) if a != b => ScopeResult {
            ok: false,
            status: "NOT_PROVEN".into(),
            label: "SCOPE_MISMATCH".into(),
            reason: "frozen record binding.executionScope != predicted scopeOfIntent(intent) — byte identity violated (WS-1 SIA-I3)".into(),
            execution_scope: None,
            decision_ref: None,
        },
        (Err(e), _) | (_, Err(e)) => ScopeResult {
            ok: false,
            status: "NOT_RUN".into(),
            label: "DECISION_RECORD_INVALID".into(),
            reason: format!("executionScope is not canonicalizable: {}", e.0),
            execution_scope: None,
            decision_ref: None,
        },
        _ => ScopeResult {
            ok: true,
            status: "OK".into(),
            label: String::new(),
            reason: String::new(),
            execution_scope: Some(record_scope),
            decision_ref: Some(decision_ref),
        },
    }
}

fn encode_uint256(value: u128) -> [u8; 32] {
    let mut out = [0u8; 32];
    let be = value.to_be_bytes();
    out[16..].copy_from_slice(&be);
    out
}

fn domain_separator(chain_id: &str) -> Result<Vec<u8>, String> {
    let chain = json::bigint_parse_js(chain_id)?;
    let mut parts = Vec::new();
    parts.extend_from_slice(&keccak(EIP712_DOMAIN_TYPE.as_bytes()));
    parts.extend_from_slice(&keccak(EIP712_DOMAIN_NAME.as_bytes()));
    parts.extend_from_slice(&keccak(EIP712_DOMAIN_VERSION.as_bytes()));
    parts.extend_from_slice(&encode_uint256(chain));
    Ok(keccak(&parts).to_vec())
}

fn keccak(data: &[u8]) -> [u8; 32] {
    keccak::keccak256(data)
}

fn manifest_digest(manifest_id: &str, chain_id: &str) -> Result<Vec<u8>, String> {
    let mid = manifest_id.strip_prefix("0x").unwrap_or(manifest_id);
    if mid.len() != 64 || !hex::hex_chars(mid) {
        return Err("manifestId must be a 0x 32-byte hex string".to_string());
    }
    let mut struct_input = Vec::new();
    struct_input.extend_from_slice(&keccak(MANIFEST_PRIMARY_TYPE.as_bytes()));
    struct_input.extend_from_slice(&hex::hex_bytes(mid));
    let struct_hash = keccak(&struct_input);
    let mut pre = vec![0x19u8, 0x01u8];
    pre.extend_from_slice(&domain_separator(chain_id)?);
    pre.extend_from_slice(&struct_hash);
    Ok(keccak(&pre).to_vec())
}

fn recover_signer_address(digest: &[u8], r: &str, s: &str, v: f64) -> Result<String, String> {
    if digest.len() != 32 {
        return Err("recover: digest must be 32 bytes".to_string());
    }
    let rb = hex::hex_bytes(r);
    let sb = hex::hex_bytes(s);
    if rb.len() != 32 || sb.len() != 32 {
        return Err("recover: r/s invalid length".to_string());
    }
    let mut d32 = [0u8; 32];
    let mut ra = [0u8; 32];
    let mut sa = [0u8; 32];
    d32.copy_from_slice(digest);
    ra.copy_from_slice(&rb);
    sa.copy_from_slice(&sb);
    secp::recover_signer_address(&d32, &ra, &sa, v as u8)
}

fn erc1271_selector() -> [u8; 4] {
    let h = keccak(ERC1271_FN_SIG.as_bytes());
    [h[0], h[1], h[2], h[3]]
}

fn is_valid_signature_calldata(digest: &str, signature_hex: &str) -> Result<String, String> {
    let dig = hex::normalize_hex(digest);
    if !(dig.len() == 66 && dig.starts_with("0x") && hex::hex_chars(&dig[2..])) {
        return Err("erc1271: digest must be a 0x 32-byte hex string".to_string());
    }
    let sig = hex::normalize_hex(signature_hex);
    if !hex::is_even_hex0x(&sig) {
        return Err("erc1271: signature must be an even-length 0x hex string".to_string());
    }
    let sig_bytes = hex::hex_bytes(&sig);
    let pad = (32 - (sig_bytes.len() % 32)) % 32;
    let mut data = Vec::new();
    data.extend_from_slice(&erc1271_selector());
    data.extend_from_slice(&hex::hex_bytes(&dig));
    data.extend_from_slice(&encode_uint256(0x40));
    data.extend_from_slice(&encode_uint256(sig_bytes.len() as u128));
    if !sig_bytes.is_empty() {
        data.extend_from_slice(&sig_bytes);
        data.extend_from_slice(&vec![0u8; pad]);
    }
    Ok(format!("0x{}", hex::hex_encode(&data)))
}

fn decode_magic(ret_hex: &str) -> Option<String> {
    let body = hex::normalize_hex(ret_hex).strip_prefix("0x").unwrap_or("").to_string();
    if body.is_empty() || !hex::hex_chars(&body) || body.len() < 8 {
        return None;
    }
    Some(format!("0x{}", &body[..8]))
}

fn is_magic(ret_hex: &str) -> bool {
    decode_magic(ret_hex).as_deref() == Some(ERC1271_MAGIC)
}

enum Pipe {
    Refused(String),
    Thrown(String, String),
    InputError(String),
}

fn thrown(ty: &str, msg: String) -> Pipe {
    Pipe::Thrown(ty.to_string(), msg)
}

fn pipe_to_value(pipe: Pipe) -> Value {
    match pipe {
        Pipe::Refused(r) => {
            o(vec![("mode", s("refused")), ("reason", s(r))])
        }
        Pipe::Thrown(ty, msg) => o(vec![
            ("kind", s("throw")),
            ("type", s(ty)),
            ("message", s(msg)),
        ]),
        Pipe::InputError(m) => o(vec![("kind", s("input_error")), ("message", s(m))]),
    }
}

fn need_code(address: &str, block: &str) -> Value {
    o(vec![
        ("mode", s("needs_witness")),
        (
            "need",
            o(vec![
                ("kind", s("getCode")),
                ("address", s(address)),
                ("block", s(block)),
            ]),
        ),
    ])
}

fn need_eth_call(to: &str, data: &str, block: &str, from: Option<&str>) -> Value {
    let mut need: Vec<(String, Value)> = Vec::new();
    need.push(("kind".to_string(), s("ethCall")));
    need.push(("to".to_string(), s(to)));
    need.push(("data".to_string(), s(data)));
    need.push(("block".to_string(), s(block)));
    if let Some(f) = from {
        need.push(("from".to_string(), s(f)));
    }
    o(vec![("mode", s("needs_witness")), ("need", Value::Obj(need))])
}

fn auth_value(
    status: &str,
    label: &str,
    reason: Option<Value>,
    path: &str,
    at_state: &Option<Value>,
) -> Value {
    let mut m: Vec<(String, Value)> = Vec::new();
    m.push(("status".to_string(), s(status)));
    m.push(("label".to_string(), s(label)));
    if let Some(r) = reason {
        m.push(("reason".to_string(), r));
    }
    m.push(("path".to_string(), s(path)));
    m.push(("atState".to_string(), at_state.clone().unwrap_or(Value::Null)));
    Value::Obj(m)
}

fn result_map(
    status: &str,
    label: &str,
    reason: Value,
    stage: Value,
    recomputed: Value,
    semantics: Value,
    instance: Value,
    scope: &ScopeResult,
) -> Value {
    o(vec![
        ("status", s(status)),
        ("label", s(label)),
        ("reason", reason),
        ("stage", stage),
        ("recomputed", recomputed),
        ("semantics", semantics),
        ("instance", instance),
        (
            "executionScope",
            scope.execution_scope.clone().unwrap_or(Value::Null),
        ),
        (
            "decisionRef",
            scope.decision_ref.clone().map(s).unwrap_or(Value::Null),
        ),
        ("authority", Value::Null),
    ])
}

fn pipeline(outer: &Value) -> Result<Value, Pipe> {
    if !matches!(outer, Value::Obj(_)) {
        return Err(Pipe::InputError("input must be a JSON object".to_string()));
    }

    for key in EXECUTION_EVIDENCE_KEYS {
        if field(outer, key).is_some() {
            return Err(Pipe::Refused(format!(
                "execution evidence ({}) is structurally refused at the pre-execution seam (Q-FW10 / Q-W3-6)",
                key
            )));
        }
    }

    let intent = field(outer, "intent").cloned().unwrap_or(Value::Null);
    let declaration = field(outer, "declaration").cloned().unwrap_or(Value::Null);
    let frozen_record = field(outer, "frozenRecord").cloned().unwrap_or(Value::Null);
    let caller_binding_ref = field(outer, "callerBindingRef").cloned();
    let authority_at_state = field(outer, "authorityAtState").cloned();
    let from = field(outer, "from").cloned();
    let transport = field(outer, "transport").cloned().unwrap_or(Value::Null);
    let witness = field(outer, "witness").cloned().unwrap_or(Value::Null);

    let binding = build_authorization(&intent, &declaration)?;
    if binding.status != "OK" {
        let created = ScopeResult {
            ok: false,
            status: String::new(),
            label: String::new(),
            reason: String::new(),
            execution_scope: None,
            decision_ref: None,
        };
        return Ok(result_map(
            &binding.status,
            &binding.label,
            pair_to_value(binding.reason),
            s("binding"),
            recomputed_of(&binding.semantics, &binding.instance),
            binding.semantics.unwrap_or(Value::Null),
            binding.instance.unwrap_or(Value::Null),
            &created,
        ));
    }

    let semantics = binding.semantics.unwrap_or(Value::Null);
    let instance = binding.instance.unwrap_or(Value::Null);
    let recomputed = recomputed_of(&Some(semantics.clone()), &Some(instance.clone()));
    let binding_ref = binding.binding_ref.unwrap_or_default();

    if let Some(cbr) = &caller_binding_ref {
        if !matches!(cbr, Value::Null) && hex::lc_js(&js_string(cbr)) != binding_ref {
            let created = ScopeResult {
                ok: false,
                status: String::new(),
                label: String::new(),
                reason: String::new(),
                execution_scope: None,
                decision_ref: None,
            };
            return Ok(result_map(
                "NOT_PROVEN",
                "BINDING_REFERENCE_MISMATCH",
                s("caller-supplied bindingRef != recomputed bindingRef (reference-only; FSR-2)"),
                s("reference"),
                recomputed.clone(),
                semantics.clone(),
                instance.clone(),
                &created,
            ));
        }
    }

    let scope = scope_from_frozen_record(&intent, &frozen_record);
    if !scope.ok {
        return Ok(result_map(
            &scope.status,
            &scope.label,
            s(scope.reason.clone()),
            s("scope"),
            recomputed.clone(),
            semantics.clone(),
            instance.clone(),
            &scope,
        ));
    }

    let authority =
        probe_authority(&binding.kind, &declaration, &authority_at_state, &from, &transport, &witness)?;

    match authority {
        AuthRef::NeedsWitness(n) => Ok(n),
        AuthRef::Value(a) => {
            let status = field(&a, "status").and_then(Value::as_str).unwrap_or("").to_string();
            if status != "OK" {
                let mut m = result_map(
                    &status,
                    field(&a, "label").and_then(Value::as_str).unwrap_or(""),
                    field(&a, "reason").cloned().unwrap_or(Value::Null),
                    s("authority"),
                    recomputed.clone(),
                    semantics.clone(),
                    instance.clone(),
                    &scope,
                );
                m.insert("authority", a);
                Ok(m)
            } else {
                let mut m = result_map(
                    "OK",
                    "BOUND",
                    Value::Null,
                    Value::Null,
                    recomputed,
                    semantics,
                    instance,
                    &scope,
                );
                m.insert("authority", a);
                Ok(m)
            }
        }
    }
}

fn pair_to_value(v: Option<String>) -> Value {
    v.map(s).unwrap_or(Value::Null)
}

enum AuthRef {
    Value(Value),
    NeedsWitness(Value),
}

fn probe_authority(
    kind: &str,
    declaration: &Value,
    authority_at_state: &Option<Value>,
    from: &Option<Value>,
    transport: &Value,
    witness: &Value,
) -> Result<AuthRef, Pipe> {
    let path = if kind == "EIP1271" { "EIP1271" } else { "EOA" };
    // Reference: atState: authorityAtState || null (raw value, JS truthiness).
    let at_state = authority_at_state.clone().filter(|v| js_truthy(Some(v)));

    let signer_binding = field(declaration, "signerBinding").cloned().unwrap_or(Value::Null);
    let sb_addr = field(&signer_binding, "address").cloned().unwrap_or(Value::Null);
    if !address_re(&js_string_or_empty(Some(&sb_addr))) {
        return Ok(AuthRef::Value(auth_value(
            "NOT_PROVEN",
            "INVALID_AUTHORITY",
            Some(s("signerBinding.address must be an address")),
            path,
            &at_state,
        )));
    }
    let address = js_string(&sb_addr);

    if kind != "EIP1271" {
        let sig = field(declaration, "signature").cloned().unwrap_or(Value::Null);
        let r = js_string_or_empty(field(&sig, "r"));
        let s_val = js_string_or_empty(field(&sig, "s"));
        let v_num = field(&sig, "v").and_then(Value::as_f64).unwrap_or(-1.0);
        let malformed = !hex64_re(&r)
            || !hex64_re(&s_val)
            || all_zero(&r)
            || all_zero(&s_val)
            || (v_num != 27.0 && v_num != 28.0);
        if malformed {
            return Ok(AuthRef::Value(auth_value(
                "NOT_PROVEN",
                "SIG_MALFORMED",
                Some(s("EIP-712 envelope malformed")),
                path,
                &at_state,
            )));
        }
        let manifest_id = js_string_or_empty(field(declaration, "manifestId"));
        let chain_id = js_string_or_empty(field(declaration, "chainId"));
        let declared_addr = js_string_or_empty(field(&signer_binding, "address"));
        let digest = manifest_digest(&manifest_id, &chain_id);
        let recovered = digest.and_then(|d| recover_signer_address(&d, &r, &s_val, v_num));
        return Ok(AuthRef::Value(match recovered {
            Ok(signer) if hex::lc_js(&signer) == hex::lc_js(&declared_addr) => {
                auth_value("OK", "RECOVERED_SIGNER", None, path, &at_state)
            }
            Ok(signer) => auth_value(
                "NOT_PROVEN",
                "SIGNER_MISMATCH",
                Some(s(format!("recovered {} != declared {}", signer, declared_addr))),
                path,
                &at_state,
            ),
            Err(e) => auth_value("NOT_PROVEN", "RECOVERY_THREW", Some(s(e)), path, &at_state),
        }));
    }

    let transport_available = match transport {
        Value::Obj(m) => m
            .iter()
            .find(|(k, _)| k == "available")
            .and_then(|(_, v)| v.as_bool())
            == Some(true),
        _ => false,
    };
    if !transport_available {
        return Ok(AuthRef::Value(auth_value(
            "NOT_RUN",
            "NO_PROVIDERS",
            Some(s("no injected contractAuth { ethCall, getCode }")),
            "EIP1271",
            &at_state,
        )));
    }

    // Reference: authorityAtState must be a decimal STRING (not a number).
    let authority_state: Value = match at_state.clone() {
        Some(Value::Str(block)) if decimal_re(&block) => Value::Str(block),
        _ => {
            return Ok(AuthRef::Value(auth_value(
                "NOT_RUN",
                "NO_AUTHORITY_STATE",
                Some(s("decision-time state required; no latest fallback")),
                "EIP1271",
                &None,
            )));
        }
    };
    let block_str = authority_state.as_str().unwrap_or("").to_string();

    let sig_bytes = match field(declaration, "signature") {
        Some(sig) => match field(sig, "bytes") {
            Some(Value::Str(b)) => b.clone(),
            _ => String::from("0x"),
        },
        _ => String::from("0x"),
    };
    let manifest_id = js_string_or_empty(field(declaration, "manifestId"));
    let chain_id = js_string_or_empty(field(declaration, "chainId"));
    let at_state_block = Some(authority_state.clone());

    let calldata_lazy = || -> Result<(String, String), String> {
        let digest = manifest_digest(&manifest_id, &chain_id)?;
        let digest_hex = format!("0x{}", hex::hex_encode(&digest));
        let calldata = is_valid_signature_calldata(&digest_hex, &sig_bytes)?;
        Ok((digest_hex, calldata))
    };

    if field(witness, "ethCall").is_some() {
        let (digest_hex, calldata) = match calldata_lazy() {
            Ok(x) => x,
            Err(e) => {
                return Ok(AuthRef::Value(auth_value(
                    "NOT_PROVEN",
                    "CALDATA_ERROR",
                    Some(s(e)),
                    "EIP1271",
                    &at_state_block,
                )));
            }
        };
        return process_eth_call(
            &address,
            &block_str,
            from,
            witness,
            &digest_hex,
            &calldata,
        );
    }

    match field(witness, "code") {
        None => {
            let need = need_code(&address, &block_str);
            Ok(AuthRef::NeedsWitness(need))
        }
        Some(w) => {
            let expected = o(vec![
                ("kind", s("getCode")),
                ("address", s(address.clone())),
                ("block", s(block_str.clone())),
            ]);
            if field(w, "request").cloned().unwrap_or(Value::Null) != expected {
                return Err(Pipe::Refused(
                    "getCode witness request does not match the verifier's own binding".to_string(),
                ));
            }
            let result = field(w, "result").cloned().unwrap_or(Value::Null);
            match field(&result, "ok").and_then(Value::as_bool) {
                Some(false) => {
                    let msg = js_string_or_empty(field(&result, "error"));
                    Ok(AuthRef::Value(auth_value(
                        "NOT_RUN",
                        "CODE_LOOKUP_ERROR",
                        Some(s(format!("getCode threw: {}", msg))),
                        "EIP1271",
                        &at_state_block,
                    )))
                }
                Some(true) => {
                    let raw = field(&result, "value").cloned().unwrap_or(Value::Null);
                    let code = js_string_or_empty(Some(&raw));
                    let trimmed = code
                        .strip_prefix("0x")
                        .or_else(|| code.strip_prefix("0X"))
                        .unwrap_or(&code);
                    if trimmed.is_empty() {
                        Ok(AuthRef::Value(auth_value(
                            "NOT_PROVEN",
                            "NO_CODE_AT_STATE",
                            Some(s("empty code at authorityAtState (EOA under EIP1271 kind) — fails closed")),
                            "EIP1271",
                            &at_state_block,
                        )))
                    } else {
let (_digest_hex, calldata) = match calldata_lazy() {
                            Ok(x) => x,
                            Err(e) => {
                                return Ok(AuthRef::Value(auth_value(
                                    "NOT_PROVEN",
                                    "CALDATA_ERROR",
                                Some(s(e)),
                                "EIP1271",
                                &at_state_block,
                                )));
                            }
                        };
                        let from_str = from
                            .clone()
                            .filter(|f| js_truthy(Some(f)))
                            .map(|f| js_string(&f));
                        Ok(AuthRef::NeedsWitness(need_eth_call(
                            &address,
                            &calldata,
                            &block_str,
                            from_str.as_deref(),
                        )))
                    }
                }
                _ => Err(Pipe::Refused("getCode witness missing ok flag".to_string())),
            }
        }
    }
}

fn process_eth_call(
    address: &str,
    authority_state: &str,
    from: &Option<Value>,
    witness: &Value,
    digest_hex: &str,
    calldata: &str,
) -> Result<AuthRef, Pipe> {
    let _ = digest_hex;
    let eth_witness = field(witness, "ethCall").cloned().unwrap_or(Value::Null);
    let from_str = from.clone().filter(|f| js_truthy(Some(f))).map(|f| js_string(&f));
    let expected = match &from_str {
        Some(f) => o(vec![
            ("kind", s("ethCall")),
            ("to", s(address)),
            ("data", s(calldata)),
            ("block", s(authority_state)),
            ("from", s(f)),
        ]),
        None => o(vec![
            ("kind", s("ethCall")),
            ("to", s(address)),
            ("data", s(calldata)),
            ("block", s(authority_state)),
        ]),
    };
    if field(&eth_witness, "request").cloned().unwrap_or(Value::Null) != expected {
        return Err(Pipe::Refused(
            "ethCall witness request does not match the verifier's own binding".to_string(),
        ));
    }

    let result = field(&eth_witness, "result").cloned().unwrap_or(Value::Null);
    match field(&result, "ok").and_then(Value::as_bool) {
        Some(false) => {
            let msg = js_string_or_empty(field(&result, "error"));
            Ok(AuthRef::Value(auth_value(
                "NOT_RUN",
                "PROVIDER_ERROR",
                Some(s(format!("ethCall threw: {}", msg))),
                "EIP1271",
                &Some(Value::Str(authority_state.to_string())),
            )))
        }
        Some(true) => {
            let res = field(&result, "response").cloned().unwrap_or(Value::Null);
            let res_truthy = js_truthy(Some(&res));
            let res_ok = field(&res, "ok").and_then(Value::as_bool) == Some(true);
            if res_truthy && res_ok {
                let data_raw = field(&res, "data").cloned().unwrap_or(Value::Null);
                let data = if js_falsy(Some(&data_raw)) {
                    "0x".to_string()
                } else {
                    js_string(&data_raw)
                };
                if is_magic(&data) {
                    return Ok(AuthRef::Value(auth_value(
            "OK",
            "EIP1271_MAGIC",
            None,
            "EIP1271",
            &Some(Value::Str(authority_state.to_string())),
        )));
                }
                return Ok(AuthRef::Value(auth_value(
                    "NOT_PROVEN",
                    "NOT_MAGIC",
                    Some(s("return data is not the EIP-1271 magic value")),
                    "EIP1271",
                    &Some(Value::Str(authority_state.to_string())),
                )));
            }
            let code_name = if res_truthy {
                let c = field(&res, "code");
                if js_falsy(c) {
                    None
                } else {
                    Some(js_string(c.unwrap()))
                }
            } else {
                None
            };
            match code_name {
                Some(c) if c == "REVERTED" => Ok(AuthRef::Value(auth_value(
                    "NOT_PROVEN",
                    "REVERTED",
                    Some(s("isValidSignature reverted (call ran; fail-closed)")),
                    "EIP1271",
                    &Some(Value::Str(authority_state.to_string())),
                ))),
                Some(c) if c == "HISTORICAL_STATE_UNAVAILABLE" => Ok(AuthRef::Value(auth_value(
                    "NOT_RUN",
                    "HISTORICAL_STATE_UNAVAILABLE",
                    Some(s("cannot serve authorityAtState; no latest fallback")),
                    "EIP1271",
                    &Some(Value::Str(authority_state.to_string())),
                ))),
                _ => Ok(AuthRef::Value(auth_value(
                    "NOT_RUN",
                    "PROVIDER_ERROR",
                    Some(s(format!(
                        "eth_call failed: {}",
                        code_name.unwrap_or_else(|| "unknown".to_string())
                    ))),
                    "EIP1271",
                    &Some(Value::Str(authority_state.to_string())),
                ))),
            }
        }
        _ => Err(Pipe::Refused("ethCall witness missing ok flag".to_string())),
    }
}