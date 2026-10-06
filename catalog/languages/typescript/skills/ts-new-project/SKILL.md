---
id: typescript/ts-new-project
kind: skill
title: "New Project (TypeScript)"
description: "Create a new Node.js TypeScript project in an empty directory — ESM package.json, strict tsconfig, ESLint + Prettier, a test runner, and a starter test; use ts-scaffold-project when a workspace already exists (TypeScript)"
name: ts-new-project
language: typescript
allowedTools:
  - Read
  - Write
  - Bash
  - Glob
argumentHint: "<package-name> [--runner=node|vitest]"
uses:
  rules:
    - typescript/ts-project-layout
    - typescript/ts-npm
  agents: []
tags:
  - typescript
  - scaffold
  - new-project
whenToUse: "Use when starting a brand-new Node.js TypeScript project in an empty directory. Fires for \"create a new TypeScript project\", \"start a Node TS package from scratch\", or \"set up a TypeScript CLI called X\". Not for adding a package to an existing repo or monorepo — when a package.json or workspace config is already present, use `ts-scaffold-project` instead."
---

# New Project

**Package name and runner:** {sigil:arguments}

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
