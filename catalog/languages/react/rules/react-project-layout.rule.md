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

## Feature-Based Folders Over Type-Based Folders

Prefer grouping by feature/domain over grouping by file type — a `components/`, `hooks/`, `utils/`
split at the top level forces every feature change to touch three unrelated directories:

```
src/
  features/
    checkout/
      components/     # feature-local components
      hooks/           # feature-local hooks
      api.ts           # feature-local data fetching
      types.ts
    profile/
      components/
      hooks/
      api.ts
  components/          # only truly shared, cross-feature components (Button, Modal)
  hooks/                # only truly shared, cross-feature hooks
  lib/                  # framework-agnostic utilities
```

A component used by exactly one feature belongs inside that feature's folder, not in the shared
`components/` directory — promote it to shared only when a second feature actually needs it.

## Next.js App Router Conventions

For a Next.js App Router project, `app/` owns routing — `page.tsx` (route UI), `layout.tsx` (shared
chrome), `loading.tsx` (Suspense fallback), `error.tsx` (Error Boundary), `route.ts` (API handler).
Keep feature logic in `src/features/` and import it into the thin `app/` route files — do not build
business logic directly inside `page.tsx`; that couples it to the routing file and makes it
untestable outside Next's app runtime.

```
app/
  checkout/
    page.tsx        # thin — imports from features/checkout
    loading.tsx
    error.tsx
src/
  features/checkout/
    CheckoutForm.tsx
    useCheckout.ts
```

## Server vs. Client Components

Default every component to a Server Component (no directive) unless it needs interactivity
(`useState`, `useEffect`, event handlers) or a browser-only API — then mark it `"use client"`.
Push the `"use client"` boundary as far down the tree as possible; marking a large layout component
client-only forces its entire subtree to hydrate on the client even if most of it is static.

## Standalone/Vite Projects

For a non-Next.js SPA (Vite), mirror the same feature-based structure under `src/`, with `main.tsx`
as the sole entry point and `src/routes/` (if using a router) kept thin the same way `app/` is kept
thin in Next.js.

## Path Aliases

Configure a `@/*` path alias (in `tsconfig.json`'s `paths` and the bundler config) so imports read
`@/features/checkout/CheckoutForm` instead of `../../../features/checkout/CheckoutForm` — deep
relative imports are a refactoring hazard and hide the actual module distance.

## Environment Configuration

Client-exposed variables must use the framework's public prefix (`NEXT_PUBLIC_*` for Next.js,
`VITE_*` for Vite) — anything without that prefix stays server-only and is never bundled into
client JavaScript. Never assume an unprefixed variable is "probably fine to read" in a Client
Component; it will be `undefined` at runtime, or worse, silently inlined as an empty string
depending on the bundler.

## `loadComponent`-Style Code Splitting

Use `next/dynamic` (Next.js) or `React.lazy` (Vite/plain React) to code-split a route or
heavy/rarely-used component (a modal, a chart library) rather than including it in the main bundle
unconditionally — wrap the lazy import in a `<Suspense>` boundary with an appropriately-sized
fallback.

See `react-generate-tests` for how `tests/`/`__tests__` co-location fits this same feature-based
layout.
