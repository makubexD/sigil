---
id: python/py-logging
kind: rule
title: Logging (Python)
description: Python logging conventions — no per-item INFO records in a loop, print only for CLI output, no PII
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - logging
appliesToRationale: Scoped to Python source because logging call-site conventions only apply to Python code.
---

## Logging

- No `INFO` or above per item inside a loop; per-item detail is `DEBUG` or nothing.
- `print` (or `click.echo`/`rich`) only for output the CLI user is meant to read.
- No PII in messages or `extra` (watch request objects and whole user records).
