---
id: python/py-logging
kind: rule
title: Logging (Python)
description: Python structured logging — logging module over print, level discipline, no secrets, lazy formatting
language: python
appliesTo:
  - "**/*.py"
tags:
  - python
  - logging
appliesToRationale: Scoped to Python source because logging call-site conventions only apply to Python code.
---

## Logging

- Diagnostics go through `logger = logging.getLogger(__name__)`, never `print`, even in a module that already prints.
  `print` (or `click.echo`/`rich`) only for output the CLI user is meant to read.
- Context goes in `extra=` (or `structlog` keywords if the project uses it), not into the message string.
  For a formatted message, pass arguments lazily: `logger.debug("%s items", n)`, not an f-string.
- In an `except` at a boundary, `logger.exception(...)` (keeps the traceback), never just `str(exc)`.
- No `INFO` or above per item inside a loop; per-item detail is `DEBUG` or nothing.
- No credentials, tokens or PII in messages or `extra` (watch request objects, header dicts, whole user records).
- Configure logging once, at the entry point; a library module only gets a logger and emits.
