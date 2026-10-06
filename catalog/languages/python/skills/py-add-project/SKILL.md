---
id: python/py-add-project
kind: skill
title: "Add Project (Python)"
description: "Add a package to an existing Python repo or monorepo with its standards pre-wired — uv/hatch/pdm/poetry workspace, src layout, pyproject.toml, tests — then lint, type-check and test it (Python)"
name: py-add-project
language: python
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=lib|app]"
uses:
  rules:
    - python/py-project-layout
  agents:
    - python/py-architecture-reviewer
tags:
  - python
  - scaffold
  - project
whenToUse: "Run via `/py-add-project <name>` when an existing Python repo or monorepo needs another package — e.g. \"add a reporting package to the workspace\", \"create a new lib under packages/\". Pass the package name and optional `--type`. Requires an existing root `pyproject.toml`; to start a brand-new package in an empty directory use py-scaffold-project instead. Never overwrites existing files; confirms before editing the root workspace config."
---

# Add Project

**Package name + type:** {sigil:arguments}

Parse `{sigil:arguments}`: first token → `<name>` (distribution name, e.g. `acme-reporting`; the
import name is the snake_case form, `acme_reporting`); `--type=<lib|app>` (default: `lib`).

## Step 1 — Discover repo standards

Confirm a root `pyproject.toml` exists. If it does not, **stop** — this skill adds to an existing
repo; starting a new package is a different task.

Read the root `pyproject.toml` and identify the workspace tool:
- **uv** — `[tool.uv.workspace] members` / `exclude`, plus `[tool.uv.sources]` (`workspace = true`)
- **hatch** — `[tool.hatch.envs.*]` and any per-package `pyproject.toml`
- **pdm** — `[tool.pdm]` and dev-dependency groups
- **poetry** — `[tool.poetry]` and path dependencies (`{ path = "...", develop = true }`)

Also read: the build backend (`[build-system]`), `requires-python`, shared `[tool.ruff]`,
`[tool.mypy]` and `[tool.pytest.ini_options]`, `{sigil:conventions-file}` for documented layering
and naming, and one existing sibling package as a concrete reference (its layout — `src/` or flat —
its `pyproject.toml`, and its tests directory). Mirror the sibling, not a generic template.

## Step 2 — Determine placement

Place the package where the workspace globs already point (e.g. `packages/<name>/`, `libs/<name>/`,
`apps/<name>/` for `--type=app`). Use the sibling's layout:
- src layout → `<root>/<name>/src/<import_name>/__init__.py` + `<root>/<name>/tests/`
- flat layout → `<root>/<name>/<import_name>/__init__.py` + `<root>/<name>/tests/`

**Do not overwrite any existing file** — if the target path or the distribution name already
exists in the workspace, stop and report.

## Step 3 — Scaffold the project

Create `<root>/<name>/pyproject.toml` with the same build backend, `requires-python`, and
dependency style as the sibling:

```toml
[project]
name = "<name>"
version = "0.1.0"
description = "<one line>"
requires-python = "<same as siblings>"
dependencies = []

[build-system]
requires = ["hatchling"]          # same backend as the sibling
build-backend = "hatchling.build"
```

Inherit ruff/mypy/pytest settings from the root config instead of copying them; add a per-package
section only when siblings do. Create `__init__.py`, a `py.typed` marker if siblings ship one, and
a seed module with type hints and a docstring. For `--type=app`, add the entry point the siblings
use (`[project.scripts]` or `__main__.py`).

## Step 4 — Scaffold the tests

Create `<root>/<name>/tests/` matching the sibling (with or without `__init__.py`, `conftest.py`
if siblings have one) and a seed test that imports the package and asserts one real behavior of
the seed module — no `assert True` placeholder left behind.

## Step 5 — Add to the solution or workspace

Present what will change before editing the root config:

```
The following will be updated:
  pyproject.toml   — [tool.uv.workspace] members += "<root>/<name>"   (if no glob covers it)
                     [tool.uv.sources] <name> = { workspace = true }   (if a sibling depends on it)

Proceed? [y/N]
```

Wait for confirmation. If an existing glob (e.g. `packages/*`) already covers the path, say so and
skip the edit. Then install it editable with the workspace tool:

```bash
uv sync --all-packages          # uv workspace
hatch env create                # hatch
pdm install                     # pdm
poetry install                  # poetry (after adding the path dependency)
pip install -e <root>/<name>    # no workspace tool
```

## Step 6 — Build and test

```bash
uv run ruff check <root>/<name>
uv run ruff format --check <root>/<name>
uv run mypy <root>/<name>/src     # or the flat package path
uv run pytest <root>/<name>/tests
```

Swap `uv run` for the discovered tool's runner. If any command fails, report the error — do not
leave a broken package in the workspace.

## Step 7 — Report

```
## Add Project Report

Package:     <root>/<name>/
Import name: <import_name>
Type:        <lib / app>
Tool:        <uv / hatch / pdm / poetry / pip>
Added to:    <workspace glob already covered / root pyproject.toml updated>

Files created:
  <root>/<name>/pyproject.toml
  <root>/<name>/src/<import_name>/__init__.py
  <root>/<name>/src/<import_name>/<module>.py
  <root>/<name>/tests/test_<module>.py

Standards applied:
  ✅ Layout matches siblings (src / flat)
  ✅ Same build backend and requires-python
  ✅ Ruff / mypy / pytest config inherited from root
  ✅ Seed test asserts real behavior

Lint:       ✅ passed  /  ❌ <error>
Type check: ✅ passed  /  ❌ <error>
Tests:      ✅ passed  /  ❌ <error>
```
