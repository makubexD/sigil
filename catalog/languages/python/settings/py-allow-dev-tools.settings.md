---
id: python/py-allow-dev-tools
kind: settings
title: "Allow Dev Tools (Python)"
description: >-
  Grants Claude Code permission to run the standard Python development commands (pytest, ruff,
  mypy) without per-call confirmation (Python)
language: python
permissions:
  allow:
    - "Bash(pytest *)"
    - "Bash(python -m pytest *)"
    - "Bash(ruff check *)"
    - "Bash(ruff format *)"
    - "Bash(mypy *)"
tags: [permissions, developer-experience, python]
---

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json` using
array-union semantics: your existing allow entries are preserved; only missing entries are added.

**What's allowed:**
- `pytest *`, `python -m pytest *`: run the test suite
- `ruff check *`, `ruff format *`: lint and format
- `mypy *`: type-check

No `git` entries: Claude Code already runs read-only commands such as `git status` and `git diff`
without a prompt.

To allow more commands, install another settings artifact with extra allow entries or use
`sigil patch python/py-allow-dev-tools --add-permission-allow "Bash(your-command)"`.
