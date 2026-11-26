---
id: typescript/ts-documentation
kind: rule
title: Documentation (TypeScript)
description: TypeScript documentation standards — TSDoc on exports, why-not-what comments, deprecation, README expectations
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
tags:
  - typescript
  - documentation
appliesToRationale: TSDoc conventions apply only to TypeScript source with exportable symbols — excluded from config and non-source files with nothing to document.
---

## TSDoc

- Every exported symbol has a TSDoc comment (`/** ... */`) in the style of the project's doc tool (TypeDoc, API
  Extractor). One line for an obvious function; `@param`, `@returns` and `@throws` when units, ranges, side effects
  or the caller's contract are not obvious from the types.
- An interface that is a behavioral contract documents the invariants implementers must keep.
- Don't restate the name (`/** Get the user. */`), the types, or implementation steps that will drift. A comment
  says why, not what.
- A module with non-obvious scope gets a one- or two-sentence header ending in `@module`.
- Deprecate an exported symbol with `@deprecated Use X instead.` and keep it working for at least one release.
- A package README covers what it does, install and quickstart, required environment variable names (never
  values), and the test and quality-gate commands.
- When a signature, return type or thrown error changes, update the TSDoc in the same commit; update the README
  when install steps, CLI flags or required environment variables change.
