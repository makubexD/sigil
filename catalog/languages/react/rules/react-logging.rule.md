---
id: react/react-logging
kind: rule
title: Logging (React)
description: React client-side logging — errors go to the error reporter, not only the console; Error Boundaries report
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
