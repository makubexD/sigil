---
id: typescript/ts-security
kind: rule
title: Security (TypeScript)
description: TypeScript security invariants — no secrets in source, logs or errors, constant-time comparison, request timeouts, safe YAML loading
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
severity: required
tags:
  - typescript
  - security
appliesToRationale: Security invariants (secrets, comparison, timeouts) apply to TypeScript source where the risky operations are written; required severity reflects that violations here are not optional.
---

## Security

- No secrets in source, committed config, logs, error messages or `JSON.stringify` output. Commit `.env.example`
  with placeholders, never `.env`.
- Compare secrets with `crypto.timingSafeEqual` after a length check, never `===`.
- Always set a request timeout. Use `AbortSignal.timeout(ms)` on every outbound `fetch`; never
  `rejectUnauthorized: false` outside local tests.
- YAML: `js-yaml` 4+ `load`; upgrade from 3.x.
