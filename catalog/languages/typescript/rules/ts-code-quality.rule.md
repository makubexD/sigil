---
id: typescript/ts-code-quality
kind: rule
title: Code Quality (TypeScript)
description: Search-first protocol + structural size limits (method/param caps) for TypeScript — prevents duplication and complexity creep
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
extends:
  - shared/clean-code
template: shared/templates/code-quality
tags:
  - typescript
  - code
  - quality
appliesToRationale: Structural size limits and the search-first protocol apply to TypeScript source; scoped narrower than the shared/clean-code base it extends, which has no language to restrict to.
---
<!-- slot: structure-limits -->
Max 20 lines per function body (40 lines for config/builder functions). Max 4 parameters per function
or method signature. If either limit is exceeded, split into smaller units before proceeding.

A module beyond ~200 lines or a class beyond ~7 public methods is a **God Object** candidate —
extract a collaborator or split into smaller, single-responsibility units.

<!-- slot: solid-principles -->
- **Single Responsibility**: Each class or module has one reason to change.
- **Open/Closed**: Extend behavior through composition, not modification.
- **Liskov Substitution**: Subtypes must be substitutable for their base types without altering correctness.
- **Interface Segregation**: Prefer narrow, focused interfaces over wide, general-purpose ones.
- **Dependency Inversion**: Depend on abstractions, not concretions. Inject dependencies.

<!-- slot: layering -->
Keep business logic out of I/O, transport, and presentation boundaries — CLI handlers, route
controllers, and middleware should delegate to domain functions, not contain logic themselves. A change
to the delivery mechanism must not require changes to the domain.

**No hardcoded configuration.** Environment-specific values (URLs, timeouts, feature flags, service
addresses, numeric limits) belong in config or environment variables — never as bare literals in logic.
See `ts-security` for the stronger invariant on credentials.

<!-- slot: coupling -->
Avoid circular imports — they signal a missing abstraction. Prefer narrow public interfaces; a module
that exports ≥ 10 symbols or imports from ≥ 5 sibling modules is a coupling smell.

- **Detect:** `ts-architecture-reviewer` builds the module graph and flags cycles.
- **Fix:** `ts-refactor-specialist` extracts the shared type or interface into a third module that
  both sides can import without a cycle.

<!-- slot: perf-profiler-ref -->
ts-performance-profiler

<!-- slot: design-patterns -->
Use Strategy for interchangeable algorithms, Factory for object creation, Adapter for interface
translation, and Builder for complex object construction. Avoid Singleton (hides dependencies,
obstructs testing) and Service Locator (obscures dependencies, inverts control in the wrong direction).

<!-- slot: error-handling -->
Chain exceptions with cause context using `throw new Error("context", { cause: originalErr })`
(preserves the cause chain and stack for the full trace). For recoverable paths, return an explicit
result — a typed `T | undefined`, a discriminated union `{ ok: true; value: T } | { ok: false; error: string }`,
or a small frozen object — with the contract documented in TSDoc; reserve `throw` for truly exceptional
cases. Never swallow silently: catch the **narrowest** type possible (`e instanceof SpecificError`);
at every `catch` boundary either log with context or re-throw with `cause`.

```typescript
// Correct — cause preserved, narrowest catch
try {
  await fetchUser(id);
} catch (e) {
  if (e instanceof NetworkError) {
    throw new DataUnavailableError(`User ${id} unreachable`, { cause: e });
  }
  throw e; // rethrow unknown errors unchanged
}

// Anti-pattern — silent swallow
try {
  await fetchUser(id);
} catch {
  // nothing — the caller never knows
}
```

The anti-pattern to avoid: `catch { }` or `catch (e) { /* ignored */ }`.
