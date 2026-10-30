---
name: py-scaffold-project
description: "Scaffold a new Python package in an empty directory with src layout, pyproject.toml, uv-managed venv, ruff/mypy config, and a starter test"
when_to_use: "Use when starting a brand-new Python package from scratch. Fires for \"scaffold a new Python package\", \"create a new Python project\", or \"set up a Python package called X\". Not for adding a package to an existing repo or monorepo (use py-add-project) or a feature to an existing project."
allowed-tools: Read, Write, Bash, Glob
argument-hint: "<package-name>"
---

# Scaffold Project

**Package name:** $ARGUMENTS

## Step 1 — Confirm the target directory is empty

If the target directory already contains a `pyproject.toml` or `.git/`, stop and ask before
overwriting — this skill is for a genuinely new package, not retrofitting an existing one.

## Step 2 — Create the project structure

```
<package-name>/
  pyproject.toml
  README.md
  .gitignore
  src/
    <package_name>/
      __init__.py
  tests/
    __init__.py
```

Use the snake_case form of the package name for the importable package directory
(`sigil-metrics` → `src/sigil_metrics/`), matching `py-project-layout`'s src-layout convention.

## Step 3 — Configure tooling

### Write `pyproject.toml`

```toml
[project]
name = "<package-name>"
version = "0.1.0"
description = ""
requires-python = ">=3.11"
dependencies = []

[dependency-groups]
dev = ["pytest>=8.0", "ruff>=0.6", "mypy>=1.11"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100

[tool.mypy]
strict = true

[tool.pytest.ini_options]
testpaths = ["tests"]
```

### Initialize the environment

```bash
cd <package-name>
uv venv
uv sync --group dev
```

## Step 4 — Write a starter test and README

```python
# tests/test_smoke.py — confirms the package imports cleanly; replace once real functionality exists
def test_package_imports():
    import <package_name>  # noqa: F401
```

Write `.gitignore` per `py-git`'s standard additions, and a minimal `README.md`: package name,
one-sentence description, install command (`uv sync`), and how to run tests (`uv run pytest`).

## Step 5 — Verify

```bash
uv run ruff check . && uv run mypy . && uv run pytest
```

## Step 6 — Report

```
## Scaffold Report

Package: <package-name>
Layout: src layout, package src/<package_name>/

### Created
- pyproject.toml, README.md, .gitignore
- src/<package_name>/__init__.py
- tests/test_smoke.py

### Verification
✅ ruff, mypy, pytest all pass on the scaffold
```

---

## Applied Rules

### Project Layout (Python)

## `src` Layout

Prefer the `src` layout over a flat package-at-root layout — it prevents accidentally importing the
package from the working directory instead of the installed version, catching packaging bugs early:

```
myproject/
  pyproject.toml
  src/
    myapp/
      __init__.py
      api/            # FastAPI routers or Django views, request/response schemas
      core/           # config, dependency wiring, app lifecycle
      domain/         # entities, value objects, business rules — no framework imports
      infrastructure/ # DB, external APIs, repositories
  tests/
    unit/
    integration/
```

A flat layout (`myapp/` directly at the repo root, no `src/`) is acceptable for a small script or a
single-file tool — not for anything published as a package or with more than a handful of modules.

## `pyproject.toml` as the Single Manifest

All project metadata, dependencies, and tool configuration belong in `pyproject.toml` —
`setup.py`/`setup.cfg` are legacy and should not be added to a new project. Tool sections
(`[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`) keep configuration co-located rather than
scattered across `.flake8`, `mypy.ini`, `pytest.ini`.

## Package Boundaries

Each subpackage under `src/myapp/` should have a clear, single responsibility (mirroring
`py-code-quality`'s layering rule). `domain/` must not import from `api/` or `infrastructure/` — the
dependency direction is inward, with `infrastructure/` and `api/` depending on `domain/`, never the
reverse. A `core/` package for cross-cutting config/wiring is the one exception allowed to be
imported broadly.

## Environment Configuration

Use `pydantic-settings` (or Django's `settings.py` with `django-environ`) to load configuration from
environment variables into a typed, validated object — never read `os.environ[...]` scattered
throughout business logic:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    api_token: str
    debug: bool = False

    model_config = {"env_file": ".env"}

settings = Settings()  # raises ValidationError at startup if required vars are missing
```

Fail fast at startup on missing required configuration — do not let a missing environment variable
surface as an `AttributeError` deep inside a request handler.

## Entry Points

Declare CLI entry points and console scripts under `[project.scripts]` in `pyproject.toml` rather
than a hand-rolled `if __name__ == "__main__":` block scattered across multiple files:

```toml
[project.scripts]
myapp = "myapp.cli:main"
```

## Virtual Environments

Use `uv` (preferred) or `venv` to create an isolated environment per project — never install
project dependencies into the system Python. `uv venv` + `uv sync` reproduces the exact locked
environment from `uv.lock` on any machine.

## Test Layout Mirrors Source

`tests/` mirrors `src/myapp/`'s package structure (`tests/unit/domain/test_pricing.py` for
`src/myapp/domain/pricing.py`) so a reader can locate a module's tests without searching. See
`py-testing` for pytest-specific conventions and `py-generate-tests` for the automated skill.
