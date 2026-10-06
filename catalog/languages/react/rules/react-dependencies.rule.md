---
id: react/react-dependencies
kind: rule
title: Dependencies (React)
description: React dependency management — bundle-size awareness, peer-dependency ranges, vet before adding, remove unused
language: react
appliesTo:
  - "**/package.json"
  - "**/*.tsx"
  - "**/*.jsx"
tags:
  - react
  - dependencies
appliesToRationale: Scoped to package.json and component files because that is where dependencies are declared and where their bundle-size impact actually lands.
---

## Bundle Size Is a Cost, Not Just Install Time

Every dependency added to a React app ships to the browser (unless it's server-only in an RSC
context). Before adding a UI/utility library, check its bundle-size impact on
[bundlephobia.com](https://bundlephobia.com) and prefer a tree-shakeable, ESM-first package over one
that forces a large monolithic import.

```tsx
// Correct — named import from a tree-shakeable library pulls in only what's used
import { debounce } from "es-toolkit";

// Avoid — a default-export utility-belt library often can't be tree-shaken at all
import _ from "lodash";
```

## Peer Dependencies

React ecosystem libraries (component libraries, form libraries, animation libraries) commonly
declare `react`/`react-dom` as `peerDependencies` with a version range. Before adding one, confirm
its peer range actually covers the project's installed React version — a mismatch produces runtime
errors that `npm install` alone won't catch (npm 7+ warns, but doesn't block).

## Prefer the Platform/Framework Before Adding a Library

Check whether React itself or the framework (Next.js) already covers the need before reaching for a
package: `useId` (stable IDs for SSR), `useDeferredValue`/`useTransition` (built-in scheduling,
before reaching for a "debounce this render" library), `next/image` (image optimization), `next/font`
(font loading) — these avoid an extra dependency and are already integrated with the framework's
hydration model.

## Vet Before Adding

When adding a new dependency:
1. Confirm it is actively maintained and has recent releases addressing issues.
2. Check for known CVEs: `npm audit` after adding.
3. Confirm it ships TypeScript types (bundled `.d.ts` or a `@types/*` package).
4. Check ESM/CJS compatibility with the build tool (Vite, Next.js) — a CJS-only package can still
   work but may need special handling in an ESM-first Vite config.
5. Check the license is compatible with the project.

See `/react-add-package` for an automated vet-and-wire workflow.

## Remove Unused Dependencies

Audit with `depcheck` or `knip` after removing code that used an import — an unused UI library left
in `package.json` still ships its CSS/runtime if imported anywhere, even unintentionally through a
barrel file. Remove the entry and reinstall to refresh the lock file.

## Dependency Updates

Keep dependencies current, especially React itself and the framework — security patches and
concurrent-feature improvements land in minor releases. Prefer automated update PRs (Dependabot,
Renovate) that run the full test suite (including a build, to catch bundle-breaking changes) before
merging. Never merge a major-version bump to React, the framework, or a core UI library without
reading its migration guide — a "backwards-compatible" minor bump can still change default
behavior in a component library.
