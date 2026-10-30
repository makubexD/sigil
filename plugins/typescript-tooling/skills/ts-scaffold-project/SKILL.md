---
name: ts-scaffold-project
description: "Scaffold a new package with the workspace's standards pre-wired — tsconfig, ESLint, ESM exports map, src/test layout, seed test — and add it to the workspace (TypeScript)"
when_to_use: "Use when adding a new package to an existing workspace or monorepo — \"scaffold a new package\", \"create a new lib/app/cli\", \"bootstrap a package for X\". Pass the package name and optional type. Never overwrites existing files; confirms before editing the root workspace config. For an empty directory with no workspace, use ts-new-project instead."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<name> [--type=lib|app|cli|test]"
---

# Scaffold Project

**Package name + type:** $ARGUMENTS

Parse `$ARGUMENTS`: first token → `<name>` (e.g. `@myorg/reporting`, `my-cli-tool`);
`--type=<lib|app|cli|test>` (default: `lib`).

## Step 1 — Discover repo standards

Read: root `package.json` (workspaces config, `"type"`, `"engines"`, shared scripts, and —
critically — which test runner is actually a `devDependency` there or in a sibling package;
never assume Vitest); `tsconfig.base.json`; `eslint.config.*`; `CLAUDE.md` for documented
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

---

## Applied Rules

### Project Layout (TypeScript)

## One Concern Per File

Each file exports one primary type, class, or logical unit. The filename reflects the primary export.
Avoid catch-all files (`utils.ts`, `helpers.ts`) — they become coupling magnets. When a file starts
serving two unrelated purposes, split it.

## Source and Test Layout

The canonical layout separates source from tests:

```
<package-root>/
  src/
    index.ts              ← public barrel (export only what consumers need)
    core/
      models.ts
      config.ts
    calendar/
      parser.ts
      normalizer.ts
  test/                   ← or src/**/*.test.ts co-located; discover from existing tests
    calendar/
      parser.test.ts
      normalizer.test.ts
  tsconfig.json
  package.json
```

Discover whether the project uses co-located tests (`src/foo/bar.test.ts`) or a separate `test/`
directory before creating new test files — follow the existing pattern.

## `tsconfig` as the Strictness Control Plane

Every project should have a `tsconfig.json` (or extend a root `tsconfig.base.json`) with at minimum:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

In a monorepo, put shared compiler options in a root `tsconfig.base.json` and extend it in each
package. Never silently disable a strict check without a documented reason in a comment.

`verbatimModuleSyntax` enforces `import type` for type-only imports at the module level, preventing
accidentally importing runtime values as types.

## ESM / CJS and the `exports` Map

Set `"type": "module"` in `package.json` for new projects (ESM-first). In NodeNext resolution mode,
relative imports in `.ts` source files must use the **`.js` extension** (TypeScript resolves `.ts`
at compile time; Node resolves `.js` at runtime):

```typescript
import { parseIcs } from "./parser.js";  // correct in NodeNext ESM
```

Declare an explicit `exports` map for any published package. It controls what consumers can import
and prevents accidental access to internal paths:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

For dual ESM/CJS packages, add a `"require"` condition alongside `"import"`. Validate resolution
correctness with `publint` and `@arethetypesright/cli` before publishing.

## Path Aliases

If the project uses path aliases (e.g. `@/core` → `src/core`), configure them consistently across
three places:
1. `tsconfig.json` `paths`
2. ESLint `import/resolver` settings
3. The test runner's own alias resolution (e.g. Vitest's `resolve.alias`, Jest's
   `moduleNameMapper` — whichever runner the project actually uses)

Inconsistency between these three causes build-passes-but-tests-fail or tests-pass-but-build-fails
scenarios.

## Workspaces and Project References

For monorepos, use npm workspaces:

```json
{
  "private": true,
  "workspaces": ["packages/*"]
}
```

Enable TypeScript project references for incremental builds — each package's `tsconfig.json`
declares `references` to its workspace dependencies:

```json
{
  "references": [{ "path": "../core" }]
}
```

Use `tsc --build` (or `tsc -b`) for incremental compilation; it respects the reference graph and
only rebuilds changed packages.

## Build Tooling

- **Type declarations + source maps**: `tsc` (the TypeScript compiler) is the canonical tool.
- **Bundling**: `tsup` (esbuild-based), `esbuild` directly, or `rollup` with `@rollup/plugin-typescript`
  for libraries; `vite` for browser applications.
- **Watch mode**: `tsc --watch` or the bundler's watch mode for development.
- Never commit `dist/` or `build/` to version control — add them to `.gitignore`. The published
  tarball is separate from the committed source.

## ESLint Flat Config as the Lint Control Plane

The ESLint flat config (`eslint.config.ts` or `eslint.config.js`) is the single source of truth
for lint rule severities across the project. Prefer it over legacy `.eslintrc.*` for new projects.

For TypeScript projects, extend `@typescript-eslint/recommended` and tune from there. Add
project-specific overrides in separate config objects rather than disabling rules globally:

```typescript
// eslint.config.ts
import tseslint from "typescript-eslint";

export default tseslint.config(
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
```

The formatter (Prettier / Biome) is **optional and separate** — gates run `eslint .` always,
and add a format `--check` step only when a formatter config file is present.
