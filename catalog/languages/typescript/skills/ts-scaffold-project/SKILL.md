---
id: typescript/ts-scaffold-project
kind: skill
title: "Scaffold Project (TypeScript)"
description: "Scaffold a new package with the workspace's standards pre-wired — tsconfig, ESLint, ESM exports map, src/test layout, seed test — and add it to the workspace"
name: ts-scaffold-project
language: typescript
skillContext: fork
whenToUse: >-
  Use when adding a new package to an existing monorepo or initializing a new standalone
  package — "scaffold a new package", "create a new lib/app/cli", "bootstrap a package for X".
  Pass the package name and optional type. Never overwrites existing files; confirms before
  editing the root workspace config.
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=lib|app|cli|test]"
uses:
  rules:
    - typescript/ts-project-layout
    - typescript/ts-conventions
  agents:
    - typescript/ts-architecture-reviewer
tags:
  - typescript
  - scaffold
  - project
---

# Scaffold Project

**Package name + type:** {sigil:arguments}

Parse `{sigil:arguments}`: first token → `<name>` (e.g. `@myorg/reporting`, `my-cli-tool`);
`--type=<lib|app|cli|test>` (default: `lib`).

## Step 1 — Discover repo standards

Read: root `package.json` (workspaces config, `"type"`, `"engines"`, shared scripts, and —
critically — which test runner is actually a `devDependency` there or in a sibling package;
never assume Vitest); `tsconfig.base.json`; `eslint.config.*`; `{sigil:conventions-file}` for documented
architecture/naming; and one existing similar package as a concrete reference. If none of these
exist, ask the user for the target Node.js version, whether this is ESM-first, and which test
runner to use before proceeding.

## Step 2 — Determine placement

- `lib` → `packages/<name>/` (`src/index.ts` + `test/index.test.ts`)
- `app` → `apps/<name>/` (`src/index.ts` + `test/index.test.ts`)
- `cli` → `packages/<name>/` (`src/cli.ts` + `src/index.ts` + `test/cli.test.ts`)
- `test` → `test/<name>/` only (no source package)

Check the root `package.json` `"workspaces"` glob covers the new path (e.g. `"packages/*"`).
**Do not overwrite any existing file** — if the target path already exists, stop and report.

## Step 3 — Scaffold the package

Create `package.json`, `tsconfig.json`, `src/index.ts` (and `src/cli.ts` for `--type=cli`) —
see [`references/templates.md`](references/templates.md) for the worked examples, all keyed off the runner discovered in
Step 1.

## Step 4 — Scaffold the test file (unless `--type=test`)

Create `test/index.test.ts` using the discovered runner's import/assertion style — see
[`references/templates.md`](references/templates.md) for the Vitest and `node:test` shapes.

## Step 5 — Add to workspace

Present the file list and whether a root `package.json` `"workspaces"` update is needed; wait for
explicit confirmation before editing the root config. Then run `npm install`.

## Step 6 — Build and test

Run `tsc --noEmit -p <placement>/<name>/tsconfig.json` and the discovered test command scoped to
the new package's `test/` directory. If either fails, report the error — do not leave a broken
package in the workspace.

## Step 7 — Report

```
## Scaffold Report

Package:  <placement>/<name>/
Type:     <lib / app / cli / test>
Runner:   <discovered in Step 1>
Workspace: <already covered / added to root package.json>

Files created:
  <placement>/<name>/package.json
  <placement>/<name>/tsconfig.json
  <placement>/<name>/src/index.ts
  <placement>/<name>/test/index.test.ts

Standards applied:
  ✅ ESM-first ("type": "module")
  ✅ Explicit exports map
  ✅ tsconfig extends base (strict, noUncheckedIndexedAccess, etc.)
  ✅ Seed test (AAA)
  ✅ TSDoc on public export

Type check: ✅ passed  /  ❌ <error>
Tests:      ✅ passed  /  ❌ <error>
```
