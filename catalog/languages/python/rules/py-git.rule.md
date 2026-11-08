---
id: python/py-git
kind: rule
title: Git (Python)
description: Python .gitignore additions — venvs, caches, build output and tool state
language: python
extends:
  - shared/git
appliesTo:
  - "**/.gitignore"
tags:
  - python
  - git
appliesToRationale: Scoped to .gitignore because the Python-specific additions (venv/cache exclusions) apply on top of the shared git baseline.
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
