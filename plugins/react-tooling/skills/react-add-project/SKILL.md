---
name: react-add-project
description: "Add an app or package to an existing React workspace with its standards pre-wired — npm/pnpm/yarn workspaces, Turborepo/Nx, tsconfig references, Vitest or Jest with Testing Library — then build and test it (React)"
when_to_use: "Run via `/react-add-project <name>` when an existing JavaScript workspace (npm/pnpm/yarn workspaces, Turborepo, or Nx) needs another React app or package — e.g. \"add an admin app to the monorepo\", \"create a shared ui package\". Pass the name and optional `--type`. Requires an existing workspace; to start a brand-new React app in an empty directory use react-scaffold-project instead. Never overwrites existing files; confirms before editing root workspace config."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<name> [--type=app|lib]"
---

# Add Project

**Project name + type:** $ARGUMENTS

Parse `$ARGUMENTS`: first token → `<name>` (e.g. `admin`, `@acme/ui`); `--type=<app|lib>`
(default: `lib`).

## Step 1 — Discover repo standards

Confirm the repo is a workspace: root `package.json` `"workspaces"`, `pnpm-workspace.yaml`, or
`nx.json`. If none exists, **stop** — this skill adds to an existing workspace; creating a new app
is a different task.

Read: the workspace globs; the package manager (lockfile: `package-lock.json`, `pnpm-lock.yaml`,
`yarn.lock`); `turbo.json` or `nx.json` task pipelines; `tsconfig.base.json` / root `tsconfig.json`
(`references`, `paths`); `eslint.config.*`; `CLAUDE.md` for documented layering and
naming; and one existing sibling of the same type as the concrete reference — its `package.json`
(name scope, scripts, `exports`), `tsconfig.json`, bundler config (`vite.config.*`), and test setup.
Use the test runner the sibling actually depends on (Vitest or Jest, with Testing Library) — never
assume one.

## Step 2 — Determine placement

Place the project where the workspace globs already point (e.g. `apps/<name>/` for `--type=app`,
`packages/<name>/` for `--type=lib`). Use the sibling's name scope (`@acme/<name>`) and its
internal layout (`src/`, feature folders). **Do not overwrite any existing file** — if the target
path or package name already exists, stop and report.

## Step 3 — Scaffold the project

Prefer the repo's own generator when it has one:

```bash
npx nx g @nx/react:application <name> --directory=apps/<name>   # Nx
npx nx g @nx/react:library <name> --directory=packages/<name>   # Nx
npx turbo gen workspace --name <name> --copy <sibling>          # Turborepo
npm create vite@latest apps/<name> -- --template react-ts       # no generator (app)
```

Otherwise copy the sibling's shape by hand. Then align the result with the sibling: `package.json`
scripts and scope, `tsconfig.json` extending the base, ESLint config, and — for a library — an
explicit `exports` map, `react`/`react-dom` as `peerDependencies`, and a seed component that shows
the conventions (function component, typed props, named export).

## Step 4 — Scaffold the tests

Copy the sibling's test setup: runner config (`vitest.config.*` or `jest.config.*`), the
environment (`jsdom` / `happy-dom`), and the setup file that loads `@testing-library/jest-dom`.
Create a seed test next to the seed component that renders it with Testing Library and asserts one
real behavior through a role or label query — no placeholder assertion left behind.

## Step 5 — Add to the solution or workspace

Present what will change before editing root config:

```
The following will be updated:
  package.json / pnpm-workspace.yaml   — workspace glob   (only if no glob covers the path)
  tsconfig.json                        — references += { "path": "<placement>/<name>" }
  tsconfig.base.json                   — paths: "<scope>/<name>"   (if siblings use paths)

Proceed? [y/N]
```

Wait for confirmation, then install with the discovered package manager (`npm install`,
`pnpm install`, or `yarn install`) so the new package is linked into the workspace.

## Step 6 — Build and test

Run the new project's tasks through the workspace runner, scoped to it:

```bash
npx turbo run build test lint --filter=<package-name>    # Turborepo
npx nx run-many -t build test lint -p <name>             # Nx
npm run build -w <package-name> && npm test -w <package-name>   # plain workspaces
pnpm --filter <package-name> build && pnpm --filter <package-name> test
```

Also run `tsc -b` (or the repo's typecheck script) so project references resolve. If any command
fails, report the error — do not leave a broken project in the workspace.

## Step 7 — Report

```
## Add Project Report

Project:  <placement>/<name>/
Package:  <scope>/<name>
Type:     <app / lib>
Tooling:  <npm / pnpm / yarn> + <Turborepo / Nx / none>
Runner:   <Vitest / Jest> + Testing Library
Added to: <workspace glob already covered / root config updated>

Files created:
  <placement>/<name>/package.json
  <placement>/<name>/tsconfig.json
  <placement>/<name>/src/<Component>.tsx
  <placement>/<name>/src/<Component>.test.tsx

Standards applied:
  ✅ Scope, scripts and layout match the sibling
  ✅ tsconfig extends base; root references updated
  ✅ Test runner and setup match the workspace
  ✅ Library: exports map + react as peerDependency

Build: ✅ passed  /  ❌ <error>
Tests: ✅ passed  /  ❌ <error>
```

---

## Applied Rules

### Project Layout (React)

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
