---
id: angular/ng-conventions
kind: rule
title: Conventions (Angular)
description: Angular/TypeScript conventions — typing, naming, file structure, DI, no silent exceptions
language: angular
appliesTo:
  - "**/*.ts"
severity: recommended
extends:
  - shared/clean-code
tags:
  - angular
  - conventions
---


## Types, Not `any`
Annotate every public method signature and return type. Avoid `any` — it disables the
type checker for everything it touches. Prefer `unknown` for genuinely unknown values
and **narrow before use**. Use generics (`Array<T>`, `Map<K, V>`) or a small interface
for polymorphism. When a type truly cannot be known at annotation time, narrow it as soon
as possible rather than propagating it outward.

For third-party values that arrive untyped, define a narrow interface containing only the
members you actually use — this constrains coupling to what you touch and keeps the type
checker clean without reaching for `any`.

## Strictness
Run TypeScript in **strict** mode (`"strict": true` in `tsconfig.json`), plus
`noImplicitOverride`, and enable `strictTemplates` in `angularCompilerOptions` so the
template type-checker catches binding mistakes. Every type error is a real contract gap.
`@ts-ignore` is banned; use `@ts-expect-error // <one-line reason>` only when a suppression
is genuinely justified — it fails the build if the error ever disappears, so it cannot rot
silently.

## Explicit Optionals
Model absence with `T | undefined` (or `T | null` consistently with the codebase) — never a
sentinel string or an implicit `undefined` return with an undocumented type. Avoid the
non-null assertion `!` unless you can state in a comment why the value is provably defined;
prefer a guard or `?.`.

## Immutability
Prefer `readonly` on fields and `ReadonlyArray<T>` / `as const` for data that should not
change after construction. Treat `@Input()` values and emitted objects as immutable — mutating
them in place defeats OnPush change detection (see `ng-components`).

## Naming
| Symbol | Style | Example |
|---|---|---|
| Functions, variables, methods | `camelCase` | `parseInput`, `timeRange` |
| Classes, interfaces, enums | `PascalCase` | `UserEvent`, `StatusKind` |
| Private helpers | `camelCase` (optionally `#private`) | `toUtcDate`, `#cache` |
| Module-level constants | `UPPER_SNAKE` or `camelCase` `const` | `DEFAULT_CAP_MINUTES` |

**File naming** is `kebab-case.type.ts`, matching Angular's convention:
`user-profile.component.ts`, `auth.service.ts`, `role.guard.ts`, `date.pipe.ts`,
`logging.interceptor.ts`. Class names are `PascalCase` with the matching suffix
(`UserProfileComponent`, `AuthService`, `RoleGuard`, `DatePipe`). One cohesive concept
per file. Component/directive **selectors** carry the project's prefix — element selectors
`app-*` (e.g. `app-user-profile`), attribute/directive selectors a camelCase prefix
(e.g. `appHighlight`). Discover the actual prefix from `angular.json` (`prefix`) and match it.

## Dependency Injection
> **Discovery rule:** detect the project's DI style before writing. **`inject()`** if you
> see `inject(` calls or `standalone: true`; **constructor injection** if providers are
> declared via `@NgModule` and dependencies arrive as constructor parameters. Match the
> surrounding code; do not mix styles within one file.

### Standalone + signals (Angular 17+)
Resolve dependencies with the `inject()` function at field initialisation. It composes
cleanly, works in functional guards/resolvers/interceptors, and keeps constructors empty.

```ts
export class UserProfileComponent {
  private readonly users = inject(UserService);
  private readonly route = inject(ActivatedRoute);
}
```

### NgModule (classic)
Declare dependencies as `private readonly` constructor parameters; the injector supplies them.

```ts
export class UserProfileComponent {
  constructor(
    private readonly users: UserService,
    private readonly route: ActivatedRoute,
  ) {}
}
```

Depend on an abstraction where the consumer owns the contract — inject an interface via an
`InjectionToken` rather than a concrete class, so the implementation can be swapped in tests.

## Composition over Inheritance
Prefer composing services and content projection over inheriting from a base component.
Inheritance couples a subclass to its parent's implementation and creates fragile hierarchies;
component inheritance in particular tangles lifecycle hooks and DI. Use it only when a genuine
IS-A relationship exists and the Liskov Substitution Principle holds throughout.

- **Hierarchy depth:** keep inheritance chains to ≤ 2 levels; anything deeper is a design smell.
- **Static-method-only "utility" classes** are a namespace masquerading as a class. Use a
  module with exported functions instead — they are simpler and directly importable.
- For shared cross-cutting behaviour prefer a service, a directive, or a pure function over a base class.

## Control Flow
Prefer `switch` or a lookup map over long `if/else if` chains when branching on a closed set
of values. Keep each branch body within the method-body line limit; extract helpers for
complex branches.

**Guard clauses over nesting.** Return early at the top of a method for invalid or trivial
cases. Deep nesting (> 2–3 levels) is a readability smell — flatten it with early returns or
extracted helpers.

## Imports and Exports
Order: external packages → Angular packages → local — angular-eslint / the configured import
ordering rule enforces this. Use `import type { … }` for type-only imports so they are erased
at runtime. Prefer **named exports**; avoid default exports (they make refactors and re-exports
harder). Barrel files (`index.ts` / a library `public-api.ts`) are optional, not mandated — keep
them narrow when present.

**Dynamic imports** (`import('…')`) are the mechanism behind lazy-loaded routes and are
encouraged there. Outside lazy loading, use them only at documented adapter boundaries — never
to hide a normal dependency or paper over a circular import.

## State and Side Effects
Module-level **mutable** globals are banned; hold state in a service so it is injectable and
testable. Constants are the only acceptable module-level state. Prefer pure functions that
receive and return explicit arguments over functions that read or write shared state implicitly.

**Command-query separation (CQS):** a method either returns a value *or* causes a visible side
effect — not silently both. A getter must not mutate; a method that mutates must communicate
that clearly (name, return type). Hidden side effects make code hard to test and reason about.

## Never
- An empty `catch {}` or a `catch` that swallows without logging or re-throwing — these are silent lies.
- `var` — use `const` by default, `let` only when reassignment is required.
- Mutable default behaviour that shares a reference across calls.
- Wildcard re-exports that leak a whole module's internals; export the public surface explicitly.
- Unexplained `@ts-expect-error` / `@ts-ignore` — always pin a reason, and prefer `@ts-expect-error`.
- Using thrown errors for normal control flow — return a typed value (`T | undefined`, a result
  object, or an empty collection) for expected outcomes. Reserve `throw` for truly exceptional conditions.
