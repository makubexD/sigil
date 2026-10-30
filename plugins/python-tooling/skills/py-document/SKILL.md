---
name: py-document
description: "Add or update Google-style docstrings for a Python module's public functions and classes, following the project's documented conventions"
when_to_use: "Use when a module's public functions/classes lack docstrings, or existing docstrings are stale relative to the current signature. Fires for \"document this file\", \"add docstrings\", or \"update the docs for this module\"."
allowed-tools: Read, Edit, Glob, Grep
argument-hint: "<file-or-module>"
---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

If `$ARGUMENTS` is provided, use it as the target file or module. If empty, ask the user
which module to document before proceeding.

## Step 2 — Discover documentation style

Check existing docstrings in the codebase for style (Google, NumPy, or reST) — read 2-3 existing
well-documented modules if any exist. If none exist yet, default to Google-style (see
`py-documentation`).

## Step 3 — Read the target

For the target file/module, list every symbol not prefixed `_` (public functions, classes,
methods). For each:
- **Missing docstring** — no `"""..."""` at all.
- **Stale docstring** — parameters listed in the docstring's `Args:` don't match the actual
  signature, or the `Returns:`/`Raises:` no longer matches actual behavior.
- **Adequate** — skip; do not touch working documentation that already matches the code.

## Step 4 — Write documentation

For each function/method, write a docstring covering: a one-line summary, `Args:` for each
non-trivial parameter (skip restating an obvious `self`), `Returns:` describing the contract (not
just repeating the type), and `Raises:` for exceptions the caller might need to handle.

```python
def merge_timeline(
    calendar_rows: list[TimesheetRow],
    dev_rows: list[TimesheetRow],
    daily_cap_minutes: int,
) -> list[TimesheetRow]:
    """Merge calendar rows and dev-activity rows into a unified daily timeline.

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

For a class, document the class itself (its overall responsibility) plus each public method. For a
`Protocol`/abstract base class defining a behavioral contract, document the invariant implementers
must uphold, not just the signature.

### Add a module-level docstring if missing

If the module has non-obvious scope and lacks a top-of-file docstring, add one or two sentences
summarizing its responsibility — not a restatement of the filename.

## Step 5 — Run and report

```bash
ruff check .   # confirm no new lint issues from the edit
```
Re-read each edited docstring against the actual current signature — a docstring that describes
intent inaccurately is worse than no docstring.

```
## Documentation Report

### Documented
- `module.symbol` — <what was added/updated>

### Skipped (already adequate)
- `module.symbol`

### Still undocumented: <N>
- `module.symbol` — <why it was left (e.g. intent unclear from the code)>

### Verification
Lint: clean
```

---

## Applied Rules

### Documentation (Python)

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
