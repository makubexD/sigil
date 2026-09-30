---
id: angular/ng-code-quality
kind: rule
title: Code Quality (Angular)
description: Search-first protocol + structural size limits (method/param caps) for Angular — prevents duplication and complexity creep
language: angular
appliesTo:
  - "**/*.ts"
  - "**/*.html"
extends:
  - shared/clean-code
tags:
  - angular
  - code
  - quality
appliesToRationale: Scoped to TypeScript and template files because these structural and SOLID principles govern Angular's two source formats — component/service logic and templates — and don't apply to config or non-Angular files.
---

## SEARCH FIRST Principle
Before creating any class, component, service, directive, pipe, or module, search the codebase for similar patterns. If 80%+ overlap with the same concern exists, extend the existing code — do not create a new one. If less than 80% overlap or a genuinely different concern, create new. If uncertain whether overlap is sufficient, ask before proceeding.

## Code Structure Limits
Max 20 lines per method body (40 lines for config/builder methods). Max 4 parameters per function, method, or constructor signature. If either limit is exceeded, split into smaller units before proceeding.

A component or service beyond ~200 lines or ~7 public members is a **God Object** candidate — extract a collaborator or split into smaller, single-responsibility units. A component that both fetches data and renders complex UI is two responsibilities: split into a smart container and a presentational child.

## SOLID Principles
- **Single Responsibility**: Each component, service, or module has one reason to change.
- **Open/Closed**: Extend behavior through composition, content projection, or DI, not modification.
- **Liskov Substitution**: Subtypes must be substitutable for their base types without altering correctness.
- **Interface Segregation**: Prefer narrow, focused interfaces over wide, general-purpose ones.
- **Dependency Inversion**: Depend on abstractions (an interface or `InjectionToken`), not concretions. Inject dependencies through the DI container.

## Layering
Keep business logic out of I/O, transport, and presentation boundaries — components, templates,
guards, resolvers, and interceptors should delegate to services, not contain logic themselves. A
change to the delivery mechanism (a route, a template) must not require changes to the domain.

**No hardcoded configuration.** Environment-specific values (API URLs, timeouts, feature flags,
service addresses, numeric limits) belong in `environment.ts` files, an `InjectionToken`, or runtime
config — never as bare literals in logic. See `ng-security` for the stronger invariant on credentials
(and the reminder that `environment.ts` ships to the client, so it holds no secrets).

## Circular Dependencies and Coupling
Avoid circular imports — they signal a missing abstraction. Circular DI (`A` injects `B` injects `A`)
is the runtime form of the same smell and surfaces as `NullInjectorError` or `undefined` providers.
Prefer narrow public surfaces; a module that exports ≥ 10 symbols or a barrel that re-exports from ≥ 5
siblings is a coupling smell.

- **Detect:** `ng-architecture-reviewer` builds the module graph (`madge` / `dependency-cruiser`) and flags cycles.
- **Fix:** `ng-refactor-specialist` extracts the shared type or `InjectionToken` into a third module that
  both sides can import without a cycle.

## DRY / KISS / YAGNI
- **DRY**: Every piece of knowledge has a single, authoritative representation. Duplication is a bug.
- **KISS**: The simplest solution that works is the correct one. Add complexity only when required.
- **YAGNI**: Do not implement functionality until it is actually needed. Speculative generality adds debt.
- **No premature optimization**: write the clear solution first; profile with `ng-performance-profiler` before optimizing. Optimize only measured hot paths — complexity bought without evidence is debt.

## Design Patterns
Use Strategy for interchangeable algorithms, Factory for object creation, Adapter for interface translation, and Builder for complex object construction. Lean on Angular's DI container for dependency wiring rather than hand-rolled Service Locator lookups, and avoid global mutable singletons that hide dependencies and obstruct testing.

## Error Handling
Chain errors with cause context using `throw new Error("context", { cause: originalError })` (preserves the cause chain in stack traces). For recoverable paths, return an explicit result — a typed `T | undefined`, a discriminated union, or a small result object — with the contract documented; reserve thrown errors for truly exceptional cases. Never swallow silently: catch the **narrowest** condition you can handle; at every `catch` boundary either log with context or re-throw with `{ cause }`. The anti-pattern to avoid: an empty `catch {}`. In RxJS, never let an error pass through an empty `catchError(() => EMPTY)` without an intentional, documented reason.

## No Commented-Out Code
Delete dead code instead of commenting it out. Git history preserves all previous states — a comment is not a backup. Leaving commented code in the codebase is noise that misleads future readers about intent.
