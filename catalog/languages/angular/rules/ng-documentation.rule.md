---
id: angular/ng-documentation
kind: rule
title: Documentation (Angular)
description: Angular/TypeScript documentation standards — TSDoc, public API, component contracts, module docs
language: angular
appliesTo:
  - "**/*.ts"
tags:
  - angular
  - documentation
appliesToRationale: Scoped to TypeScript source because TSDoc comments and exported symbols live there; templates and config files have no doc-comment surface.
---

## TSDoc

- Every exported class, function, method, interface, type and enum has a TSDoc comment with the standard tags
  (`@param`, `@returns`, `@throws`).
- Every `@Input()` / `@Output()` and signal `input()` / `output()` / `model()` states its contract: expected
  values, units, default, and whether it is required. Every `InjectionToken` says what it provides and its
  lifetime.
- Don't restate the symbol name, the types, or implementation steps that will drift. A comment says why, not what.
- A file whose responsibility is not obvious from its name starts with a one-line summary comment.
- Deprecate a public export, selector or input with `@deprecated` and keep it working for at least one release.
- A README covers what the project does, install and quickstart (`npm ci`, `ng serve`), required runtime config
  names (never secret values), and the test and quality-gate commands.
- When a signature, thrown error or a component's input and output surface changes, update the TSDoc in the same
  commit; update the README when install, usage or runtime config change.
