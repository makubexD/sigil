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

## `console.*` Is Dev-Only, Not Production Telemetry

`console.log`/`console.error` left in production code ships to every user's browser devtools —
acceptable during active development, not as the app's actual error-reporting mechanism. Route real
errors through a structured error-reporting client (Sentry, Datadog RUM, or an internal equivalent):

```tsx
// Correct — structured, reaches the team; console kept for local dev visibility
catch (err) {
  errorReporter.captureException(err, { tags: { feature: "checkout" } });
  if (import.meta.env.DEV) console.error(err);
}

// Avoid as the sole mechanism — invisible once shipped, no alerting, no aggregation
catch (err) {
  console.error(err);
}
```

## Error Boundaries Report, Not Just Catch

An Error Boundary's `componentDidCatch`/`getDerivedStateFromError` should report the caught error to
the structured reporting client, not just render a fallback UI silently:

```tsx
class FeatureErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    errorReporter.captureException(error, { extra: { componentStack: info.componentStack } });
  }
  // ...
}
```

## No PII or Secrets in Client-Side Logs

Never log a user's email, full name, address, payment details, or auth tokens to `console` or a
client-side error reporter's breadcrumbs — anything logged from the browser is visible to that
browser's devtools and, for a reporting service, stored server-side under whatever retention policy
applies. Scrub or omit these fields explicitly when building the error context object.

## Level Discipline (Dev Console)

Reserve `console.error` for genuine failures, `console.warn` for deprecated-usage or
recoverable-but-notable conditions, and `console.info`/`console.debug` for anything else — a
console flooded with `info`-level noise on every render makes the one real `error` easy to miss.
Never call `console.log` inside a component's render body unconditionally — it fires on every
re-render, including ones triggered by unrelated state changes elsewhere in the tree.

## Network Request Failures

Log a failed API call with enough context to reproduce — endpoint, status code, and (non-sensitive)
request parameters — not just "request failed". TanStack Query's `onError` callback or a shared
`fetch` wrapper is the right place to centralize this rather than repeating try/catch logging at
every call site.

```tsx
const { data } = useQuery({
  queryKey: ["user", id],
  queryFn: () => fetchUser(id),
  meta: { errorMessage: "Failed to load user profile" },
});
```

See `react-security` for the fuller PII/secrets invariant this rule's logging guidance is a
specific instance of.
