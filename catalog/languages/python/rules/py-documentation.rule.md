---
id: python/py-documentation
kind: rule
title: Documentation (Python)
description: Python docstring conventions (Google/NumPy style), type hints as documentation, and README expectations
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - documentation
appliesToRationale: Scoped to Python source because docstring conventions only apply to Python function/class definitions.
---

## Docstrings

- Match the project's docstring style (Google, NumPy or reST); never mix them. New projects: Google style.
- Every public module, class and function (no `_` prefix) has a docstring. One line for an obvious function;
  `Args`/`Returns`/`Raises` when behavior, side effects or the caller's contract is not obvious.
- A `Protocol` or ABC documents the invariant implementers must keep, not just the signature.
- Don't restate the type hints, the name (`"""Get the user."""`), or implementation steps that will drift.
- A module with non-obvious scope gets a one- or two-sentence module docstring.
- When a signature, return type or raised exception changes, update the docstring in the same commit; update the
  README when install steps, CLI flags or required environment variables change.
