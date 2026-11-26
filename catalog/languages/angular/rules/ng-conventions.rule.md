---
id: angular/ng-conventions
kind: rule
title: Conventions (Angular)
description: Angular/TypeScript conventions — typing, naming, file structure, DI, no silent exceptions
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - conventions
appliesToRationale: Scoped to TypeScript source because these are language-level conventions (typing, naming, DI, control flow) with no template or config equivalent.
---

- Annotate every public method's parameters and return type. `unknown`, narrowed before use, not `any`; an untyped
  third-party value gets a narrow interface.
- `strict`, `noImplicitOverride` and `strictTemplates` stay on. `@ts-expect-error` with a reason, never
  `@ts-ignore`.
- Absence is `T | undefined` (or `null`, as the codebase does), never a sentinel; no `!` without a comment saying
  why the value is defined.
- `readonly` fields and `ReadonlyArray<T>`; never mutate an input or an emitted object in place.
- Files are `kebab-case.type.ts` (`user-profile.component.ts`, `auth.service.ts`) with the matching class suffix;
  selectors carry the `prefix` from `angular.json`.
- Dependency injection follows the file's existing style: `inject()` in standalone code, `private readonly`
  constructor parameters in NgModule code. Never both in one file.
- Shared behavior is a service, a directive or a function, not a base component; no class with only static
  methods.
- `import type` for type-only imports; named exports, not default. A dynamic `import()` is for lazy routes, never
  to hide a circular import.
- No mutable module-level state: hold it in a service. A getter never mutates.
- `const` by default, never `var`; no empty `catch`; an expected outcome is a typed return value, not a throw.
