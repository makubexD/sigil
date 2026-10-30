---
name: py-add-package
description: "Vet and wire a new PyPI package via uv/pip — checks CVEs, maintenance, license, and py.typed before adding (Python)"
when_to_use: "Use any time you need to add a new PyPI dependency — fires for \"add the httpx package\", \"install requests\", or \"add pytest-mock as a dev dependency\". Pass the package name; optionally pin a version and add --dev for test/lint-only packages (dependency-groups). Confirms before adding if vetting flags risk. Not for updating an already-installed package's version — see py-audit-deps for checking existing dependencies."
allowed-tools: Read, Bash, Glob, Grep, Edit
argument-hint: "<package-name> [version] [--dev]"
---

# Add Package

**Package:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<package-name>`
- If a second token looks like a version (e.g. `2.31.0`, `>=2.0`) → `<version>`; else auto-discover
- If `--dev` is present → treat as a dev-only dependency (added to `[dependency-groups] dev`)

## Step 1 — Discover repo layout

Locate `pyproject.toml`, determine the package manager in use (`uv.lock` present → `uv`;
`poetry.lock` → `poetry`; neither → plain `pip` + `requirements.txt`), and check whether the
package is already declared (`grep -n "<package-name>" pyproject.toml requirements*.txt`) — if
found, report the existing constraint and ask whether to update instead of add.

## Step 2 — Vet the package

**CVE check:**
```bash
pip index versions <package-name> 2>&1   # confirm it exists and see available versions
```
Then, after tentatively adding (see Step 4), run `pip-audit` against the resolved environment.

Check https://pypi.org/project/<package-name>/ for: **maintenance status** (last release date,
open issues — flag if last release > 18 months ago); **license** (MIT/BSD/Apache typically fine,
GPL/AGPL needs review); **stdlib alternative** (does `pathlib`/`json`/`dataclasses`/etc. already
cover this? If yes, recommend it and stop); **type support** (`py.typed` marker present, or a
`types-<package>` stub package available — flag if neither exists and the project runs `mypy`).

**If vetting flags a risk:** present the finding and ask for explicit confirmation before proceeding.

## Step 3 — Determine version

**If `<version>` was provided:** use it exactly.

**If not provided:** fetch the latest stable version (`pip index versions <package-name>`); prefer
the latest stable, avoid pre-release unless explicitly requested.

## Step 4 — Add the package

Add through the project's package manager.


**uv (preferred if `uv.lock` present or no lock file exists yet):**
```bash
uv add "<package-name>==<version>"                    # runtime dependency
uv add --group dev "<package-name>==<version>"        # --dev
```

**poetry:**
```bash
poetry add "<package-name>@<version>"
poetry add --group dev "<package-name>@<version>"     # --dev
```

**plain pip + requirements.txt:** append the pinned line to `requirements.txt` (or
`requirements-dev.txt` for `--dev`), then `pip install -r requirements.txt`.

## Step 5 — Verify the install

### Lock file

```bash
git diff uv.lock  # or poetry.lock — confirm the new package + its transitive deps appear
```

### Quality gate

```bash
ruff check . && mypy . && pytest   # through the project's runner if it has one: uv run, poetry run
```

If the gate fails, **undo the addition** (revert `pyproject.toml` and the lock file) and report the
failure.

## Step 6 — Report

```
## Add Package Report

Package: <package-name> v<version>
Manager: <uv / poetry / pip>
Dev-only: <yes / no>

### Vetting
- CVEs: <none detected / ⚠ flagged — detail>
- License: <MIT / Apache-2.0 / ⚠ flagged — detail>
- Maintenance: <active / ⚠ last release: <date>>
- Types: <py.typed / types-<pkg> available / ⚠ untyped>
- Built-in alternative: <none / ⚠ stdlib can replace — recommendation>

### Gate
✅ lint, type-check, and tests passed  /  ❌ <failure detail>

### Next steps
<Any recommended follow-up.>
```

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
