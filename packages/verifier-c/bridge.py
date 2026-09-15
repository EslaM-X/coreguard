"""Verifier C transport bridge (test-only; Dec-C-6 no-CLI boundary).

Not a verification CLI: ``python bridge.py`` without ``--bridge`` only prints
usage and exits 0. With ``--bridge`` it serves a newline-delimited JSON
protocol on stdin/stdout for the Node differential harness (mirror of B's
WASM ABI + index.js wrapper). The protocol carries the input as a JSON TEXT
string, which the bridge hands to the V8-parity engine — stdlib ``json`` is
used here only for I/O framing (Dec-C-4).
"""

import hashlib
import json as stdjson
import os
import platform
import sys


def _source_checksums():
    here = os.path.dirname(os.path.abspath(__file__))
    pkg = os.path.join(here, "verifier_c")
    files = sorted(
        [f for f in os.listdir(pkg) if f.endswith(".py")]
    )
    files.append("bridge.py")
    out = {}
    for f in files:
        if f == "bridge.py":
            path = os.path.join(here, f)
        else:
            path = os.path.join(pkg, f)
        with open(path, "rb") as fh:
            out[f] = "sha256:" + hashlib.sha256(fh.read()).hexdigest()
    return out


def handle(op, payload):
    if op == "hello":
        return {
            "ok": True,
            "python": platform.python_version(),
            "implementation": platform.python_implementation(),
            "sources": _source_checksums(),
        }
    if op in ("verify", "canon"):
        from verifier_c import dispatch
        text = payload["input"]
        out = dispatch(text.encode("utf-8"), op == "canon")
        return {"ok": True, "out": out}
    return {"ok": False, "error": "verifier-c: unknown bridge op {}".format(op)}


def main(argv):
    if "--bridge" not in argv:
        print("verifier-c: library bridge is invoked by the Node transport wrapper with `--bridge` — no CLI.")
        return 0
    for line in sys.stdin:
        try:
            msg = stdjson.loads(line)
            if not isinstance(msg, dict) or "op" not in msg:
                reply = {"ok": False, "error": "verifier-c: malformed bridge request"}
            else:
                reply = handle(msg["op"], msg)
        except Exception as e:  # noqa: BLE001 — the harness must see the failure
            reply = {"ok": False, "error": "verifier-c: bridge error: {}".format(e)}
        sys.stdout.write(stdjson.dumps(reply, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))