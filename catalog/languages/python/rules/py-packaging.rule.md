---
id: python/py-packaging
kind: rule
title: Packaging (Python)
description: Python packaging mechanics — pyproject.toml build backend, PyPI publishing, uv/pip-audit, version single-sourcing
language: python
appliesTo:
  - pyproject.toml
tags:
  - python
  - packaging
  - pypi
appliesToRationale: Scoped to pyproject.toml because build-backend and publishing mechanics are declared there, not in .py source.
---

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
