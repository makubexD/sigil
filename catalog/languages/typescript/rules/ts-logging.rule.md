---
id: typescript/ts-logging
kind: rule
title: Logging (TypeScript)
description: TypeScript logging conventions — structured logger, no console diagnostics, level discipline, log errors with context, no secrets
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
tags:
  - typescript
  - logging
appliesToRationale: Structured-logger and level-discipline guidance applies to TypeScript source where logging calls are written — not relevant to config or non-code files.
---

## Logging

- Diagnostics go through the project's structured logger (pino, winston, tslog), never `console.*`, even in a file
  that already uses `console`. If the project has no logger, accept an injected `Logger` (`info`/`warn`/`error`);
  domain code never imports a logger singleton. `console.log` only for output the CLI user is meant to read.
- Context goes in structured fields (`logger.debug({ count }, "Rows normalized")`), not interpolated into the
  message.
- Log an error as the object (`logger.error({ err }, "...")`), never `String(err)` or `err.message` alone; then
  rethrow or surface it.
- No `info` or above per item inside a loop; per-item detail is `debug` or nothing.
- Credentials, tokens, passwords, and PII must never appear in log messages or structured fields (watch whole
  request objects, header maps and environment values).
