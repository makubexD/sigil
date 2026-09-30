---
id: csharp/cs-code-quality
kind: rule
title: Code Quality (.NET / C#)
description: Search-first protocol + structural size limits (method/param caps) for .NET / C# — prevents duplication and complexity creep
language: csharp
appliesTo:
  - "**/*"
severity: recommended
extends:
  - shared/clean-code
tags:
  - csharp
  - code
  - quality
---
## SEARCH FIRST Protocol
Before creating any class, method, or module, search the codebase for similar patterns. If 80%+
overlap with the same concern exists, extend the existing code — do not create a new one. If less
than 80% overlap or a genuinely different concern, create new. If uncertain whether overlap is
sufficient, ask before proceeding.

## Code Structure Limits
Max 20 lines per method body (40 lines for factory / builder methods). Max 4 parameters per method
or constructor signature. If either limit is exceeded, split into smaller units before proceeding.

A class beyond ~200 lines or ~7 public members is a **God Object** candidate — extract a collaborator
or split into smaller, single-responsibility classes. Constructor injection is the signal: if a
constructor requires more than 4 collaborators, the class is doing too much.

## SOLID Principles
- **Single Responsibility**: Each class or module has one reason to change.
- **Open/Closed**: Extend behavior through composition or inheritance, not modification.
- **Liskov Substitution**: Subtypes must be substitutable for their base types without altering
  correctness. Overriding a method must not weaken preconditions or strengthen postconditions.
- **Interface Segregation**: Prefer narrow, focused interfaces over wide, general-purpose ones.
  A caller should not depend on members it does not use.
- **Dependency Inversion**: Depend on abstractions (`interface`, `abstract class`), not concretions.
  Inject dependencies through constructors; never `new` up a service inside a domain class.

## Layering
Keep business logic out of I/O, transport, and presentation boundaries — controllers, minimal-API
handlers, and console commands should delegate to domain/application services, not contain logic.
A change to the delivery mechanism (HTTP → gRPC, Console → GUI) must not require changes to the
domain.

**No hardcoded configuration.** Environment-specific values (connection strings, URLs, timeouts,
feature flags, numeric limits) belong in `IConfiguration`, environment variables, or `IOptions<T>`
— never as bare literals in logic. See `cs-security` for the stronger invariant on credentials.

## Circular Dependencies and Coupling
Avoid circular project references — they signal a missing abstraction. Circular namespace references
within a project are also a smell. Prefer narrow public interfaces; a class that `using`s more than
5 sibling namespaces or a project that `<ProjectReference>`s more than 5 siblings is a coupling smell.

- **Detect:** `cs-architecture-reviewer` builds the project graph and flags cycles.
- **Fix:** `cs-refactor-specialist` extracts the shared interface or DTO into a third project that
  both sides can reference without a cycle.

## DRY / KISS / YAGNI
- **DRY**: Every piece of knowledge has a single, authoritative representation. Duplication is a bug.
- **KISS**: The simplest solution that works is the correct one. Add complexity only when required.
- **YAGNI**: Do not implement functionality until it is actually needed. Speculative generality adds debt.
- **No premature optimization**: write the clear solution first; profile with `cs-performance-profiler`
  before optimizing. Optimize only measured hot paths — complexity bought without evidence is debt.

## Design Patterns
Use Strategy for interchangeable algorithms, Factory for object creation, Adapter for interface
translation, and Builder for complex object construction. Avoid Singleton (hides dependencies,
obstructs testing) and Service Locator (obscures dependencies, inverts control in the wrong
direction — prefer constructor injection via the DI container).

## Error Handling
Chain exceptions with cause context using `throw new SpecificException("context", innerException)`
— preserves the inner exception for full stack traces. For recoverable paths, return an explicit
result — a typed `T?`, a `(T Value, string? Error)` tuple, or a small immutable `record` — with the
contract documented; reserve exceptions for truly exceptional cases.

Never swallow silently: catch the **narrowest** exception type possible; at every `catch` boundary
either log with context or re-throw (preserving the inner exception). The anti-pattern to avoid:
`catch (Exception) { }` (or bare `catch { }`).

Use `when` clauses to filter exceptions without unwrapping the stack: `catch (HttpException ex) when (ex.StatusCode == 404)`.

## No Commented-Out Code
Delete dead code instead of commenting it out. Git history preserves all previous states — a comment
is not a backup. Leaving commented code in the codebase is noise that misleads future readers about intent.
