---
id: react/react-logging
kind: rule
title: Logging (React)
description: React client-side logging — structured error reporting over console, no PII, dev-only console usage
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/use*.ts"
  - "**/use*.js"
tags:
  - react
  - logging
appliesToRationale: Scoped to components and hook files (use*.ts) because these client-side logging conventions only apply to browser-executed React code — "**/*.ts" also put this rule on plain TypeScript utilities (2026-09-27 live-prompt campaign).
---

## Logging

- `console.*` is for local development. Real errors go to the project's error reporter (Sentry, Datadog RUM); a
  `catch` that only calls `console.error` is invisible once shipped.
- An Error Boundary reports the error and its `componentStack` in `componentDidCatch`, not just a fallback UI.
- No email, name, address, payment detail or auth token in `console` output or in the reporter's context and
  breadcrumbs.
- No unconditional `console.log` in a render body: it fires on every re-render.
- Log a failed API call with endpoint and status, in one place (the query client's `onError` or a shared `fetch`
  wrapper), not at every call site.
