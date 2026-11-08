---
id: python/py-conventions
kind: rule
title: "Conventions (Python)"
description: Python-specific style rules — PEP 8, type hints, modern Python idioms, and project tooling conventions (the clean-code baseline arrives through py-code-quality).
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - style
  - pep8
appliesToRationale: Scoped to Python source because these PEP 8 and idiom rules only apply to .py files — there is no equivalent concern in pyproject.toml or other config.
---
- Annotate every function signature and public variable; `X | None`, not `Optional[X]`.
- Structured data is a `@dataclass` or `TypedDict`, not a dict with string keys.
- No mutable default arguments: `def f(items=None)` and set it inside.
- `with` for anything that needs cleanup; `pathlib.Path`, not `os.path`.
- Raise a specific exception (`ValueError`, a custom subclass), never bare `Exception`.
- PEP 8 names (`snake_case`, `PascalCase` classes, `UPPER_SNAKE` constants, `_private`), enforced by `ruff`'s `N`
  rules; imports sorted stdlib, third-party, local by `ruff`/`isort`.
