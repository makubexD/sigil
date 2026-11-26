---
id: react/react-async
kind: rule
title: Async (React)
description: React async data patterns — no raw fetch-in-useEffect, TanStack Query for server state, race conditions, Suspense
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/use*.ts"
  - "**/use*.js"
tags:
  - react
  - async
appliesToRationale: Scoped to components and hook files (use*.ts) because async data-fetching patterns are a React/hooks concern — "**/*.ts" also put this rule on plain TypeScript utilities (2026-09-27 live-prompt campaign).
---

## Async

- Server state (anything fetched from an API) goes through the project's query library (TanStack Query, SWR), not
  a bare `fetch` in `useEffect`. `useState`/`useReducer` hold client state only.
- When a raw effect fetch is unavoidable, guard against out-of-order responses with a cleanup flag or
  `AbortController`, and abort in the effect's cleanup.
- A Server Component `await`s its data directly; a query hook belongs only in a `"use client"` component that
  refetches, mutates or updates optimistically.
- Writes use `useMutation` and invalidate the affected query keys on success, unless the update is deliberately
  optimistic.
- Put a `<Suspense>` boundary close to where the data is read, not one around the whole page.
- An `async` event handler wraps its body in `try`/`catch` and shows the failure to the user.
