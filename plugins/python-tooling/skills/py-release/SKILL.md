---
name: py-release
description: "Prepare a PyPI release — verify quality gates, generate a changelog from git log, and propose a version bump with SemVer classification (Python)"
when_to_use: "Run manually via `/py-release <version>` before cutting a release tag — e.g. \"prepare a release\", \"cut version 2.1.0\", \"generate a release checklist\". Pass the target version number as the argument; omit it to get a suggested bump from recent commits. Does not tag, push, or publish — produces a checklist and changelog draft for human review. Complements py-api-compat-reviewer, which determines the correct SemVer bump from the public API diff."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "<version> (e.g. 2.1.0)"
disable-model-invocation: true
---

# Release Preparation

**Target version:** $ARGUMENTS

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

Discover the combined gate: `ruff check . && ruff format --check . && mypy . && pytest`. Run it as a
single sequence; fall back to individual tools only if the project has a documented custom gate
command (check `pyproject.toml`'s `[tool.hatch.envs.default.scripts]` or a `Makefile`/`tox.ini`
target first).

**If any gate fails: stop and report.** A release with failing gates is blocked.

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `$ARGUMENTS` is provided:** use that as the target version.

**If `$ARGUMENTS` is empty:**
1. Read the current version — from `[project] version` in `pyproject.toml` if static, or from the
   latest git tag if `[tool.hatch.version] source = "vcs"` (dynamic versioning).
2. Read recent commits (Step 4) and suggest a version bump:
   - Any `feat:` commit → **minor** bump (`X.Y+1.0`).
   - Only `fix:` / `refactor:` / `chore:` / `perf:` commits → **patch** bump (`X.Y.Z+1`).
   - A commit body containing `BREAKING CHANGE:` → **major** bump (`X+1.0.0`).
   - A `py-api-compat-reviewer` report with Breaking findings → **major** bump regardless.
Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

If no tag exists: `git log --oneline --no-merges`.

Group commits by type and produce a changelog section:

```markdown
## [<version>] — <today's date>
### ⚠️ Breaking Changes
- <summary of BREAKING CHANGE commits or py-api-compat-reviewer Breaking findings>
### Features
- <summary of feat: commits>
### Bug Fixes
- <summary of fix: commits>
### Performance
- <summary of perf: commits>
### Refactoring / Other
- <refactor, chore, docs, ci, test commits>
```

Omit sections with no entries.

## Step 5 — Check API compatibility

If a `py-api-compat-reviewer` report was produced for this branch, include its SemVer
recommendation and confirm it matches the proposed version bump. If not, suggest running it:

```
Note: py-api-compat-reviewer was not run. For published packages, run it before releasing to
confirm no unintentional breaking changes to the public API surface.
```

Also run `pip-audit` (see `py-packaging`) as part of the release gate — never publish a version with
a known-vulnerable resolved dependency.

## Output Release Checklist

```
## Release Checklist — v<version>

### Quality gates
✅ ruff check: passed  /  ❌ <failure detail>
✅ ruff format --check: passed  /  ❌ N files differ
✅ mypy: passed  /  ❌ <failure detail>
✅ pytest: passed  /  ❌ <failure detail>
✅ pip-audit: no known vulnerabilities  /  ⚠ N flagged

### Working tree
✅ clean  /  ❌ uncommitted changes — resolve before releasing

### Version
Current: <current-version>
Proposed: <target-version>
Bump type: <major / minor / patch>
API compat: <py-api-compat-reviewer SemVer recommendation, or "not run">

### Changelog draft
<markdown changelog section from Step 4>

### Next steps (human action required)
1. Review and edit the changelog above; paste into CHANGELOG.md.
2. Update the version (pyproject.toml, or tag if using vcs-derived versioning).
3. Commit: git commit -m "chore: release v<target-version>"
4. Tag:    git tag -a v<target-version> -m "Release v<target-version>"
5. Push:   git push origin main --tags
6. Build & publish:
           uv build && uv publish --token "$PYPI_TOKEN"
           (or trusted publishing via CI, if configured)
```

---

## Applied Rules

### Conventions (Python)

- **Type hints everywhere.** Annotate every function signature and public variable. Use `from __future__ import annotations` for forward references. Use `X | None` (Python 3.10+) instead of `Optional[X]`.
- **Dataclasses and typed dicts over plain dicts.** Prefer `@dataclass` or `TypedDict` for structured data. Plain dicts with string keys are not self-documenting.
- **f-strings for formatting.** Use f-strings (`f"{value}"`) not `%` formatting or `.format()`.
- **Comprehensions over `map`/`filter`.** List, dict, and set comprehensions are more Pythonic and readable. Avoid `lambda` in `map`/`filter` — use a comprehension instead.
- **Context managers for resources.** Use `with` for files, database connections, locks — anything that needs cleanup.
- **`pathlib.Path` not `os.path`.** Use `pathlib` for all file system operations.
- **Avoid mutable default arguments.** Never use `def f(lst=[])` — use `def f(lst=None)` and initialise inside the function.
- **Single-responsibility imports.** One import per line. Alphabetise within groups: stdlib → third-party → local. Use `isort` or `ruff` to automate.
- **Raise specific exceptions.** Raise `ValueError`, `TypeError`, or a custom subclass — not bare `Exception` or `BaseException`.
- **No bare `except`.** Always specify the exception type(s): `except (ValueError, KeyError)`. Bare `except` swallows `KeyboardInterrupt` and `SystemExit`.
- **Prefer `logging` over `print`.** Use the `logging` module for any output that is not user-facing. Configure a logger per module: `logger = logging.getLogger(__name__)`.
- **PEP 8 naming.** Follow the table below; `ruff`'s `N` (pep8-naming) rules enforce it.

| Symbol | Style | Example |
|---|---|---|
| Functions, methods, variables, parameters | `snake_case` | `parse_ics`, `daily_cap_hours` |
| Classes, exceptions, `Protocol`s, type aliases | `PascalCase` | `CalendarEvent`, `ParseError` |
| Module-level constants | `UPPER_SNAKE` | `MAX_RETRY_COUNT`, `DEFAULT_TIMEZONE` |
| Modules and packages | short `snake_case` | `calendar_parser.py`, `reporting/` |
| Internal (non-public) names | leading `_` | `_to_utc`, `self._cache` |
| Type variables | `T` or short `PascalCase` | `T`, `KT`, `T_co` |

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
