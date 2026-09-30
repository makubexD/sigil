---
id: python/py-project-layout
kind: rule
title: Project Layout (Python)
description: Python project structure — src layout, pyproject.toml as the single manifest, package boundaries, environment config
language: python
appliesTo:
  - "**/*.py"
  - pyproject.toml
tags:
  - python
  - project-layout
appliesToRationale: Scoped to Python source and the project manifest because these are structural/organizational conventions, not runtime logic.
---

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
