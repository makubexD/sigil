---
id: shared/templates/code-quality
kind: template
title: "Language Code-Quality Rule"
description: >-
  Shared skeleton for a language's `*-code-quality` rule: the Scope First ladder and the
  optimization note are identical across languages (confirmed via body-shingle overlap analysis,
  docs/audits/2026-08-20/analysis/lane-d-duplication.json — the highest cross-language overlap in
  the catalog, ~0.33-0.44). The duplication doctrine lives once, in the shared/clean-code base
  every member extends (docs/audits/2026-10-14). Structure limits, SOLID elaboration, layering, coupling, and design
  patterns stay per-language slots because each language's idiom (exceptions vs cause chains,
  DI container vs constructor injection, project refs vs module imports) differs enough that
  forcing them into template prose would lose real information — see docs/decisions/
  catalog-quality-audit-2026-08.md's "what was and wasn't templatized" section.
appliesToKind:
  - rule
revision: 3
slots:
  - key: structure-limits
    required: true
    description: >-
      The per-language size-limit paragraph: max lines per function/method, max parameters, and
      the "God Object" candidate threshold with a language-specific example of what triggers it.
  - key: solid-principles
    required: true
    description: >-
      The 5 SOLID bullets, each phrased for this language's own unit of composition (class,
      component, service, module) and injection mechanism.
  - key: layering
    required: true
    description: >-
      The layering paragraph plus the "no hardcoded configuration" note naming this language's
      actual config mechanism (env vars, IConfiguration, environment.ts) and cross-referencing
      the language's own `*-security` rule.
  - key: coupling
    required: true
    description: >-
      The circular-dependency/coupling paragraph plus Detect/Fix lines naming this language's own
      `*-architecture-reviewer` and `*-refactor-specialist` agents.
  - key: perf-profiler-ref
    required: true
    description: >-
      Just this language's performance-profiler agent id (e.g. `ts-performance-profiler`) —
      substituted inline into the shared "No premature optimization" sentence below.
  - key: design-patterns
    required: true
    description: >-
      The design-patterns paragraph — which anti-patterns to avoid (Singleton, Service Locator)
      phrased for this language's actual DI mechanism.
  - key: error-handling
    required: true
    description: >-
      The full Error Handling section: this language's cause-chaining idiom, narrowest-catch
      guidance, and its own code example of the anti-pattern to avoid.
docs:
  - url: "https://en.wikipedia.org/wiki/SOLID"
    verifiedOn: "2026-08-20"
    covers: "SOLID principle definitions this template's ## SOLID Principles slot elaborates per language."
tags: [shared, rule, template, code-quality]
---
## Scope First
Write only what the task asks for. Before adding a function, type, option, file or dependency,
take the first step that fits:

1. **Does it need to exist?** Skip features, options and layers nobody asked for; name them in
   one line of your summary.
2. **The standard library** does it? Use it.
3. **An installed dependency** does it? Use it; never add one for a few lines.
4. **This codebase** does it (80%+ same concern)? Extend that code.
5. Otherwise write the smallest version that fully meets the requirement, with tests.

Smallest is not incomplete: validation, error handling and implied edge cases are part of it.

## Code Structure Limits
<!-- slot: structure-limits -->

## SOLID Principles
<!-- slot: solid-principles -->

## Layering
<!-- slot: layering -->

## Circular Dependencies and Coupling
<!-- slot: coupling -->

## Optimization
Optimize only hot paths measured with `<!-- slot: perf-profiler-ref -->`: complexity bought
without evidence is debt.

## Design Patterns
<!-- slot: design-patterns -->

## Error Handling
Every catch either handles the error (recovers, or returns a typed error result) or rethrows it with
the original attached as the cause. Log and continue only at a top-level boundary (request handler,
command entry point, job runner, UI event handler), where the error stops travelling.

<!-- slot: error-handling -->
