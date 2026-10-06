---
id: typescript/ts-scaffold-project
kind: skill
title: "Add Project (TypeScript)"
description: "Scaffold a new package with the workspace's standards pre-wired — tsconfig, ESLint, ESM exports map, src/test layout, seed test — and add it to the workspace (TypeScript)"
name: ts-scaffold-project
language: typescript
whenToUse: >-
  Use when adding a new package to an existing workspace or monorepo — "scaffold a new package",
  "create a new lib/app/cli", "bootstrap a package for X". Pass the package name and optional
  type. Never overwrites existing files; confirms before editing the root workspace config. For
  an empty directory with no workspace, use ts-new-project instead.
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

## Step 3 — Scaffold the project

Create `package.json`, `tsconfig.json`, `src/index.ts` (and `src/cli.ts` for `--type=cli`), keyed
off what Step 1 discovered.

`package.json` — ESM-first with an explicit exports map:

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "<discovered test command>"
  }
}
```

For `--type=app`, drop `exports` and `files`; for `--type=cli`, add a `"bin"` entry. When the
workspace shares versions, omit version numbers from `devDependencies` and inherit from the root.
Add the test runner to `devDependencies` only if it is not already a root or shared dependency.

`tsconfig.json` — extend the base, emit declarations:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`src/index.ts` — a module TSDoc block plus one documented placeholder export:

```typescript
/**
 * <name> — <one-line description>.
 *
 * @module
 */

/**
 * Entry point for the <name> package.
 *
 * @param input - TODO: describe parameter.
 * @returns TODO: describe return value.
 */
export function main(input: string): string {
  // TODO: implement
  return input;
}
```

`src/cli.ts` (`--type=cli` only) — starts with `#!/usr/bin/env node` and a TSDoc line, reads
`process.argv.slice(2)`, and leaves a TODO to wire argument parsing and call `main()`.

## Step 4 — Scaffold the tests

Skip this step when `--type=test`.

Create `test/index.test.ts` using the discovered runner's import/assertion style (`node:test` if the
workspace has no prior convention) — never assume Vitest:

```typescript
// Example shown with Vitest — use whatever runner Step 1 discovered instead.
import { describe, it, expect } from "vitest";
import { main } from "../src/index.js";

describe("main", () => {
  it("should return the input unchanged as a placeholder", () => {
    // Arrange
    const input = "hello";

    // Act
    const result = main(input);

    // Assert
    expect(result).toBe(input);
  });
});
```

With `node:test`, import `{ describe, it }` from `"node:test"` and `assert` from
`"node:assert/strict"`, and write `assert.equal(result, input)` in place of `expect(...).toBe(...)`.

## Step 5 — Add to the solution or workspace

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
Added to: <workspace already covered / root package.json updated>

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
