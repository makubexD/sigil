---
name: ts-new-project
description: "Create a new Node.js TypeScript project in an empty directory — ESM package.json, strict tsconfig, ESLint + Prettier, a test runner, and a starter test; use ts-scaffold-project when a workspace already exists (TypeScript)"
when_to_use: "Use when starting a brand-new Node.js TypeScript project in an empty directory. Fires for \"create a new TypeScript project\", \"start a Node TS package from scratch\", or \"set up a TypeScript CLI called X\". Not for adding a package to an existing repo or monorepo — when a package.json or workspace config is already present, use `ts-scaffold-project` instead."
allowed-tools: Read, Write, Bash, Glob
argument-hint: "<package-name> [--runner=node|vitest]"
---

# New Project

**Package name and runner:** $ARGUMENTS

## Step 1 — Confirm the target directory is empty

If the target directory already contains a `package.json`, `tsconfig.json`, or `.git/`, stop. An
existing repo or workspace means `ts-scaffold-project` is the right skill; anything else, ask
before overwriting. Take the runner from `--runner`, else ask; default to `node:test`.

## Step 2 — Create the project structure

```
<package-name>/
  package.json
  tsconfig.json, tsconfig.build.json
  eslint.config.js
  .prettierrc.json
  .gitignore
  README.md
  src/
    index.ts
  test/
    index.test.ts
```

Write `package.json` with `"type": "module"`, `"engines": { "node": ">=20" }`, an `exports` map
pointing at `./dist/index.js` per `ts-project-layout`, and these scripts:

```json
{
  "build": "tsc -p tsconfig.build.json",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "test": "<runner command>"
}
```

## Step 3 — Configure tooling

```bash
npm install --save-dev typescript @types/node eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

`tsconfig.json` (typecheck, covers `src` and `test`): `"strict": true`,
`"noUncheckedIndexedAccess": true`, `"module"` and `"moduleResolution"` `"NodeNext"`,
`"target": "ES2022"`, `"noEmit": true`, `"include": ["src", "test"]`. `tsconfig.build.json`
extends it with `"noEmit": false`, `"rootDir": "src"`, `"outDir": "dist"`, `"declaration": true`,
`"include": ["src"]` — so `dist/index.js` matches the `exports` map.

`eslint.config.js`: flat config from `typescript-eslint`'s `recommendedTypeChecked`, with
`@typescript-eslint/no-floating-promises` on and `eslint-config-prettier` last.

Test runner:
- **`node:test`** (default) — no extra dependency; add `tsx` and set
  `"test": "node --import tsx --test \"test/**/*.test.ts\""`.
- **Vitest** — `npm install --save-dev vitest` and set `"test": "vitest run"`.

## Step 4 — Write a starter test and README

Example shown with `node:test` — use the runner chosen in Step 3:

```ts
// test/index.test.ts — smoke test confirming the entry module loads; replace once real behavior exists
import { test } from "node:test"; // Vitest: import { test } from "vitest";
import assert from "node:assert/strict";
import * as entry from "../src/index.js";

test("entry module loads", () => {
  assert.equal(typeof entry, "object");
});
```

Give `src/index.ts` one named export so the import is real. Write `.gitignore` per `ts-git`'s
standard additions, and a minimal `README.md`: package name, one-sentence description, install
(`npm install`), and the quality gate (`npm run typecheck && npm run lint && npm test`).

## Step 5 — Verify

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

## Step 6 — Report

```
## New Project Report

Package: <package-name>
Stack: Node.js >=20, TypeScript strict, ESM, <node:test|Vitest>

### Created
- package.json, tsconfig.json, tsconfig.build.json, eslint.config.js, .prettierrc.json, .gitignore, README.md
- src/index.ts, test/index.test.ts

### Verification
✅ typecheck, lint, format check, and tests all pass on the new project
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
