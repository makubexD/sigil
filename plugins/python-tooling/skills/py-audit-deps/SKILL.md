---
name: py-audit-deps
description: "Audit PyPI dependencies — known CVEs (pip-audit), outdated versions, unmaintained packages, unused imports, and license compliance (Python)"
when_to_use: "Use to check for known CVEs, outdated packages, and license issues in a Python project's dependencies. Fires for \"are there any known CVEs\", \"audit dependencies\", \"check for vulnerable packages\", or before a release."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "(no arguments)"
context: fork
---

# Audit Dependencies

Read-only audit — reports findings, does not modify `pyproject.toml` or the lock file.

## Step 1 — Discover dependency manifest

Locate `pyproject.toml` and the lock file (`uv.lock`/`poetry.lock`). List declared runtime
dependencies from `[project.dependencies]` and dev dependencies from `[dependency-groups]`.

## Step 2 — Run available tooling

### CVE scan

```bash
pip-audit 2>&1
```
If `pip-audit` isn't installed, note that in the report and recommend `uv tool install pip-audit`
(or `pipx install pip-audit`) rather than fabricating results.

If using `uv`:
```bash
uv export --format requirements-txt --no-hashes | pip-audit -r - 2>&1
```

### Outdated packages

```bash
uv pip list --outdated 2>&1   # or: pip list --outdated
```
Flag packages more than 2 major versions behind, or with no release in 18+ months.

### Unused dependencies

```bash
deptry . 2>&1   # cross-references imports against declared dependencies
```
If `deptry` isn't available, cross-reference manually: for each declared dependency, `grep -rn
"^import <pkg>\|^from <pkg>" src/` and flag any with zero matches.

## Step 3 — Manual review

### License compliance

For each direct dependency, check its declared license (via `pip show <pkg>` or the PyPI page).
Flag any GPL/AGPL-licensed dependency for review if the project is proprietary/commercial, and flag
any dependency with no declared license at all.

## Step 4 — Report

```
## Dependency Audit Report

### CVEs / Security vulnerabilities
<pip-audit output, or "None found" / "pip-audit not installed — recommend installing it">

### Outdated packages
- `<package>` — installed <version>, latest <version> [<N> major versions behind / stale since <date>]

### Unused dependencies
- `<package>` — declared but no import found

### License compliance
- `<package>` — <license>, flagged because <reason>

### Manual findings

#### High
- `<package>` — <issue>. **Recommendation:** <action>.

#### Medium
...

#### Low
...

### Summary
<N> critical/high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low/informational notes.
```

Omit sections and tiers with no findings.

---

## Applied Rules

### Dependencies (Python)

## Prefer the Standard Library Before Adding a Package

Before adding a dependency, check whether the stdlib already covers the need: `pathlib`, `json`,
`dataclasses`, `functools`, `itertools`, `datetime` (with `zoneinfo` for timezones, 3.9+),
`urllib.request` for simple HTTP, `unittest.mock`, `argparse`. A dependency adds supply-chain risk
and install-time cost the stdlib does not.

## Pin Versions and Commit the Lock File

Declare dependencies in `pyproject.toml` under `[project.dependencies]` / `[dependency-groups]`.
Use `uv` or `poetry` to generate and commit a lock file (`uv.lock` / `poetry.lock`) — it pins the
full transitive graph, not just the direct dependencies a loose `requirements.txt` records.

```bash
uv add httpx              # adds + resolves + updates uv.lock
uv sync --locked          # CI: install exactly what the lock file specifies, fail on drift
```

If the project still uses bare `requirements.txt`, pin exact versions (`httpx==0.27.0`, not
`httpx>=0.27`) and generate it with `pip-compile` (from `pip-tools`) rather than hand-editing, so
transitive pins stay reproducible.

## Separate Runtime from Dev Dependencies

Use `pyproject.toml`'s `[dependency-groups]` (PEP 735) or `[project.optional-dependencies]` to keep
test/lint/type-check tooling out of the production install:

```toml
[project]
dependencies = ["httpx>=0.27", "pydantic>=2.0"]

[dependency-groups]
dev = ["pytest>=8.0", "ruff>=0.6", "mypy>=1.11"]
```

Install dev tools with `uv sync --group dev`; production/container installs should use
`uv sync --no-group dev` (or `pip install .` against a wheel with only `dependencies`).

## Vet Before Adding

When adding a new dependency:
1. Confirm it is actively maintained (recent PyPI release, issues addressed, not archived).
2. Check for known CVEs: `pip-audit` (or `uv pip audit` once available) against the resolved set.
3. Review its transitive footprint — a small helper that pulls in a large dependency tree is a cost.
4. Confirm the license is compatible with the project (MIT/BSD/Apache typically fine; GPL/AGPL needs
   review for commercial distribution).
5. Prefer packages that ship type stubs (`py.typed` marker) so `mypy` can check call sites.

See `py-add-package` for an automated vet-and-wire workflow.

## Remove Unused Dependencies

Unused entries in `[project.dependencies]` are dead weight and a supply-chain risk. Audit with
`deptry` (cross-references imports against declared dependencies) periodically, and re-run
`uv sync`/`uv lock` after removing an entry to refresh the lock file.

## Dependency Updates

Keep dependencies reasonably current — unmaintained pins accumulate CVEs. Prefer automated update
PRs (Dependabot, Renovate) that run the full test suite before merging. Never merge a dependency
update without running the quality gate (`ruff check . && mypy . && pytest`) first. A major-version
bump is a code-change opportunity — read the changelog before merging, not just the diff.

### Packaging (Python)

## Build Backend

Declare a PEP 517/518 build backend explicitly — never rely on an implicit legacy `setup.py` build.
`hatchling` (simple, fast, no plugin sprawl) or `setuptools` (broadest ecosystem compatibility) are
both reasonable defaults; `poetry-core` if the project already uses Poetry for dependency
management:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

## Single-Source the Version

Never hand-maintain the version string in two places. Read it from a single source — package
`__init__.py`'s `__version__`, or derive it from git tags via `hatch-vcs`/`setuptools-scm` — and let
the build backend pick it up:

```toml
[tool.hatch.version]
source = "vcs"   # derives the version from the latest git tag
```

A hardcoded `version = "1.2.0"` in `pyproject.toml` that drifts from the actual git tag or
`__init__.py` value is a common source of "which version is this really" bugs.

## Source Distribution and Wheel

Build both a source distribution (`sdist`, for platforms without prebuilt wheels and for supply-chain
transparency) and a wheel (`whl`, the installable binary format):

```bash
uv build          # produces dist/*.tar.gz (sdist) and dist/*.whl (wheel)
python -m build   # equivalent, backend-agnostic invocation
```

Verify the sdist actually contains everything needed to build (`MANIFEST.in` or
`[tool.hatch.build]` include rules) — a wheel-only release that omits the sdist blocks users who
need to build from source (uncommon platforms, security review).

## Publish to PyPI

Use `twine` or `uv publish` with a scoped API token (project-scoped, not account-wide) stored as a
CI secret — never a personal password. Prefer **Trusted Publishing** (PyPI's OIDC-based flow for
GitHub Actions) over long-lived API tokens where the CI platform supports it — it eliminates the
stored-secret entirely.

```bash
uv build
uv publish --token "$PYPI_TOKEN"   # or trusted publishing, no token needed
```

Always publish to **TestPyPI** first for a new package or a packaging-mechanics change, to confirm
the metadata and file layout render correctly before the real release.

## Audit Before Release

Run `pip-audit` against the locked dependency set before cutting a release — it checks the resolved
environment against the PyPA advisory database:

```bash
uv export --format requirements-txt | pip-audit -r -
```

See `py-audit-deps` for the full automated dependency-audit skill and `py-release` for the complete
release-preparation workflow this rule's mechanics feed into.

## `py.typed` Marker

If the package ships type hints (it should), include an empty `py.typed` marker file and declare it
in the build backend's package-data config — without it, type checkers treat the installed package
as untyped even though the source has annotations.

### Security (Python)

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
