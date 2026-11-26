---
id: typescript/ts-security
kind: rule
title: Security (TypeScript)
description: TypeScript security invariants — no hardcoded secrets, safe I/O, injection prevention, prototype pollution, deserialization safety
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
severity: required
tags:
  - typescript
  - security
appliesToRationale: Security invariants (secrets, injection, deserialization) apply to TypeScript source where the risky operations are written; required severity reflects that violations here are not optional.
---

## Security

- No secrets in source, committed config, logs, error messages or `JSON.stringify` output. Read them from
  `process.env` and fail fast when one is missing; no fallback such as `process.env.API_TOKEN ?? "dev-token"`.
  Commit `.env.example` with placeholders, never `.env`.
- Start a process with `execFile` or `spawn` and an argument array; never `exec`, `execSync` or `shell: true` with
  interpolated input.
- A user-supplied path is `path.resolve`d against an allowed root and must start with that root plus `path.sep`.
- No `eval`, `new Function(code)` or `vm.runInNewContext` on external data. Validate `JSON.parse` output with a
  schema (zod, valibot, arktype) before using it as a typed object. YAML: `js-yaml` 4+ `load`; upgrade from 3.x.
- When copying keys from external data, skip `__proto__`, `constructor` and `prototype`; a lookup built from
  external keys is a `Map` or `Object.create(null)`.
- Tokens and IDs come from `crypto.randomUUID` or `randomBytes`, never `Math.random()`; compare secrets with
  `crypto.timingSafeEqual` after a length check, never `===`.
- Always set a request timeout. Use `AbortSignal.timeout(ms)` on every outbound `fetch`; never
  `rejectUnauthorized: false` outside local tests.
- A request made on behalf of user input goes to an allowlisted target. Failing that, check the resolved address
  and reject loopback, private and link-local (`169.254.x`) ranges and non-HTTP schemes.
