"""Verifier C — third independent CGEP/1 verifier (Dec-C-6 library surface).

Library-only: ``verify_raw`` / ``canon`` operate on JSON TEXT (mirror of B's
``verifyRaw``/``canonRaw`` over the WASM ABI), and ``run`` mirrors B's
transport/orchestration loop (getCode -> ethCall) over injected callables.

Public surface never performs RPC, never decides, and never accepts
post-execution evidence on the pre-execution seam (Q-FW10 / Q-W3-6).
"""

from . import _pipeline
from ._pipeline import pipeline, canon_top, dispatch, EXECUTION_EVIDENCE_KEYS
from ._canon import canonicalize, CanonError
from ._json import parse_json, serialize, fmt_f64
from ._keccak import keccak256
from ._secp import recover_signer_address


class VerifierError(Exception):
    """Raised when the pipeline produces a ``throw``/``input_error`` kind
    (mirror of B's wrapper verifyRaw behavior)."""


def verify(text, canonical_only=False):
    """Run the pipeline over JSON text -> JSON text (mirror of B's
    wasm ``verify``/``canon`` entry points)."""
    return dispatch(text.encode("utf-8"), canonical_only)


def verify_raw_object(inp):
    """verify* surface over a parsed input object -> result object.

    Raises VerifierError for ``throw``/``input_error`` kinds, mirroring B's
    ``verifyRaw`` which JSON.parses the WASM output and throws.
    """
    out = _pipeline.pipeline(inp)
    return out


def verify_raw(text):
    """verify* surface over JSON text -> result object (throws on
    throw/input_error kinds, mirroring B's wrapper verifyRaw)."""
    parsed = parse_json(text)
    out = verify_raw_object(parsed)
    return out


def canon_raw(text):
    """canon over JSON text -> {ok, value|error} object (never throws)."""
    parsed = parse_json(text)
    return canon_top(parsed)


class Transport:
    """Mirror of B's JS wrapper ``run`` orchestration over injected asyncio
    callables (``getCode`` / ``ethCall``). Kept for parity/documentation; the
    Node transport wrapper drives the bridge, so tests use ``run`` there."""


async def run(args, get_code=None, eth_call=None):
    """Mirror of B's wrapper run(): drive the witness loop with injected
    providers. ``args`` is the parsed input object possibly missing witness."""
    present = [k for k in EXECUTION_EVIDENCE_KEYS if k in args and args[k] is not None]
    if present:
        raise TypeError(
            "verifier-c: pre-execution verification must NOT receive post-execution evidence ({}) — Q-W3-6/Q-FW10 seam".format(
                ", ".join(present)
            )
        )
    transport_available = (
        callable(get_code) and callable(eth_call)
    )
    import json as stdjson

    def jsondumps(o):
        return stdjson.dumps(o, separators=(",", ":"), ensure_ascii=False)

    base = {}
    for k in ("intent", "declaration", "frozenRecord"):
        if k in args and args[k] is not None:
            base[k] = args[k]
    if "callerBindingRef" in args and args["callerBindingRef"] is not None:
        base["callerBindingRef"] = args["callerBindingRef"]
    if "authorityAtState" in args and args["authorityAtState"] is not None:
        base["authorityAtState"] = args["authorityAtState"]
    if "from" in args and args["from"] is not None:
        base["from"] = args["from"]
    base["transport"] = {"available": transport_available}

    step1 = verify_raw(jsondumps(base))
    if step1.get("mode") == "needs_witness" and step1.get("need", {}).get("kind") == "getCode":
        need = step1["need"]
        try:
            value = await get_code({"address": need["address"], "block": need["block"]})
            r1 = {"ok": True, "value": None if value is None else value}
        except Exception as e:  # noqa: BLE001
            r1 = {"ok": False, "error": str(e) if getattr(e, "message", None) is None else e.message}
        step2_args = dict(base)
        step2_args["witness"] = {"code": {"request": need, "result": r1}}
        step2 = verify_raw(jsondumps(step2_args))
        if step2.get("mode") == "needs_witness" and step2.get("need", {}).get("kind") == "ethCall":
            need = step2["need"]
            eth_opts = {"to": need["to"], "data": need["data"], "block": need["block"]}
            if "from" in need:
                eth_opts["from"] = need["from"]
            try:
                eth_res = await eth_call(eth_opts)
            except Exception as e:  # noqa: BLE001
                eth_res = {"error": True, "message": str(e) if getattr(e, "message", None) is None else e.message}
            if isinstance(eth_res, dict) and eth_res.get("error"):
                r2 = {"ok": False, "error": eth_res.get("message", "unknown error")}
            else:
                r2 = {"ok": True, "response": eth_res}
            step3_args = dict(base)
            step3_args["witness"] = {"ethCall": {"request": need, "result": r2}}
            return verify_raw(jsondumps(step3_args))
        return step2
    return step1


__all__ = [
    "verify",
    "verify_raw",
    "verify_raw_object",
    "canon_raw",
    "canonicalize",
    "CanonError",
    "parse_json",
    "serialize",
    "fmt_f64",
    "keccak256",
    "recover_signer_address",
    "dispatch",
    "pipeline",
    "EXECUTION_EVIDENCE_KEYS",
    "VerifierError",
    "run",
]