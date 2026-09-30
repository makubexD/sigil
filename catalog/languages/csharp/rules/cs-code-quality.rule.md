---
id: csharp/cs-code-quality
kind: rule
title: Code Quality (.NET / C#)
description: Search-first protocol + structural size limits (method/param caps) for .NET / C# — prevents duplication and complexity creep
language: csharp
appliesTo:
  - "**/*.cs"
extends:
  - shared/clean-code
template: shared/templates/code-quality
tags:
  - csharp
  - code
  - quality
appliesToRationale: Scoped to C# source because these structural and SOLID principles govern class/method design, which only exists in .cs files.
---
<!-- slot: structure-limits -->
Max 20 lines per method body (40 lines for factory / builder methods). Max 4 parameters per method
or constructor signature. If either limit is exceeded, split into smaller units before proceeding.

A class beyond ~200 lines or ~7 public members is a **God Object** candidate — extract a collaborator
or split into smaller, single-responsibility classes. Constructor injection is the signal: if a
constructor requires more than 4 collaborators, the class is doing too much.

<!-- slot: solid-principles -->
- **Single Responsibility**: Each class or module has one reason to change.
- **Open/Closed**: Extend behavior through composition or inheritance, not modification.
- **Liskov Substitution**: Subtypes must be substitutable for their base types without altering
  correctness. Overriding a method must not weaken preconditions or strengthen postconditions.
- **Interface Segregation**: Prefer narrow, focused interfaces over wide, general-purpose ones.
  A caller should not depend on members it does not use.
- **Dependency Inversion**: Depend on abstractions (`interface`, `abstract class`), not concretions.
  Inject dependencies through constructors; never `new` up a service inside a domain class.

<!-- slot: layering -->
Keep business logic out of I/O, transport, and presentation boundaries — controllers, minimal-API
handlers, and console commands should delegate to domain/application services, not contain logic.
A change to the delivery mechanism (HTTP → gRPC, Console → GUI) must not require changes to the
domain.

**No hardcoded configuration.** Environment-specific values (connection strings, URLs, timeouts,
feature flags, numeric limits) belong in `IConfiguration`, environment variables, or `IOptions<T>`
— never as bare literals in logic. See `cs-security` for the stronger invariant on credentials.

<!-- slot: coupling -->
Avoid circular project references — they signal a missing abstraction. Circular namespace references
within a project are also a smell. Prefer narrow public interfaces; a class that `using`s more than
5 sibling namespaces or a project that `<ProjectReference>`s more than 5 siblings is a coupling smell.

- **Detect:** `cs-architecture-reviewer` builds the project graph and flags cycles.
- **Fix:** `cs-refactor-specialist` extracts the shared interface or DTO into a third project that
  both sides can reference without a cycle.

<!-- slot: perf-profiler-ref -->
cs-performance-profiler

<!-- slot: design-patterns -->
Use Strategy for interchangeable algorithms, Factory for object creation, Adapter for interface
translation, and Builder for complex object construction. Avoid Singleton (hides dependencies,
obstructs testing) and Service Locator (obscures dependencies, inverts control in the wrong
direction — prefer constructor injection via the DI container).

<!-- slot: error-handling -->
Chain exceptions with cause context using `throw new SpecificException("context", innerException)`
— preserves the inner exception for full stack traces. For recoverable paths, return an explicit
result — a typed `T?`, a `(T Value, string? Error)` tuple, or a small immutable `record` — with the
contract documented; reserve exceptions for truly exceptional cases.

Never swallow silently: catch the **narrowest** exception type possible; at every `catch` boundary
either log with context or re-throw (preserving the inner exception). The anti-pattern to avoid:
`catch (Exception) { }` (or bare `catch { }`).

Use `when` clauses to filter exceptions without unwrapping the stack: `catch (HttpException ex) when (ex.StatusCode == 404)`.
