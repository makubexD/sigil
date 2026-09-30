---
id: angular/ng-logging
kind: rule
title: Logging (Angular)
description: Angular logging conventions — logger abstraction, levels, no secrets/PII, no console spam
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - logging
---

## Use a Logger Abstraction
Route diagnostics through an injectable `LoggerService`, not scattered `console.*` calls. A single
abstraction lets you set levels, add context, route to a backend, and silence output in production
from one place:

```ts
@Injectable({ providedIn: 'root' })
export class LoggerService {
  warn(message: string, context?: Record<string, unknown>): void { /* … */ }
  error(message: string, error?: unknown, context?: Record<string, unknown>): void { /* … */ }
}
```

Raw `console.*` is acceptable only for intentional, developer-facing output, and should be gated by
`isDevMode()` so it does not run in production builds. `console.log` for diagnostics in committed
code is a smell — use the logger.

## Level Discipline
Use each level for its intended meaning — do not downgrade severity for comfort:

- `debug` — internal state useful only when diagnosing a specific failure.
- `info` — high-level lifecycle events (app init, feature loaded, config applied). Not every emission.
- `warn` — something unexpected that the app handled; may indicate a future problem.
- `error` — a real failure; the operation could not complete.

**Never log inside change-detection-sensitive paths or tight loops.** Do not log in template
expressions, `ngDoCheck`, getters bound in templates, or per-item RxJS `tap`/`map` on a hot stream —
this serializes hot paths and floods log aggregators. Per-item trace belongs at `debug` or nowhere.

## Log the Error Object
Pass the caught error through so its stack is preserved; do not log only `error.message`.

```ts
try {
  await this.api.load(id);
} catch (err) {
  this.logger.error('Failed to load resource', err, { id }); // full stack retained
  throw new Error(`load failed for ${id}`, { cause: err });
}
```

In RxJS, log in `catchError` with the error object before mapping to a fallback — never an empty
`catchError(() => EMPTY)` that hides the failure.

## No Secrets or PII in Logs
Client-side logs are visible to the user and may be shipped to a telemetry backend, so they are a
prime leak point. Credentials, tokens, and personally identifiable information must never appear in
log messages or error output. See `ng-security` for the full secrets invariant — this rule owns the
*where*: the logging call site.

## Structured Fields, Guarded Construction
Prefer structured context objects over string interpolation so logs stay queryable:

```ts
// Prefer — structured, queryable
this.logger.info('order placed', { orderId, total });

// Avoid — opaque string blob
this.logger.info(`order ${orderId} placed for ${total}`);
```

Guard or defer construction of expensive log payloads so they are not built when the level is
disabled.
