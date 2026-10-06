---
id: python/py-scaffold-project
kind: skill
title: "New Project (Python)"
description: "Scaffold a new Python package in an empty directory with src layout, pyproject.toml, uv-managed venv, ruff/mypy config, and a starter test"
name: py-scaffold-project
language: python
allowedTools:
  - Read
  - Write
  - Bash
  - Glob
argumentHint: "<package-name>"
uses:
  rules:
    - python/py-project-layout
  agents: []
tags:
  - python
  - scaffold
  - new-project
whenToUse: "Use when starting a brand-new Python package from scratch. Fires for \"scaffold a new Python package\", \"create a new Python project\", or \"set up a Python package called X\". Not for adding a package to an existing repo or monorepo (use py-add-project) or a feature to an existing project."
---

# Scaffold Project

**Package name:** {sigil:arguments}

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
one-sentence description, install command (`uv sync`), and how to run tests (`pytest`).

## Step 5 — Verify

```bash
ruff check . && mypy . && pytest
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
