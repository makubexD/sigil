---
id: python/python-style
kind: rule
title: Python Style
description: >-
  Python-specific style rules. Extends the shared clean-code baseline with PEP 8,
  type hints, modern Python idioms, and project tooling conventions.
language: python
appliesTo:
  - "**/*.py"
severity: recommended
extends:
  - shared/clean-code
tags:
  - python
  - style
  - pep8
---

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
