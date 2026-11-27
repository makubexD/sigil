---
id: typescript/ts-logging
kind: rule
title: Logging (TypeScript)
description: TypeScript logging conventions — no per-item info records in a loop, injected logger
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

- No `info` or above per item inside a loop; per-item detail is `debug` or nothing.
- If the project has no logger, accept an injected `Logger` (`info`/`warn`/`error`).
