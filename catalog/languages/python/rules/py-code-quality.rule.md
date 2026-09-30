---
id: python/py-code-quality
kind: rule
title: Code Quality (Python)
description: Search-first protocol + structural size limits (function/param caps) for Python — prevents duplication and complexity creep
language: python
appliesTo:
  - "**/*.py"
extends:
  - shared/clean-code
template: shared/templates/code-quality
tags:
  - python
  - code
  - quality
appliesToRationale: Scoped to Python source because these structural and SOLID principles govern function/class design, which only exists in .py files.
---
<!-- slot: structure-limits -->
Max 20 lines per function body (40 lines for a factory/builder function or a `pytest` fixture with
setup/teardown). Max 4 parameters per function or method signature — beyond that, accept a
`dataclass`/`TypedDict` bundling the related arguments instead.

A module beyond ~300 lines or a class beyond ~7 public methods is a **God Object** candidate —
extract a collaborator or split into smaller, single-responsibility modules/classes.

<!-- slot: solid-principles -->
- **Single Responsibility**: Each class or module has one reason to change.
- **Open/Closed**: Extend behavior through composition or a `Protocol`, not modification.
- **Liskov Substitution**: A subclass must be substitutable for its base class without altering
  correctness — do not narrow an overridden method's accepted input or widen its raised exceptions.
- **Interface Segregation**: Prefer small `Protocol`s over one wide interface. A caller should not
  depend on methods it does not use.
- **Dependency Inversion**: Depend on abstractions (`Protocol`, an injected callable), not concrete
  classes. Pass dependencies through `__init__` or a function parameter; do not instantiate a
  collaborator deep inside business logic.

<!-- slot: layering -->
Keep business logic out of I/O, transport, and presentation boundaries — FastAPI/Django view
functions and CLI entry points should delegate to domain/service functions, not contain logic
themselves. A change to the delivery mechanism (REST → CLI, sync → async) must not require changes
to the domain layer.

**No hardcoded configuration.** Environment-specific values (connection strings, URLs, timeouts,
feature flags) belong in `pydantic-settings`/`os.environ`/Django `settings.py` — never as bare
literals in logic. See `py-security` for the stronger invariant on credentials.

<!-- slot: coupling -->
Avoid circular imports — Python raises `ImportError` at runtime for genuine cycles, and even a
lazily-avoided cycle (a deferred `import` inside a function to dodge it) signals a missing
abstraction. Prefer narrow public modules; a module that is imported by more than 5 unrelated
siblings, or that itself imports from more than 5 siblings, is a coupling smell.

- **Detect:** `py-architecture-reviewer` builds the import graph and flags cycles.
- **Fix:** `py-refactor-specialist` extracts the shared interface or data type into a third module
  both sides can import without a cycle.

<!-- slot: perf-profiler-ref -->
py-performance-profiler

<!-- slot: design-patterns -->
Use Strategy for interchangeable algorithms (pass a callable or a `Protocol` implementation),
Factory functions for object creation, and Adapter for wrapping a third-party interface behind your
own. Avoid Singleton (module-level mutable global state hides dependencies and obstructs testing)
and Service Locator (a global registry obscures which dependencies a function actually needs —
prefer explicit constructor/parameter injection).

<!-- slot: error-handling -->
Chain exceptions with `raise NewError("context") from original_err` — preserves the original
traceback as `__cause__` for full diagnostic context. For recoverable paths, return an explicit
result (an `Optional[T]`, a small `dataclass`, or a `Result`-style union) with the contract
documented in the docstring; reserve `raise` for truly exceptional cases.

Never swallow silently: catch the **narrowest** exception type possible; at every `except` boundary
either log with context or re-raise (`raise` bare inside `except` to preserve the traceback, or
`raise NewError(...) from err` to add context). The anti-pattern to avoid: `except Exception: pass`
or a bare `except:` (which also catches `KeyboardInterrupt`/`SystemExit`).
