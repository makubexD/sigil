---
id: typescript/ts-git
kind: rule
title: Git (TypeScript)
description: TypeScript-specific git additions — .gitignore entries, @deprecated-based deprecation, npm pre-push gate.
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
  - package.json
  - .gitignore
appliesToRationale: Scoped to TypeScript source, package.json and .gitignore — the shared/git baseline it extends is repeated in every language's git rule, so "**/*" loaded it on every file of every stack (a .py file got the TypeScript git rule) and twice beside another language's (2026-09-27 live-prompt campaign).
extends:
  - shared/git
tags:
  - typescript
  - git
---

## TypeScript Secrets Hygiene

Use `.gitignore` to exclude: `.env*` files, credential files, and local config containing secrets.
Use `.env.example` with placeholder values to document required variables.

Standard TypeScript additions to `.gitignore`:
```
node_modules/
dist/
build/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
```

## TypeScript Deprecation Mechanics

Mark the old symbol with `@deprecated` in its TSDoc and keep it functional for at least one release
before removal:

```typescript
/**
 * @deprecated Use `mergeTimeline` instead. Will be removed in v3.0.
 */
export function mergeRows(…) { … }
```

See `ts-api-compat-reviewer` for a systematic pre-release review of the public type surface.

## Pre-Push Checklist (manual — no hooks)

Before pushing:
1. Quality gate green — discover from `package.json` scripts (`npm run check` or equivalent);
   fallback: type-check + lint + `scripts.test` (whatever test runner that resolves to — never
   assume Vitest specifically), plus an optional format check if Prettier or Biome is configured.
2. No `.env` / credential files staged.
3. Commit message follows the convention above.
