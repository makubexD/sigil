---
id: typescript/ts-scaffold-project
kind: skill
title: "Scaffold Project (TypeScript)"
description: "Scaffold a new package with project standards pre-wired — tsconfig, ESLint, ESM exports map, src/test layout, Vitest seed test — and add it to the workspace"
name: ts-scaffold-project
language: typescript
appliesTo:
  - "**/*"
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

## When to Use

Use when adding a new package to an existing monorepo or initializing a new standalone package. Pass the package name and optional type. Never overwrites existing files; confirms before editing the root workspace config.

---

# Scaffold Project

**Package name + type:** $ARGUMENTS

Parse `$ARGUMENTS`:
- First token → `<name>` (e.g. `@myorg/reporting`, `my-cli-tool`)
- `--type=<lib|app|cli|test>` (default: `lib`)

## Step 1 — Discover repo standards

Read the following to understand what "standards pre-wired" means for this project:
- Root `package.json` — workspaces config, `"type"`, `"engines"`, shared scripts.
- `tsconfig.base.json` (or root `tsconfig.json`) — shared compiler options to extend.
- `eslint.config.*` — enabled rules; confirm whether flat config or legacy.
- `.prettierrc*` / `biome.json` — formatter config (optional).
- `CLAUDE.md` — documented architecture layers and naming conventions.
- An existing similar package as a reference (read its `package.json` and `tsconfig.json`).

If none of these exist, prompt the user for the target Node.js version and whether this is an
ESM-first project before proceeding.

## Step 2 — Determine placement

Based on `--type`:
- `lib` → `packages/<name>/` with `src/index.ts` + `test/index.test.ts`
- `app` → `apps/<name>/` with `src/index.ts` + `test/index.test.ts`
- `cli` → `packages/<name>/` with `src/cli.ts` + `src/index.ts` + `test/cli.test.ts`
- `test` → `test/<name>/` only (no source package)

Use the root `package.json` `"workspaces"` glob to determine whether the path would be picked up
automatically (e.g. `"packages/*"` covers `packages/<name>/`).

Do not overwrite any existing file. If the target path already exists, **stop and report**.

## Step 3 — Scaffold the package

Create `<placement>/<name>/package.json`:

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "*"
  }
}
```

Adjust for `--type=app` (no `exports` / `files`; may add a `"bin"` entry for `--type=cli`).
If CPM / shared versions are in use, omit version numbers from devDependencies — inherit from root.

Create `<placement>/<name>/tsconfig.json` extending the base:

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

Create `<placement>/<name>/src/index.ts` with a seed export and TSDoc:

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

For `--type=cli`, also create `src/cli.ts`:

```typescript
#!/usr/bin/env node
/**
 * CLI entry point for <name>.
 */

const [, , ...args] = process.argv;
// TODO: wire argument parsing and call main()
process.exit(0);
```

## Step 4 — Scaffold the test file (unless `--type=test`)

Create `<placement>/<name>/test/index.test.ts`:

```typescript
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

## Step 5 — Add to workspace

Present what will change before modifying anything:

```
The following will be added to the repository:

  <placement>/<name>/package.json
  <placement>/<name>/tsconfig.json
  <placement>/<name>/src/index.ts
  <placement>/<name>/test/index.test.ts

Root workspace update (package.json "workspaces") may be needed: <yes / no — path already covered>

Proceed? [y/N]
```

Wait for confirmation. If the root `package.json` `"workspaces"` glob does not already cover the
new package path, add the path with `Edit`.

Then run:
```bash
npm install
```

## Step 6 — Build and test

```bash
tsc --noEmit -p <placement>/<name>/tsconfig.json
npx vitest run <placement>/<name>/test/
```

If either fails, report the error — do not leave a broken package in the workspace.

## Step 7 — Report

```
## Scaffold Report

Package:  <placement>/<name>/
Type:     <lib / app / cli / test>
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
  ✅ Vitest seed test (AAA)
  ✅ TSDoc on public export

Type check: ✅ passed  /  ❌ <error>
Tests:      ✅ passed  /  ❌ <error>
```
