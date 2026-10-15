---
id: shared/templates/code-quality
kind: template
title: "Language Code-Quality Rule"
description: >-
  Shared skeleton for a language's `*-code-quality` rule: the SEARCH FIRST protocol and the
  YAGNI note are identical across languages (confirmed via body-shingle overlap analysis,
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
## SEARCH FIRST Protocol
Before creating any class, function, method, or module, search the codebase for similar patterns.
If 80%+ overlap with the same concern exists, extend the existing code — do not create a new one.
If less than 80% overlap or a genuinely different concern, create new. If uncertain whether overlap
is sufficient, ask before proceeding.

## Code Structure Limits
<!-- slot: structure-limits -->

These limits are review signals, not gates: split by responsibility, never only to meet a count.

## SOLID Principles
<!-- slot: solid-principles -->

Inject only what crosses an I/O boundary (clock, network, files, randomness); call pure code directly.

## Layering
<!-- slot: layering -->

## Circular Dependencies and Coupling
<!-- slot: coupling -->

## YAGNI
- **YAGNI**: Do not implement functionality until it is actually needed. Speculative generality adds debt.
- **No premature optimization**: write the clear solution first; profile with `<!-- slot: perf-profiler-ref -->`
  before optimizing. Optimize only measured hot paths — complexity bought without evidence is debt.
  Picking a data structure for a stated input size is not premature optimization.

## Design Patterns
Introduce a pattern only when a second concrete variant exists today; otherwise write the plain
function.

<!-- slot: design-patterns -->

## Error Handling
Every catch either handles the error (recovers, or returns a typed error result) or rethrows it with
the original attached as the cause. Log and continue only at a top-level boundary (request handler,
command entry point, job runner, UI event handler), where the error stops travelling.

<!-- slot: error-handling -->
