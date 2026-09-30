---
id: python/py-security
kind: rule
title: Security (Python)
description: Python security invariants — secrets handling, injection (SQL/shell/YAML), pickle/deserialization bans, secure randomness
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - security
appliesToRationale: Scoped to Python source because these are code-level security invariants, not project-config concerns.
---

## Secrets and Credentials

Never embed secrets, API keys, tokens, passwords, or connection strings in source, committed config
files, log messages, exceptions, or `__repr__`/`__str__` output. Load them from environment
variables via `pydantic-settings` (see `py-project-layout`) and fail fast if a required one is
missing:

```python
# Correct — fails fast with a clear message
api_token = os.environ["API_TOKEN"]  # raises KeyError, not a silent None

# Avoid — silent fallback masks a missing-secret misconfiguration
api_token = os.environ.get("API_TOKEN", "dev-token-1234")
```

Never commit `.env` files with real values — commit `.env.example` with placeholders only.

## Shell Injection

Never build shell commands via string concatenation or f-strings with untrusted input. Use
`subprocess.run` with an argument list and `shell=False` (the default):

```python
# Correct — argument list, no shell interpretation
subprocess.run(["git", "log", "--oneline", branch], check=True)

# Wrong — shell=True with interpolated input enables command injection
subprocess.run(f"git log --oneline {branch}", shell=True)
```

## SQL Injection

Always use parameterized queries — never format or concatenate user input into SQL text, even for
"internal" tools:

```python
# Correct — parameterized, driver escapes safely
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# With SQLAlchemy — bound parameters, never raw string formatting
stmt = select(User).where(User.id == user_id)

# Wrong — string formatting builds the query with untrusted input inline
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
```

## Unsafe Deserialization

`pickle.load`/`pickle.loads` on untrusted input is arbitrary code execution — never deserialize
pickle data from an external source, a queue message, or a cache you don't fully control. Prefer
`json`, or `msgpack`/`orjson` for binary, for any data crossing a trust boundary.

`yaml.load` with the default `Loader` can construct arbitrary Python objects from a crafted
document — always use `yaml.safe_load` (or `yaml.load(stream, Loader=yaml.SafeLoader)`) for any
YAML from outside the codebase.

`eval`/`exec` on data from an external source is banned outright — there is no safe way to sandbox
it in pure Python. `ast.literal_eval` is the safe alternative for parsing a Python literal.

## Path Traversal

Validate a user-supplied path against an allowed root using `Path.resolve()` before use:

```python
def safe_read(user_path: str, allowed_root: Path) -> str:
    resolved = (allowed_root / user_path).resolve()
    if not resolved.is_relative_to(allowed_root.resolve()):
        raise ValueError(f"Path traversal attempt: {user_path}")
    return resolved.read_text()
```

## Secure Randomness

Use the `secrets` module — never `random` — for anything security-sensitive: tokens, session IDs,
password reset codes.

```python
import secrets

token = secrets.token_urlsafe(32)       # URL-safe random token
session_id = secrets.token_hex(16)      # hex random session id
```

`random.random()`/`random.choice()` are deterministic given a known seed and must never be used for
a secret or identifier.

## Timing-Safe Comparison

Compare secrets, HMACs, and tokens with `hmac.compare_digest` — normal `==` short-circuits on the
first differing byte, leaking timing information usable to reconstruct a secret byte-by-byte.

```python
import hmac

if not hmac.compare_digest(expected_signature, received_signature):
    raise InvalidSignatureError()
```

## Network I/O Timeouts

Every outbound HTTP call must set an explicit timeout — `httpx`/`requests` calls without one can
hang indefinitely on a slow or malicious server:

```python
async with httpx.AsyncClient(timeout=5.0) as client:
    response = await client.get(url)
```

Never disable TLS certificate verification (`verify=False`) outside local test environments.
