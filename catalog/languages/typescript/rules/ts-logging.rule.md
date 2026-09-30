---
id: typescript/ts-logging
kind: rule
title: Logging (TypeScript)
description: TypeScript logging conventions — structured logger, no console diagnostics, level discipline, log errors with context, no secrets
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
severity: recommended
extends: []
tags:
  - typescript
  - logging
appliesToRationale: Structured-logger and level-discipline guidance applies to TypeScript source where logging calls are written — not relevant to config or non-code files.
---

## Use a Structured Logger

Never use `console.log`, `console.warn`, or `console.error` for diagnostic logging in a library or
server application. `console` output is unstructured, has no level control, and cannot be routed to
aggregators.

Use a structured logger — discover which one the project uses (pino, winston, tslog, or a
framework-provided logger). Inject it via constructor or function argument; never import a singleton
logger directly in domain code:

```typescript
// Correct — injected logger
class DevPipeline {
  constructor(private readonly logger: Logger) {}

  async run(): Promise<CorrelationEntry[]> {
    this.logger.info({ stage: "start" }, "Dev pipeline starting");
    …
  }
}

// Avoid — console, no level control, not injectable
async function run() {
  console.log("Dev pipeline starting");
}
```

`console.log` is acceptable for **intentional, user-facing CLI output** (e.g. printing a report to
stdout). The distinction: diagnostic telemetry → structured logger; user output → `console`.

## Level Discipline

| Level | Meaning |
|---|---|
| `trace` / `debug` | Detailed internal state useful during debugging; disabled in production |
| `info` | Normal lifecycle events: startup, shutdown, significant state transitions |
| `warn` | Recoverable anomalies: retries, missing optional config, degraded mode |
| `error` | Failures that require attention; always include the `Error` object |
| `fatal` | Unrecoverable errors causing process exit |

Never log `info` or above inside a tight loop or per-item iteration — it serializes hot paths and
floods log aggregators. Per-item progress belongs at `debug` or omitted.

## Log Errors Correctly

Include the `Error` object as a structured field — most structured loggers serialize the `message`,
`stack`, and `cause` chain automatically when you pass `err` as a field:

```typescript
// pino — err field is special-cased and includes stack
logger.error({ err }, "Failed to fetch pull requests for %s", repo);

// winston
logger.error("Failed to fetch pull requests", { error: err, repo });

// Always rethrow or surface after logging — do not swallow
throw new PipelineError(`PR fetch failed for ${repo}`, { cause: err });
```

Never use `String(err)`, `err.message` only, or `JSON.stringify(err)` as the entire error record —
these drop the stack trace and `cause` chain.

## No Secrets or PII in Logs

Credentials, tokens, passwords, and PII must never appear in log messages, structured fields,
exception messages, or serialized `Error` objects. `ts-security` owns the full invariant; the log
call site is a common leak point.

Common mistakes to avoid:
- Logging the entire request object (may contain `Authorization` headers or body with credentials).
- Including user email, phone, or SSN in `info`/`debug` messages.
- Logging environment variable values (even non-secret ones can reveal configuration).

## Lazy / Guarded Messages

Avoid building expensive log strings that will be discarded because the level is disabled. Use
structured fields — the logger serializes them only when the message is emitted:

```typescript
// Correct — object spread is cheap; serialization is lazy
logger.debug({ count: rows.length, date: isoDate }, "Rows normalized");

// Avoid — string interpolation is always evaluated, even when debug is off
logger.debug(`Rows normalized: ${rows.length} rows for ${isoDate}`);
```

For messages that require non-trivial computation (e.g. serializing a large object for inspection),
guard behind a level check:

```typescript
if (logger.isLevelEnabled("trace")) {
  logger.trace({ payload: JSON.stringify(largeObject) }, "Full payload");
}
```
