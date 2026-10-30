---
name: react-scaffold-project
description: "Scaffold a new React application in an empty directory with Vite, TypeScript, feature-based layout, ESLint/Vitest config, and a starter test"
when_to_use: "Use when starting a brand-new React application from scratch. Fires for \"scaffold a new React app\", \"create a new React project\", or \"set up a React app called X\". Not for adding an app or package to an existing workspace (use react-add-project) or a feature to an existing project."
allowed-tools: Read, Write, Bash, Glob
argument-hint: "<app-name>"
---

# Scaffold Project

**App name:** $ARGUMENTS

## Step 1 — Confirm the target directory is empty

If the target directory already contains a `package.json` or `.git/`, stop and ask before
overwriting — this skill is for a genuinely new app, not retrofitting an existing one.

## Step 2 — Create the project structure

Create via Vite, then restructure:

```bash
npm create vite@latest <app-name> -- --template react-ts
cd <app-name>
```

Restructure the generated `src/` into the feature-based layout from `react-project-layout`:

```
src/
  features/         # feature-local components, hooks, api.ts (empty to start)
  components/       # shared components only
  hooks/            # shared hooks only
  lib/              # framework-agnostic utilities
  main.tsx
```

## Step 3 — Configure tooling

### Add testing dependencies

```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

Configure `vite.config.ts`'s `test` block:
```ts
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: "./src/test-setup.ts",
}
```

### ESLint and path alias

Confirm the Vite template's ESLint config includes `eslint-plugin-react-hooks`. Add the `@/*` path
alias to `tsconfig.json`'s `paths` and mirror it in `vite.config.ts`'s `resolve.alias`, per
`react-project-layout`.

## Step 4 — Write a starter test and README

```tsx
// src/App.test.tsx — smoke test confirming the app renders; replace once real features exist
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders without crashing", () => {
  render(<App />);
  expect(screen.getByRole("heading")).toBeInTheDocument();
});
```

### `.gitignore` and `README.md`

Verify `.gitignore` matches `react-git`'s standard additions (the Vite template's default is close
but confirm `.env*` entries are present). Write a minimal `README.md`: app name, one-sentence
description, dev-server command (`npm run dev`), and how to run tests (`npx vitest run`).

## Step 5 — Verify

```bash
npm install
npx eslint .
npx tsc --noEmit
npx vitest run
npm run build
```

## Step 6 — Report

```
## Scaffold Report

App: <app-name>
Stack: Vite + React + TypeScript, feature-based layout

### Created
- Restructured src/ into features/, components/, hooks/, lib/
- vitest + Testing Library configured
- src/App.test.tsx (starter smoke test)

### Verification
✅ lint, type-check, tests, and build all pass on the scaffold
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
