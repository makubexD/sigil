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
appliesToRationale: Scoped to TypeScript source because logging calls only occur in component/service code; templates and config files never log.
---

## Logging

- Diagnostics go through the project's injectable logger service, never `console.*`, even in a file that already
  uses `console`. Raw `console` output only behind `isDevMode()`.
- Never log in a template expression, `ngDoCheck`, a getter bound in a template, or a per-item `tap` on a hot
  stream.
- Pass the caught error object to the logger, never `error.message` alone. In RxJS, log inside `catchError`
  before mapping to a fallback.
- Context goes in a structured object, not interpolated into the message.
- No credentials, tokens or PII in log messages: client logs are visible to the user and shipped to telemetry.
