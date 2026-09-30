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

## Use `logging`, Not `print`

Never use `print()` for diagnostic output in a library or service. `print` has no level control, no
structured fields, and cannot be routed to an aggregator. Get a module-level logger and use it:

```python
import logging

logger = logging.getLogger(__name__)

def run_pipeline() -> None:
    logger.info("Pipeline starting")
```

`print()` is acceptable only for **intentional, user-facing CLI output** — a report printed to
stdout that the user is meant to read directly. The distinction: diagnostic telemetry → `logging`;
user output → `print` (or `rich`/`click.echo` for formatted CLI output).

## Structured Fields, Not String Interpolation

Pass contextual data as `extra=` or use a structured backend (`structlog`) rather than
interpolating it into the message string — this keeps the message stable for aggregation/alerting
and makes fields queryable:

```python
# Correct — structured extra field
logger.info("Row normalized", extra={"row_count": len(rows), "date": iso_date})

# Avoid — string interpolation defeats log aggregation grouping
logger.info(f"Row normalized: {len(rows)} rows for {iso_date}")
```

If the project uses `structlog`, prefer its `bind()`/keyword-argument style throughout instead of
mixing it with stdlib `logging` calls.

## Level Discipline

| Level | Meaning |
|---|---|
| `DEBUG` | Detailed internal state useful during debugging; disabled in production |
| `INFO` | Normal lifecycle events: startup, shutdown, significant state transitions |
| `WARNING` | Recoverable anomalies: retries, missing optional config, degraded mode |
| `ERROR` | Failures that require attention; always pass `exc_info=True` or use `logger.exception` |
| `CRITICAL` | Unrecoverable errors causing process exit |

Never log at `INFO` or above inside a tight loop or per-item iteration — it floods aggregators.
Per-item progress belongs at `DEBUG` or is omitted entirely.

## Log Exceptions with Context

Use `logger.exception(...)` inside an `except` block — it automatically attaches the traceback at
`ERROR` level. Never log only `str(exc)`; that drops the traceback.

```python
try:
    process(item)
except ValueError:
    logger.exception("Failed to process item", extra={"item_id": item.id})
    raise
```

## Lazy Formatting

Pass format arguments to the logging call itself rather than pre-formatting the string — the
`logging` module only formats the message if the level is enabled, avoiding wasted work when the
level is disabled:

```python
# Correct — lazy; only formatted if DEBUG is enabled
logger.debug("Processing %s items for %s", len(items), user_id)

# Avoid — f-string is always evaluated regardless of the effective level
logger.debug(f"Processing {len(items)} items for {user_id}")
```

## No Secrets or PII in Logs

Credentials, tokens, passwords, and PII must never appear in log messages or `extra` fields.
`py-security` owns the full invariant; the log call site is the most common leak point — auditing
every `logger.*` call for an accidentally-included request object, header dict, or full user record
is worth doing explicitly, not just trusting the type signature.

## Configure Once, at the Entry Point

Call `logging.basicConfig(...)` (or configure `structlog`) exactly once, in the application's entry
point — never inside a library module, and never repeatedly inside a function. Libraries should
only call `logging.getLogger(__name__)` and emit records; the application decides handlers,
formatters, and levels.
