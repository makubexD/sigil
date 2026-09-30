---
id: python/py-document
kind: skill
title: "Document (Python)"
description: "Add or update Google-style docstrings for a Python module's public functions and classes, following the project's documented conventions"
name: py-document
language: python
allowedTools:
  - Read
  - Edit
  - Glob
  - Grep
argumentHint: "<file-or-module>"
uses:
  rules:
    - python/py-documentation
  agents: []
tags:
  - python
  - documentation
whenToUse: "Use when a module's public functions/classes lack docstrings, or existing docstrings are stale relative to the current signature. Fires for \"document this file\", \"add docstrings\", or \"update the docs for this module\"."
---

# Document

**Target:** {sigil:arguments}

## Step 1 — Discover the project's docstring convention

Check existing docstrings in the codebase for style (Google, NumPy, or reST) — read 2-3 existing
well-documented modules if any exist. If none exist yet, default to Google-style (see
`py-documentation`).

## Step 2 — Identify undocumented or stale public symbols

For the target file/module, list every symbol not prefixed `_` (public functions, classes,
methods). For each:
- **Missing docstring** — no `"""..."""` at all.
- **Stale docstring** — parameters listed in the docstring's `Args:` don't match the actual
  signature, or the `Returns:`/`Raises:` no longer matches actual behavior.
- **Adequate** — skip; do not touch working documentation that already matches the code.

## Step 3 — Write docstrings

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

## Step 4 — Add a module-level docstring if missing

If the module has non-obvious scope and lacks a top-of-file docstring, add one or two sentences
summarizing its responsibility — not a restatement of the filename.

## Step 5 — Verify

```bash
ruff check .   # confirm no new lint issues from the edit
```
Re-read each edited docstring against the actual current signature — a docstring that describes
intent inaccurately is worse than no docstring.

## Step 6 — Report

```
## Documentation Report

### Documented
- `module.symbol` — <what was added/updated>

### Skipped (already adequate)
- `module.symbol`

### Verification
Lint: clean
```
