"""Verifier C pipeline — full re-derivation of the CGEP/1 chain.

Mirrors the WS-3 Rust engine (Verifier B, ``lib.rs``) line-for-line in behavior:
canonicalize -> refs -> scope -> authority, the status/envelope vocabulary, the
fail-closed semantics, and the exact human-readable strings. Authority (EIP-1271
digest/calldata/magic) is derived from canonical inputs; the RPC witness is
injected from outside (Dec-C-5); C performs no RPC and never decides.
"""

from . import _json
from ._json import field, is_obj, is_arr, is_str, is_bool, is_num, is_null, fmt_f64, json_eq
from ._canon import (
    CanonError,
    lc_js,
    hex_chars,
    is_even_hex0x,
    hex_bytes,
    hex_encode,
    normalize_hex,
    canonicalize,
    sha256_domain_hash,
)
from ._keccak import keccak256
from ._secp import recover_signer_address as secp_recover

# Domain / EIP-712 constants (identical to B)
FW_DECISION_DOMAIN = "CGEP/1:FW-DECISION"
FW_DECISION_RECORD_VERSION = "CGEP/1:FW-DECISION/1"
RECORD_KIND = "DECISION"
DECLARATION_KIND = "INTENT_DECLARATION"
BINDING_DOMAIN = "CGEP/1:FW-BINDING"
PROVENANCE_DOMAIN = "CGEP/1:AGENT-PROVENANCE"
INTENT_DOMAIN = "CGEP/1:INTENT"

EIP712_DOMAIN_NAME = "CoreGuard AgentProof"
EIP712_DOMAIN_VERSION = "1"
EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId)"
MANIFEST_PRIMARY_TYPE = "ManifestDeclaration(bytes32 manifestId)"
ERC1271_MAGIC = "0x1626ba7e"
ERC1271_FN_SIG = "isValidSignature(bytes32,bytes)"

EXECUTION_EVIDENCE_KEYS = [
    "executionRef",
    "executionBinding",
    "CONTRACT_AUTHORIZATION",
    "CONTRACT_EXECUTION_BINDING",
    "executionBlock",
    "txHash",
    "receipt",
]


# ---------------------------------------------------------------------------
# JS semantics emulation (mirror of B)
# ---------------------------------------------------------------------------

def js_falsy(v):
    if v is None:
        return True
    if is_null(v):
        return True
    if is_bool(v):
        return not v
    if is_num(v):
        return v == 0.0
    if is_str(v):
        return v == ""
    return False


def js_truthy(v):
    return not js_falsy(v)


def js_string(v):
    if is_null(v):
        return "null"
    if is_bool(v):
        return "true" if v else "false"
    if is_num(v):
        return fmt_f64(v)
    if is_str(v):
        return v
    if is_arr(v):
        if len(v) == 0:
            return ""
        return ",".join(js_string(e) for e in v)
    return "[object Object]"


def js_string_or_empty(v):
    if js_falsy(v):
        return ""
    return js_string(v)


def js_string_nullish(v):
    if v is None:
        return ""
    if is_null(v):
        return ""
    return js_string(v)


# ---------------------------------------------------------------------------
# Shape predicates (mirror of B)
# ---------------------------------------------------------------------------

def address_re(s):
    return len(s) == 42 and s.startswith("0x") and hex_chars(s[2:])


def hex64_re(s):
    return len(s) == 64 and hex_chars(s)


def decimal_re(s):
    return s != "" and s.isascii() and s.isdigit()


def all_zero(s):
    return s != "" and s.count("0") == len(s)


# ---------------------------------------------------------------------------
# Canonicalization helpers
# ---------------------------------------------------------------------------

def declaration_core(declaration):
    m = {}
    if is_obj(declaration):
        for k, v in declaration.items():
            if k in ("manifestId", "signature", "commit"):
                continue
            m[k] = v
    return m


def manifest_id(declaration):
    return sha256_domain_hash(PROVENANCE_DOMAIN, declaration_core(declaration))


def record_decision_ref(record):
    m = {}
    if is_obj(record):
        for k, v in record.items():
            if k == "decisionRef":
                continue
            m[k] = v
    return sha256_domain_hash(FW_DECISION_DOMAIN, m)


def scope_of_intent(intent):
    return {
        "chainId": js_string_nullish(field(intent, "chainId")),
        "validAfter": js_string_nullish(field(intent, "validAfter")),
        "validUntil": js_string_nullish(field(intent, "validUntil")),
        "target": js_string_nullish(field(intent, "target")),
        "selector": js_string_nullish(field(intent, "selector")),
        "asset": js_string_nullish(field(intent, "asset")),
        "amount": js_string_nullish(field(intent, "amount")),
        "recipient": js_string_nullish(field(intent, "recipient")),
    }


def signature_envelope_ok(signature, kind):
    if not is_obj(signature):
        raise ValueError("declaration.signature is required")
    signer = js_string_or_empty(field(signature, "signer"))
    if not address_re(signer):
        raise ValueError("signature.signer must be an address")
    scheme = field(signature, "scheme")
    scheme_str = scheme if is_str(scheme) else None
    if scheme_str == "EIP-712":
        if kind == "EIP1271":
            raise ValueError("EIP-712 envelope with kind EIP1271")
        r = js_string_or_empty(field(signature, "r"))
        s_val = js_string_or_empty(field(signature, "s"))
        if not hex64_re(r) or not hex64_re(s_val):
            raise ValueError("r/s must each be 32 bytes of hex")
        if all_zero(r) or all_zero(s_val):
            raise ValueError("r/s must be non-zero")
        v = field(signature, "v")
        if not (is_num(v) and (v == 27.0 or v == 28.0)):
            raise ValueError("v must be 27 or 28")
    elif scheme_str == "EIP-1271":
        if kind != "EIP1271":
            raise ValueError("EIP-1271 envelope requires kind EIP1271")
        bytes_val = ""
        if is_obj(signature):
            b = field(signature, "bytes")
            if is_str(b):
                bytes_val = b
        if not is_even_hex0x(bytes_val):
            raise ValueError("signature.bytes must be even-length 0x hex")
    else:
        raise ValueError('signature.scheme must be "EIP-712" or "EIP-1271"')





# ---------------------------------------------------------------------------
# Binding chain
# ---------------------------------------------------------------------------

class SemanticRefs:
    def __init__(self, status, label, reason, semantics, instance, binding_ref, kind):
        self.status = status
        self.label = label
        self.reason = reason
        self.semantics = semantics
        self.instance = instance
        self.binding_ref = binding_ref
        self.kind = kind


class Pipe(Exception):
    def __init__(self, kind, type_or_message, message=None):
        super().__init__(message if message is not None else type_or_message)
        self.pipe_kind = kind  # "refused" | "throw" | "input_error"
        self.type = type_or_message if kind == "throw" else None
        self.message = message if message is not None else type_or_message


def thrown(ty, msg):
    return Pipe("throw", ty, msg)


def build_authorization(intent, declaration):
    def fail(status, label, reason):
        return SemanticRefs(status, label, reason, None, None, None, "")

    if not is_obj(intent):
        return fail("NOT_RUN", "INTENT_MISSING", "intent object is required")
    if not is_obj(declaration):
        return fail("NOT_RUN", "DECLARATION_MISSING", "declaration object is required")
    version = js_string_or_empty(field(declaration, "version"))
    kind_str = js_string_or_empty(field(declaration, "kind"))
    if version != "CGEP/1" or kind_str != DECLARATION_KIND:
        return fail(
            "NOT_PROVEN",
            "DECLARATION_INVALID",
            'declaration must be { version:"CGEP/1", kind:"INTENT_DECLARATION", ... }',
        )

    try:
        intent_ref = sha256_domain_hash(INTENT_DOMAIN, intent)
    except CanonError as e:
        raise thrown("Error", e.message)

    errors = []

    di = field(declaration, "intent")
    if di is None or not is_obj(di):
        errors.append("declaration.intent is required (the signed intent)")
    else:
        try:
            a = canonicalize(di)
            b = canonicalize(intent)
        except CanonError as e:
            raise thrown("Error", e.message)
        if a != b:
            errors.append("declared intent != supplied intent (canonical mismatch)")

    if js_string_or_empty(field(declaration, "chainId")) != js_string_or_empty(field(intent, "chainId")):
        errors.append("declaration.chainId != intent.chainId")
    if js_string_nullish(field(declaration, "nonce")) != js_string_nullish(field(intent, "nonce")):
        errors.append("declaration.nonce != intent.nonce")

    signer_binding = field(declaration, "signerBinding")
    sb_obj = signer_binding if is_obj(signer_binding) else None
    kind = "EIP1271" if js_string_or_empty(field(sb_obj, "kind")) == "EIP1271" else "EOA"
    sb_addr = js_string_or_empty(field(sb_obj, "address"))
    if not address_re(sb_addr):
        errors.append("signerBinding.address must be an address")
    elif lc_js(sb_addr) != lc_js(js_string_or_empty(field(intent, "signer"))):
        errors.append("signerBinding.address != intent.signer")

    sig = field(declaration, "signature")
    try:
        signature_envelope_ok(sig if is_obj(sig) else None, kind)
    except ValueError as e:
        errors.append("signature: {}".format(str(e)))

    manifest_id_val = None
    try:
        mid = manifest_id(declaration)
        manifest_id_val = mid
        if lc_js(js_string_or_empty(field(declaration, "manifestId"))) != mid:
            errors.append("declaration.manifestId != recomputed manifestId ({})".format(mid))
    except CanonError:
        errors.append("declaration is not canonicalizable")

    try:
        binding_ref = bind_ref_value(intent_ref, manifest_id_val, sig)
    except CanonError as e:
        raise thrown("Error", e.message)

    semantics = {
        "intentRef": str(intent_ref),
        "chainId": js_string_or_empty(field(intent, "chainId")),
        "nonce": js_string_nullish(field(intent, "nonce")),
        "signer": lc_js(js_string_or_empty(field(intent, "signer"))),
        "scope": scope_of_intent(intent),
    }
    if manifest_id_val is not None:
        semantics["manifestId"] = str(manifest_id_val)

    instance = {"bindingRef": str(binding_ref)}
    if is_obj(sig):
        instance["signature"] = sig

    if errors:
        return SemanticRefs(
            "NOT_PROVEN",
            "DECLARATION_NOT_BOUND",
            "; ".join(errors),
            semantics,
            instance,
            binding_ref,
            kind,
        )

    return SemanticRefs("OK", "BOUND", None, semantics, instance, binding_ref, kind)


def bind_ref_value(intent_ref, manifest_id_val, signature):
    m = {"intentRef": str(intent_ref)}
    if manifest_id_val is not None:
        m["manifestId"] = str(manifest_id_val)
    else:
        m["manifestId"] = None
    m["signature"] = signature if signature is not None else None
    return sha256_domain_hash(BINDING_DOMAIN, m)


def recomputed_of(semantics, instance):
    if semantics is None or instance is None or not is_obj(semantics) or not is_obj(instance):
        return None
    m = {}
    ir = field(semantics, "intentRef")
    if is_str(ir):
        m["intentRef"] = ir
    mi = field(semantics, "manifestId")
    if is_str(mi):
        m["manifestId"] = mi
    br = field(instance, "bindingRef")
    if is_str(br):
        m["bindingRef"] = br
    return m


# ---------------------------------------------------------------------------
# Scope derivation (FSR-1)
# ---------------------------------------------------------------------------

class ScopeResult:
    def __init__(self, ok, status, label, reason, execution_scope, decision_ref):
        self.ok = ok
        self.status = status
        self.label = label
        self.reason = reason
        self.execution_scope = execution_scope
        self.decision_ref = decision_ref


def scope_from_frozen_record(intent, frozen_record):
    if not is_obj(frozen_record):
        return ScopeResult(
            False,
            "NOT_RUN",
            "DECISION_RECORD_MISSING",
            "authoritative frozen decision record is required (FSR-1) — without it executionScope cannot be derived",
            None,
            None,
        )
    version = js_string_or_empty(field(frozen_record, "version"))
    kind = js_string_or_empty(field(frozen_record, "kind"))
    if version != FW_DECISION_RECORD_VERSION or kind != RECORD_KIND:
        return ScopeResult(
            False,
            "NOT_RUN",
            "DECISION_RECORD_INVALID",
            'frozenRecord must be {{ version: "{}", kind: "{}", ... }}'.format(
                FW_DECISION_RECORD_VERSION, RECORD_KIND
            ),
            None,
            None,
        )

    try:
        decision_ref = record_decision_ref(frozen_record)
    except CanonError as e:
        return ScopeResult(
            False,
            "NOT_RUN",
            "DECISION_RECORD_INVALID",
            "decision record is not canonicalizable: {}".format(e.message),
            None,
            None,
        )

    declared_lc = lc_js(js_string_or_empty(field(frozen_record, "decisionRef")))
    if not declared_lc.startswith("0x") or declared_lc != decision_ref:
        return ScopeResult(
            False,
            "NOT_RUN",
            "DECISION_RECORD_INVALID",
            "frozenRecord.decisionRef != H(CGEP/1:FW-DECISION, record) — content-address mismatch",
            None,
            None,
        )

    binding = field(frozen_record, "binding")
    record_scope = None
    if is_obj(binding):
        es = field(binding, "executionScope")
        if is_obj(es):
            record_scope = es
    if record_scope is None:
        return ScopeResult(
            False,
            "NOT_PROVEN",
            "SCOPE_MISMATCH",
            "frozen record carries no binding.executionScope; cannot derive a scope (WS-1 SIA-I3)",
            None,
            None,
        )

    try:
        a = canonicalize(record_scope)
        b = canonicalize(scope_of_intent(intent))
        if a != b:
            return ScopeResult(
                False,
                "NOT_PROVEN",
                "SCOPE_MISMATCH",
                "frozen record binding.executionScope != predicted scopeOfIntent(intent) — byte identity violated (WS-1 SIA-I3)",
                None,
                None,
            )
    except CanonError as e:
        return ScopeResult(
            False,
            "NOT_RUN",
            "DECISION_RECORD_INVALID",
            "executionScope is not canonicalizable: {}".format(e.message),
            None,
            None,
        )

    return ScopeResult(True, "OK", "", "", record_scope, decision_ref)


# ---------------------------------------------------------------------------
# EIP-712 / EIP-1271 primitives (self-derived; identical constants to B)
# ---------------------------------------------------------------------------

def encode_uint256(value):
    return value.to_bytes(32, "big")


def keccak(data):
    return keccak256(data)


def domain_separator(chain_id):
    chain = _json.bigint_parse_js(chain_id)
    parts = bytearray()
    parts.extend(keccak(EIP712_DOMAIN_TYPE.encode("ascii")))
    parts.extend(keccak(EIP712_DOMAIN_NAME.encode("ascii")))
    parts.extend(keccak(EIP712_DOMAIN_VERSION.encode("ascii")))
    parts.extend(encode_uint256(chain))
    return keccak(bytes(parts))


def manifest_digest(manifest_id_str, chain_id):
    mid = manifest_id_str[2:] if manifest_id_str.startswith("0x") else manifest_id_str
    if len(mid) != 64 or not hex_chars(mid):
        raise ValueError("manifestId must be a 0x 32-byte hex string")
    struct_input = bytearray()
    struct_input.extend(keccak(MANIFEST_PRIMARY_TYPE.encode("ascii")))
    struct_input.extend(hex_bytes(mid))
    struct_hash = keccak(bytes(struct_input))
    pre = bytearray([0x19, 0x01])
    pre.extend(domain_separator(chain_id))
    pre.extend(struct_hash)
    return keccak(bytes(pre))


def recover_signer_address(digest, r, s, v):
    if len(digest) != 32:
        raise ValueError("recover: digest must be 32 bytes")
    rb = hex_bytes(r)
    sb = hex_bytes(s)
    if len(rb) != 32 or len(sb) != 32:
        raise ValueError("recover: r/s invalid length")
    return secp_recover(digest, rb, sb, int(v))


def erc1271_selector():
    h = keccak(ERC1271_FN_SIG.encode("ascii"))
    return bytes([h[0], h[1], h[2], h[3]])


def is_valid_signature_calldata(digest, signature_hex):
    dig = normalize_hex(digest)
    if not (len(dig) == 66 and dig.startswith("0x") and hex_chars(dig[2:])):
        raise ValueError("erc1271: digest must be a 0x 32-byte hex string")
    sig = normalize_hex(signature_hex)
    if not is_even_hex0x(sig):
        raise ValueError("erc1271: signature must be an even-length 0x hex string")
    sig_bytes = hex_bytes(sig)
    pad = (32 - (len(sig_bytes) % 32)) % 32
    data = bytearray()
    data.extend(erc1271_selector())
    data.extend(hex_bytes(dig))
    data.extend(encode_uint256(0x40))
    data.extend(encode_uint256(len(sig_bytes)))
    if sig_bytes:
        data.extend(sig_bytes)
        data.extend(bytes(pad))
    return "0x" + hex_encode(bytes(data))


def decode_magic(ret_hex):
    body = normalize_hex(ret_hex)[2:]
    if body == "" or not hex_chars(body) or len(body) < 8:
        return None
    return "0x" + body[:8]


def is_magic(ret_hex):
    return decode_magic(ret_hex) == ERC1271_MAGIC


# ---------------------------------------------------------------------------
# Result envelope builders (mirror of B)
# ---------------------------------------------------------------------------

def auth_value(status, label, reason, path, at_state):
    m = {"status": str(status), "label": str(label)}
    if reason is not None:
        m["reason"] = reason
    m["path"] = str(path)
    m["atState"] = at_state if at_state is not None else None
    return m


def result_map(status, label, reason, stage, recomputed, semantics, instance, scope):
    m = {
        "status": str(status),
        "label": str(label),
        "reason": reason,
        "stage": stage,
        "recomputed": recomputed,
        "semantics": semantics,
        "instance": instance,
        "executionScope": scope.execution_scope if scope.execution_scope is not None else None,
        "decisionRef": str(scope.decision_ref) if scope.decision_ref is not None else None,
        "authority": None,
    }
    return m


def need_code(address, block):
    return {"mode": "needs_witness", "need": {"kind": "getCode", "address": str(address), "block": str(block)}}


def need_eth_call(to, data, block, from_val):
    need = {"kind": "ethCall", "to": str(to), "data": str(data), "block": str(block)}
    if from_val is not None:
        need["from"] = from_val
    return {"mode": "needs_witness", "need": need}


def pair_to_value(v):
    return str(v) if v is not None else None


# ---------------------------------------------------------------------------
# Authority probe
# ---------------------------------------------------------------------------

class AuthRef:
    def __init__(self, value=None, need=None):
        self.value = value
        self.need = need
        self.is_need = need is not None


def probe_authority(kind, declaration, authority_at_state, from_val, transport, witness):
    path = "EIP1271" if kind == "EIP1271" else "EOA"
    at_state = None
    if authority_at_state is not None and js_truthy(authority_at_state):
        at_state = authority_at_state

    signer_binding = field(declaration, "signerBinding")
    sb_addr = js_string_or_empty(field(signer_binding, "address") if is_obj(signer_binding) else None)
    if not address_re(sb_addr):
        return AuthRef(value=auth_value(
            "NOT_PROVEN", "INVALID_AUTHORITY", "signerBinding.address must be an address", path, at_state
        ))
    address = js_string(sb_addr)

    if kind != "EIP1271":
        sig = field(declaration, "signature") if is_obj(declaration) else None
        r = js_string_or_empty(field(sig, "r") if is_obj(sig) else None)
        s_val = js_string_or_empty(field(sig, "s") if is_obj(sig) else None)
        v_num = -1.0
        vv = field(sig, "v") if is_obj(sig) else None
        if is_num(vv):
            v_num = vv
        malformed = (
            not hex64_re(r)
            or not hex64_re(s_val)
            or all_zero(r)
            or all_zero(s_val)
            or (v_num != 27.0 and v_num != 28.0)
        )
        if malformed:
            return AuthRef(value=auth_value(
                "NOT_PROVEN", "SIG_MALFORMED", "EIP-712 envelope malformed", path, at_state
            ))
        manifest_id_str = js_string_or_empty(field(declaration, "manifestId"))
        chain_id = js_string_or_empty(field(declaration, "chainId"))
        declared_addr = js_string_or_empty(field(signer_binding, "address") if is_obj(signer_binding) else None)
        try:
            digest = manifest_digest(manifest_id_str, chain_id)
            signer = recover_signer_address(digest, r, s_val, v_num)
            recovered = ("ok", signer)
        except ValueError as e:
            recovered = ("err", str(e))
        if recovered[0] == "ok" and lc_js(recovered[1]) == lc_js(declared_addr):
            return AuthRef(value=auth_value("OK", "RECOVERED_SIGNER", None, path, at_state))
        if recovered[0] == "ok":
            return AuthRef(value=auth_value(
                "NOT_PROVEN",
                "SIGNER_MISMATCH",
                "recovered {} != declared {}".format(recovered[1], declared_addr),
                path,
                at_state,
            ))
        return AuthRef(value=auth_value("NOT_PROVEN", "RECOVERY_THREW", recovered[1], path, at_state))

    # EIP-1271 branch below.
    transport_available = False
    if is_obj(transport):
        avail = field(transport, "available")
        if is_bool(avail):
            transport_available = avail
    if not transport_available:
        return AuthRef(value=auth_value(
            "NOT_RUN", "NO_PROVIDERS", "no injected contractAuth { ethCall, getCode }", "EIP1271", at_state
        ))

    # Reference: authorityAtState must be a decimal STRING (not a number).
    if at_state is not None and is_str(at_state) and decimal_re(at_state):
        authority_state = str(at_state)
    else:
        return AuthRef(value=auth_value(
            "NOT_RUN", "NO_AUTHORITY_STATE", "decision-time state required; no latest fallback", "EIP1271", None
        ))

    block_str = str(authority_state)

    sig = field(declaration, "signature") if is_obj(declaration) else None
    if is_obj(sig):
        b = field(sig, "bytes")
        sig_bytes = b if is_str(b) else "0x"
    else:
        sig_bytes = "0x"

    manifest_id_str = js_string_or_empty(field(declaration, "manifestId"))
    chain_id = js_string_or_empty(field(declaration, "chainId"))
    at_state_block = authority_state

    def calldata_lazy():
        digest = manifest_digest(manifest_id_str, chain_id)
        digest_hex = "0x" + hex_encode(digest)
        calldata = is_valid_signature_calldata(digest_hex, sig_bytes)
        return (digest_hex, calldata)

    if is_obj(field(witness, "ethCall")):
        try:
            digest_hex, calldata = calldata_lazy()
        except ValueError as e:
            return AuthRef(value=auth_value(
                "NOT_PROVEN", "CALDATA_ERROR", str(e), "EIP1271", at_state_block
            ))
        return process_eth_call(address, block_str, from_val, witness, digest_hex, calldata)

    code_w = field(witness, "code")
    if code_w is None:
        return AuthRef(need=need_code(address, block_str))
    expected = {"kind": "getCode", "address": address, "block": block_str}
    if not json_eq(field(code_w, "request"), expected):
        raise Pipe("refused", "getCode witness request does not match the verifier's own binding")
    result = field(code_w, "result")
    ok_flag = field(result, "ok") if is_obj(result) else None
    if is_bool(ok_flag) and not ok_flag:
        msg = js_string_or_empty(field(result, "error") if is_obj(result) else None)
        return AuthRef(value=auth_value(
            "NOT_RUN", "CODE_LOOKUP_ERROR", "getCode threw: {}".format(msg), "EIP1271", at_state_block
        ))
    if is_bool(ok_flag) and ok_flag:
        raw = field(result, "value")
        code = js_string_or_empty(raw)
        trimmed = code
        if trimmed.startswith("0x"):
            trimmed = trimmed[2:]
        elif trimmed.startswith("0X"):
            trimmed = trimmed[2:]
        if trimmed == "":
            return AuthRef(value=auth_value(
                "NOT_PROVEN",
                "NO_CODE_AT_STATE",
                "empty code at authorityAtState (EOA under EIP1271 kind) — fails closed",
                "EIP1271",
                at_state_block,
            ))
        try:
            _digest_hex, calldata = calldata_lazy()
        except ValueError as e:
            return AuthRef(value=auth_value(
                "NOT_PROVEN", "CALDATA_ERROR", str(e), "EIP1271", at_state_block
            ))
        from_str = None
        if from_val is not None and js_truthy(from_val):
            from_str = js_string(from_val)
        return AuthRef(need=need_eth_call(address, calldata, block_str, from_str))
    raise Pipe("refused", "getCode witness missing ok flag")


def process_eth_call(address, authority_state, from_val, witness, digest_hex, calldata):
    del digest_hex
    eth_witness = field(witness, "ethCall")
    from_str = None
    if from_val is not None and js_truthy(from_val):
        from_str = js_string(from_val)
    if from_str is not None:
        expected = {"kind": "ethCall", "to": address, "data": calldata, "block": authority_state, "from": from_str}
    else:
        expected = {"kind": "ethCall", "to": address, "data": calldata, "block": authority_state}
    if not json_eq(field(eth_witness, "request"), expected):
        raise Pipe("refused", "ethCall witness request does not match the verifier's own binding")

    result = field(eth_witness, "result")
    ok_flag = field(result, "ok") if is_obj(result) else None
    if is_bool(ok_flag) and not ok_flag:
        msg = js_string_or_empty(field(result, "error") if is_obj(result) else None)
        return AuthRef(value=auth_value(
            "NOT_RUN", "PROVIDER_ERROR", "ethCall threw: {}".format(msg), "EIP1271", authority_state
        ))
    if is_bool(ok_flag) and ok_flag:
        res = field(result, "response")
        res_truthy = js_truthy(res)
        res_ok = False
        if is_obj(res):
            rf = field(res, "ok")
            if is_bool(rf):
                res_ok = rf
        if res_truthy and res_ok:
            data_raw = field(res, "data")
            if js_falsy(data_raw):
                data = "0x"
            else:
                data = js_string(data_raw)
            if is_magic(data):
                return AuthRef(value=auth_value("OK", "EIP1271_MAGIC", None, "EIP1271", authority_state))
            return AuthRef(value=auth_value(
                "NOT_PROVEN", "NOT_MAGIC", "return data is not the EIP-1271 magic value", "EIP1271", authority_state
            ))
        if res_truthy:
            c = field(res, "code")
            if js_falsy(c):
                code_name = None
            else:
                code_name = js_string(c)
        else:
            code_name = None
        if code_name == "REVERTED":
            return AuthRef(value=auth_value(
                "NOT_PROVEN", "REVERTED", "isValidSignature reverted (call ran; fail-closed)", "EIP1271", authority_state
            ))
        if code_name == "HISTORICAL_STATE_UNAVAILABLE":
            return AuthRef(value=auth_value(
                "NOT_RUN", "HISTORICAL_STATE_UNAVAILABLE", "cannot serve authorityAtState; no latest fallback", "EIP1271", authority_state
            ))
        return AuthRef(value=auth_value(
            "NOT_RUN",
            "PROVIDER_ERROR",
            "eth_call failed: {}".format(code_name if code_name is not None else "unknown"),
            "EIP1271",
            authority_state,
        ))
    raise Pipe("refused", "ethCall witness missing ok flag")


# ---------------------------------------------------------------------------
# Pipeline (mirror of B's pipeline + dispatch)
# ---------------------------------------------------------------------------

def pipe_to_value(pipe):
    if pipe.pipe_kind == "refused":
        return {"mode": "refused", "reason": pipe.message}
    if pipe.pipe_kind == "throw":
        return {"kind": "throw", "type": pipe.type, "message": pipe.message}
    return {"kind": "input_error", "message": pipe.message}


def pipeline(outer):
    if not is_obj(outer):
        raise Pipe("input_error", "input must be a JSON object")

    for key in EXECUTION_EVIDENCE_KEYS:
        if field(outer, key) is not None:
            raise Pipe(
                "refused",
                "execution evidence ({}) is structurally refused at the pre-execution seam (Q-FW10 / Q-W3-6)".format(key),
            )

    intent = field(outer, "intent")
    declaration = field(outer, "declaration")
    frozen_record = field(outer, "frozenRecord")
    caller_binding_ref = field(outer, "callerBindingRef")
    authority_at_state = field(outer, "authorityAtState")
    from_val = field(outer, "from")
    transport = field(outer, "transport")
    witness = field(outer, "witness")

    binding = build_authorization(intent, declaration)
    if binding.status != "OK":
        created = ScopeResult(False, "", "", "", None, None)
        return result_map(
            binding.status,
            binding.label,
            pair_to_value(binding.reason),
            "binding",
            recomputed_of(binding.semantics, binding.instance),
            binding.semantics,
            binding.instance,
            created,
        )

    semantics = binding.semantics
    instance = binding.instance
    recomputed = recomputed_of(semantics, instance)
    binding_ref = binding.binding_ref

    if caller_binding_ref is not None and not is_null(caller_binding_ref):
        if lc_js(js_string(caller_binding_ref)) != binding_ref:
                created = ScopeResult(False, "", "", "", None, None)
                return result_map(
                    "NOT_PROVEN",
                    "BINDING_REFERENCE_MISMATCH",
                    "caller-supplied bindingRef != recomputed bindingRef (reference-only; FSR-2)",
                    "reference",
                    recomputed,
                    semantics,
                    instance,
                    created,
                )

    scope = scope_from_frozen_record(intent, frozen_record)
    if not scope.ok:
        return result_map(
            scope.status,
            scope.label,
            str(scope.reason),
            "scope",
            recomputed,
            semantics,
            instance,
            scope,
        )

    authority = probe_authority(binding.kind, declaration, authority_at_state, from_val, transport, witness)

    if authority.is_need:
        return authority.need
    a = authority.value
    status = js_string_or_empty(field(a, "status"))
    if status != "OK":
        m = result_map(
            status,
            js_string_or_empty(field(a, "label")),
            field(a, "reason"),
            "authority",
            recomputed,
            semantics,
            instance,
            scope,
        )
        m["authority"] = a
        return m
    m = result_map("OK", "BOUND", None, None, recomputed, semantics, instance, scope)
    m["authority"] = a
    return m


def canon_top(outer):
    try:
        c = canonicalize(outer)
        return {"ok": True, "value": c}
    except CanonError as e:
        return {"ok": False, "error": e.message}


def dispatch(outer_bytes, canonical_only):
    """Outer entry (mirror of B's dispatch): bytes -> result JSON string."""
    input_text = outer_bytes.decode("utf-8", "replace")
    try:
        parsed = _json.parse_json(input_text)
    except ValueError as e:
        return _json.serialize({"kind": "input_error", "message": "invalid JSON input: {}".format(str(e))})
    if canonical_only:
        return _json.serialize(canon_top(parsed))
    try:
        out = pipeline(parsed)
        return _json.serialize(out)
    except Pipe as p:
        return _json.serialize(pipe_to_value(p))