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

## TSDoc Style
Document every exported symbol with TSDoc. Use the standard block tags — `@param`, `@returns`,
`@throws`, `@remarks`, `@deprecated` — so editors, `tsc`, and Compodoc render them:

```ts
/**
 * Parse raw text into a list of entries.
 *
 * @param raw - The raw input string (may be multi-line).
 * @returns A list of parsed entries; empty array if the input is blank.
 * @throws ParseError if the input is structurally invalid.
 */
export function parse(raw: string): Entry[] { … }
```

## What Requires Documentation
- Every **public** (exported) class, function, method, interface, type alias, and enum.
- Every component **`@Input()`** / **`@Output()`** and every signal `input()` / `output()` /
  `model()` — state the contract: expected values, units, defaults, and whether it is required.
- Every public service method and every `InjectionToken` (what it provides and its expected lifetime).
- Every non-obvious parameter, even when annotated.

```ts
@Component({ selector: 'app-rating' /* … */ })
export class RatingComponent {
  /** Current rating, 0–5 inclusive. Values outside the range are clamped. */
  readonly value = input.required<number>();

  /** Emits the new rating when the user selects a star. */
  readonly ratingChange = output<number>();
}
```

Private helpers warrant a brief one-liner only if their purpose is non-obvious; skip the full
tag block for trivial ones.

## What Must Not Go in Docs
- Implementation detail that will drift from the code and become misleading.
- Commented-out code (see the no-commented-code rule in `ng-code-quality`).
- A restatement of the symbol name (`getUser()` + `/** Get the user. */` adds nothing).

## Comments
Use comments to explain **why**, not **what** — the code already shows what. A comment restating the
operation (`// increment counter`) is noise; a comment explaining intent (`// 1-based because the API
pages from 1`) is signal. Never comment out code — delete it; git history is the backup (see `ng-git`).

## Module / File Headers
A file whose responsibility is not obvious from its name starts with a one-line summary comment,
optionally followed by an extended description. This is what Compodoc and module listings surface.

```ts
/**
 * Normalise calendar events from ICS format into local-timezone rows.
 *
 * Applies status filtering, same-start deduplication, and daily-cap rounding.
 */
```

## README Expectations
Every project should have a top-level `README.md` containing:
- What the project does (one paragraph).
- Installation / quickstart (`npm ci`, `ng serve`).
- Required environment / runtime config (names only, never secret values).
- How to run the tests and the quality gate.

Do not create or update the README inside a normal coding task — maintain it deliberately.

## Keeping Docs Current
When a public symbol's signature, return contract, thrown error, or behaviour changes — or when a
component's `@Input`/`@Output`/signal surface changes:
1. Update the TSDoc in the **same commit**.
2. Update the file/module header if the file's stated responsibility changed.
3. Update the `README` if the change affects installation, usage, or runtime configuration.

A stale doc actively misleads — it describes the wrong contract.

## Types as Documentation
Fully annotated public signatures are documentation. Prioritise keeping annotations and template
types accurate (with `strict` and `strictTemplates`) over voluminous prose — a wrong comment
misleads silently, but a wrong type fails the compiler.
