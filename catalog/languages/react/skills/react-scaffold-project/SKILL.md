---
id: react/react-scaffold-project
kind: skill
title: "New Project (React)"
description: "Scaffold a new React application in an empty directory with Vite, TypeScript, feature-based layout, ESLint/Vitest config, and a starter test"
name: react-scaffold-project
language: react
allowedTools:
  - Read
  - Write
  - Bash
  - Glob
argumentHint: "<app-name>"
uses:
  rules:
    - react/react-npm
    - react/react-project-layout
    - react/react-testing
  agents: []
tags:
  - react
  - scaffold
  - new-project
whenToUse: "Use when starting a brand-new React application from scratch. Fires for \"scaffold a new React app\", \"create a new React project\", or \"set up a React app called X\". Not for adding an app or package to an existing workspace (use react-add-project) or a feature to an existing project."
---

# Scaffold Project

**App name:** {sigil:arguments}

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
