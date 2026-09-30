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

## Docstring Style

Discover the project's existing convention first (Google-style, NumPy-style, or reST) and match it
— do not mix styles within one project. Default to **Google-style** for new projects; it reads
cleanly as plain text and is what Sphinx's `napoleon` extension and most modern tooling expect:

```python
def merge_timeline(
    calendar_rows: list[TimesheetRow],
    dev_rows: list[TimesheetRow],
    daily_cap_minutes: int,
) -> list[TimesheetRow]:
    """Merge calendar rows and dev-activity rows into a unified daily timeline.

    Calendar rows are placed verbatim. Dev rows fill remaining capacity in
    ticket order until the daily cap is reached; the row crossing the cap is
    truncated and later rows are dropped.

    Args:
        calendar_rows: Pre-normalized calendar events for the day.
        dev_rows: Dev-activity rows ordered by ticket priority.
        daily_cap_minutes: Maximum billable minutes for the merged day.

    Returns:
        Merged rows sorted by start time, total duration <= daily_cap_minutes.

    Raises:
        ValueError: If daily_cap_minutes is negative.
    """
```

## What Requires Documentation

Document every **public** function, class, and module: anything not prefixed with `_`. A one-line
docstring is sufficient for a small, self-explanatory function; multi-paragraph docstrings with
`Args`/`Returns`/`Raises` are for anything with non-obvious behavior, side effects, or a contract
the caller must uphold.

For a `Protocol` or abstract base class defining a behavioral contract, document the invariant
implementers must satisfy — not just the method signature.

## Type Hints Are Documentation

Fully annotated signatures document intent as effectively as prose, and unlike prose they are
checked by `mypy`/`pyright`. Prioritize accurate types over restating them in the docstring:

```python
# The type hint already says "list of TimesheetRow, may be empty" — no need to repeat that in prose
def normalize(rows: list[TimesheetRow]) -> list[TimesheetRow]: ...
```

Use `X | None` (3.10+) over `Optional[X]`. A wrong type annotation fails the type checker; a wrong
docstring sentence fails silently — invest accordingly.

## What Must Not Go in Documentation

- Implementation details that will drift (internal data-structure choices, algorithmic steps).
- Commented-out code — delete it; version control remembers it.
- Restating the function name: `"""Get the user."""` on `def get_user(...)` adds nothing.

## Module-Level Docstrings

Give any module with non-obvious scope a top-of-file docstring summarizing its responsibility:

```python
"""Calendar normalizer.

Converts raw CalendarEvent objects (UTC) into TimesheetRow objects in the
configured local timezone, applies deduplication, and enforces the
daily-cap rounding rule.
"""
```

Keep it to one or two sentences — do not restate the filename.

## README Expectations

Every package's `README.md` should cover: what it does (one paragraph), install/quickstart commands
(`uv sync`, `pip install -e .`), required environment variables (names only, never real values), and
how to run tests (`pytest`) and the quality gate (`ruff check . && mypy .`).

## Keeping Docs Current

When a function's signature, return type, or raised exceptions change, update its docstring in the
**same commit**. Update the module docstring if the module's responsibility changed. Update the
README if install steps, CLI flags, or required environment variables changed.
