---
id: react/react-add-project
kind: skill
title: "Add Project (React)"
description: "Add an app or package to an existing React workspace with its standards pre-wired — npm/pnpm/yarn workspaces, Turborepo/Nx, tsconfig references, Vitest or Jest with Testing Library — then build and test it (React)"
name: react-add-project
language: react
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=app|lib]"
uses:
  rules:
    - react/react-project-layout
    - react/react-npm
  agents:
    - react/react-architecture-reviewer
tags:
  - react
  - scaffold
  - project
whenToUse: "Run via `/react-add-project <name>` when an existing JavaScript workspace (npm/pnpm/yarn workspaces, Turborepo, or Nx) needs another React app or package — e.g. \"add an admin app to the monorepo\", \"create a shared ui package\". Pass the name and optional `--type`. Requires an existing workspace; to start a brand-new React app in an empty directory use react-scaffold-project instead. Never overwrites existing files; confirms before editing root workspace config."
---

# Add Project

**Project name + type:** {sigil:arguments}

Parse `{sigil:arguments}`: first token → `<name>` (e.g. `admin`, `@acme/ui`); `--type=<app|lib>`
(default: `lib`).

## Step 1 — Discover repo standards

Confirm the repo is a workspace: root `package.json` `"workspaces"`, `pnpm-workspace.yaml`, or
`nx.json`. If none exists, **stop** — this skill adds to an existing workspace; creating a new app
is a different task.

Read: the workspace globs; the package manager (lockfile: `package-lock.json`, `pnpm-lock.yaml`,
`yarn.lock`); `turbo.json` or `nx.json` task pipelines; `tsconfig.base.json` / root `tsconfig.json`
(`references`, `paths`); `eslint.config.*`; `{sigil:conventions-file}` for documented layering and
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
