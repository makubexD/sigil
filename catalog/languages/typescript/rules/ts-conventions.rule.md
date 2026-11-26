---
id: typescript/ts-conventions
kind: rule
title: Conventions (TypeScript)
description: TypeScript conventions — unknown over any, optionals, interfaces, unions, imports, naming
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
# extends: shared/clean-code intentionally omitted — ts-code-quality already extends it and
# is scoped to the same **/*.ts glob, so both loading it would duplicate the same bullets
# on every TS file edit (see docs/decisions/ for the skill-dispatch audit that caught this).
tags:
  - typescript
  - conventions
appliesToRationale: Covers every TypeScript module extension (including explicit ESM .mts and CJS .cts) since naming, typing, and control-flow conventions apply regardless of module system.
---

- Annotate every exported function's parameters and return type. `unknown`, narrowed before use, not `any`; an
  untyped library gets a narrow ambient module declaration.
- `@ts-expect-error` with a reason, never `@ts-ignore` or `@ts-nocheck`.
- Absence is `T | undefined`, never a sentinel (`""`, `-1`); `null` only for an API that returns it. No `!` on a
  value that can be `null` or `undefined` at runtime.
- `interface` for an object contract, `type` for unions and mapped types; no `I` prefix. `readonly` and
  `ReadonlyArray<T>` on value objects and on inputs a function does not mutate.
- A closed set is an `as const` object or a string-literal union, not an `enum`; a `switch` over a union ends with
  a `never` exhaustiveness check.
- `import type` for type-only imports; named exports, not default; no barrel `index.ts` that re-exports unrelated
  symbols.
- No mutable module-level state, and no class with only `static` members: export functions.
- `const` by default, never `var`. No empty `catch`, and no `catch (e) { throw e; }`.
- An expected outcome is a typed result, not a thrown exception.
- Names: `PascalCase` types, `camelCase` functions and variables, `UPPER_SNAKE` module constants; file names follow
  the repo.
