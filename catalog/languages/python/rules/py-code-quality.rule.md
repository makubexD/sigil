---
id: python/py-code-quality
kind: rule
title: Code Quality (Python)
description: Python code-quality checks — search before adding, thin entry points, no import cycles, exception chaining
language: python
appliesTo:
  - "**/*.py"
extends:
  - shared/clean-code
tags:
  - python
  - code
  - quality
appliesToRationale: Scoped to Python source because these structural and error-handling rules govern function, class and module design, which only exists in .py files.
---

## Code Quality

- Before adding a class, function or module, search for one with the same concern and extend it instead.
- Views, routers and CLI entry points only delegate; business logic lives in domain or service functions.
- No environment-specific literals (URLs, timeouts, flags) in logic; they come from settings.
- No circular imports, and no deferred `import` inside a function to dodge one: move the shared type to a third
  module.
- No module-level mutable singletons or service locators; pass dependencies in.
- Catch the narrowest exception; recover, or re-raise with bare `raise` or `raise NewError("context") from err`;
  log and continue only at a top-level boundary (request handler, CLI entry point, job runner). Never
  `except Exception: pass` or a bare `except:`.
- Profile before optimizing (`py-performance-profiler`); optimize only a measured hot path.
