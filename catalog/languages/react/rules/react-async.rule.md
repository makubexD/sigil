---
id: react/react-async
kind: rule
title: Async (React)
description: React async data patterns — where a Server Component reads data and where a query hook belongs
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

- A Server Component `await`s its data directly; a query hook belongs only in a `"use client"` component that
  refetches, mutates or updates optimistically.
