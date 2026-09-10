# Canonical Encoding — CGEP/1 Specification

**Version**: 1.0.0-draft  
**Parent**: CGEP/1 Core

---

## 1. Purpose

Canonical encoding ensures that identical logical data always produces identical bytes, enabling deterministic hash computation and independent verification.

## 2. Rules

### 2.1 Field Ordering

All fields are sorted **alphabetically by key** at each level.

### 2.2 Integer Encoding

All integers are encoded as **decimal strings** (no leading zeros except for "0").

```
"0"
"1"
"1000000000000000000"
```

### 2.3 Address Encoding

All addresses are **lowercase hex with 0x prefix**, 42 characters.

```
"0xabc123..."
```

### 2.4 Bytes Encoding

All bytes are **lowercase hex with 0x prefix**, even length.

```
"0x00"
"0x0a1b"
```

### 2.5 String Encoding

Strings are UTF-8 encoded, no escaping unless necessary.

### 2.6 Boolean Encoding

```
true
false
```

### 2.7 Null Encoding

```
null
```

### 2.8 Array Encoding

Elements separated by commas, no trailing comma.

### 2.9 Object Encoding

Fields sorted alphabetically, no trailing commas.

### 2.10 Version Field

All top-level structures MUST include `"version": "CGEP/1"` as the first field.

## 3. Canonical Serialization

```python
def canonicalize(obj):
    if obj is None:
        return "null"
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if isinstance(obj, int):
        return str(obj)
    if isinstance(obj, str):
        return json.dumps(obj)
    if isinstance(obj, list):
        elements = [canonicalize(e) for e in obj]
        return "[" + ",".join(elements) + "]"
    if isinstance(obj, dict):
        keys = sorted(obj.keys())
        pairs = []
        for k in keys:
            pairs.append(json.dumps(k) + ":" + canonicalize(obj[k]))
        return "{" + ",".join(pairs) + "}"
    raise ValueError(f"Unsupported type: {type(obj)}")
```

## 4. Hash Computation

```
H("CGEP/1:INTENT" || canonicalize(intent))
H("CGEP/1:POLICY" || canonicalize(policy))
H("CGEP/1:TRACE" || canonicalize(trace))
H("CGEP/1:EVIDENCE" || canonicalize(evidence))
H("CGEP/1:RECEIPT" || canonicalize(receipt))
```

## 5. Determinism Guarantees

- Same logical data → same canonical bytes → same hash
- Field order: alphabetical
- Integer representation: decimal strings
- Address case: lowercase
- Bytes case: lowercase
- Null handling: explicit
- Array order: preserved
- Version field: required

---

*End of Canonical Encoding Specification*
