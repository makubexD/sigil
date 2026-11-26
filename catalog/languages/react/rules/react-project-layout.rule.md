---
id: react/react-project-layout
kind: rule
title: Project Layout (React)
description: React project structure — feature-based folders, Next.js App Router conventions, environment config, path aliases
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/package.json"
tags:
  - react
  - project-layout
appliesToRationale: Scoped to component files and package.json because these are structural/organizational conventions, not runtime logic.
---

## Project Layout

- Group by feature (`src/features/<feature>/` with its own components, hooks, `api.ts`), not by file type. A
  component used by one feature lives in that feature; it moves to shared `components/` when a second one needs it.
- Next.js App Router: `app/` route files (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`) stay
  thin and import from `src/features/`; no business logic in `page.tsx`. A Vite SPA keeps `src/routes/` thin the
  same way, with `main.tsx` as the only entry point.
- A component is a Server Component unless it needs state, effects, event handlers or a browser API; push
  `"use client"` as far down the tree as possible.
- Import through the `@/*` alias (in `tsconfig.json` `paths` and the bundler config), not deep relative paths.
- Only variables with the framework's public prefix (`NEXT_PUBLIC_*`, `VITE_*`) are readable in client code.
- Code-split a route or a heavy, rarely used component with `next/dynamic` or `React.lazy` inside a `<Suspense>`.
