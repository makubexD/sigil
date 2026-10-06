---
id: python/py-git
kind: rule
title: Git (Python)
description: Python-specific git hygiene — .gitignore for venvs/caches, no secrets, deprecation via warnings.deprecated
language: python
extends:
  - shared/git
appliesTo:
  - "**/*.py"
  - "**/.gitignore"
tags:
  - python
  - git
appliesToRationale: Scoped to Python source and .gitignore because these additions (venv/cache exclusions, deprecation mechanics) are Python-specific on top of the shared git baseline.
---

## Python `.gitignore` Additions

Standard Python additions on top of the shared baseline:

```
__pycache__/
*.py[cod]
.venv/
venv/
.env
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.egg-info/
dist/
build/
.coverage
htmlcov/
```

Never commit a virtual environment (`.venv/`, `venv/`) — it is large, platform-specific, and fully
reproducible from `pyproject.toml` + the lock file.

## No Secrets in History

Never commit secrets — even to a private repo, even temporarily. A `.env` file with real values, a
hardcoded API key in a settings module, or a database URL with embedded credentials is compromised
the moment it lands in history, regardless of a later revert.

If a secret is accidentally committed: rotate it immediately, remove it from history with
`git filter-repo`, and force-push all affected branches (coordinate with the team).

## Python Deprecation Mechanics

Mark a deprecated public symbol with `warnings.deprecated` (3.13+, or the `typing_extensions`
backport on earlier versions) so both type checkers and runtime callers are warned:

```python
from typing_extensions import deprecated

@deprecated("Use merge_timeline() instead. Will be removed in v3.0.")
def merge_rows(...): ...
```

For a library targeting broad compatibility, `warnings.warn(..., DeprecationWarning, stacklevel=2)`
inside the function body remains the portable fallback. Keep the deprecated symbol functional for
at least one release before removal. See `py-api-compat-reviewer` for a systematic pre-release
review of the public surface.

## Pre-Push Checklist (manual — no hooks)

Before pushing: the quality gate is green (`ruff check . && ruff format --check . && mypy . &&
pytest`), no `.env`/credential files are staged, and the commit message follows the shared
convention (imperative mood, `<type>: <summary>`).
