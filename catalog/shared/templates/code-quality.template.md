---
id: shared/templates/code-quality
kind: template
title: "Language Code-Quality Rule"
description: >-
  Shared skeleton for a language's `*-code-quality` rule: the SEARCH FIRST protocol and the
  DRY/KISS/YAGNI triad are identical across languages (confirmed via body-shingle overlap analysis,
  docs/audits/2026-08-20/analysis/lane-d-duplication.json — the highest cross-language overlap in
  the catalog, ~0.33-0.44). Structure limits, SOLID elaboration, layering, coupling, and design
  patterns stay per-language slots because each language's idiom (exceptions vs cause chains,
  DI container vs constructor injection, project refs vs module imports) differs enough that
  forcing them into template prose would lose real information — see docs/decisions/
  catalog-quality-audit-2026-08.md's "what was and wasn't templatized" section.
appliesToKind:
  - rule
revision: 1
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

## SOLID Principles
<!-- slot: solid-principles -->

## Layering
<!-- slot: layering -->

## Circular Dependencies and Coupling
<!-- slot: coupling -->

## DRY / KISS / YAGNI
- **DRY**: Every piece of knowledge has a single, authoritative representation. Duplication is a bug.
- **KISS**: The simplest solution that works is the correct one. Add complexity only when required.
- **YAGNI**: Do not implement functionality until it is actually needed. Speculative generality adds debt.
- **No premature optimization**: write the clear solution first; profile with `<!-- slot: perf-profiler-ref -->`
  before optimizing. Optimize only measured hot paths — complexity bought without evidence is debt.

## Design Patterns
<!-- slot: design-patterns -->

## Error Handling
<!-- slot: error-handling -->
