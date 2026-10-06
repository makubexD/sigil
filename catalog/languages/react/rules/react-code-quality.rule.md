---
id: react/react-code-quality
kind: rule
title: Code Quality (React)
description: Search-first protocol + structural size limits (component/prop caps) for React — prevents duplication and complexity creep
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
extends:
  - shared/clean-code
template: shared/templates/code-quality
tags:
  - react
  - code
  - quality
appliesToRationale: Scoped to component files because these structural rules govern component/hook design, which only exists in .tsx/.jsx files.
---
<!-- slot: structure-limits -->
Max 20 lines of JSX return body before extracting a sub-component (a longer render function hides
structure). Max 4 props on a component's `Props` interface before grouping related props into an
object or reaching for composition (`children`, render props) instead of a growing flat prop list.

A component file beyond ~200 lines, or a component managing more than ~5 pieces of local state, is
a decomposition candidate — extract a sub-component or lift shared logic into a custom hook.

<!-- slot: solid-principles -->
- **Single Responsibility**: Each component renders one coherent piece of UI; each custom hook
  encapsulates one concern.
- **Open/Closed**: Extend behavior via composition (`children`, slots, render props) rather than
  adding a growing list of boolean props that branch internal rendering.
- **Liskov Substitution**: A component accepting a more specific prop type must remain usable
  anywhere the more general type is expected — do not silently narrow behavior based on a subtype
  check inside the component.
- **Interface Segregation**: Keep `Props` narrow — a component should not require props it doesn't
  actually use just because a caller's data shape happens to have them.
- **Dependency Inversion**: Depend on injected data/callbacks (props, context) rather than importing
  a global store or API client directly inside a presentational component.

<!-- slot: layering -->
Keep business logic out of presentational components — Page components (route-level) compose
Feature components (business logic + data), which compose UI components (pure presentation, no
domain knowledge, no data fetching). A UI component receiving business-domain objects directly
instead of primitive props is a layering violation.

**No hardcoded configuration.** API base URLs, feature flags, and environment-specific values
belong in `import.meta.env`/`process.env`-sourced config — never as string literals inside a
component. See `react-security` for the stronger invariant on credentials.

<!-- slot: coupling -->
Avoid prop drilling beyond two levels — reach for Context or a state library once a value must pass
through more than two uninvolved intermediate components. A component importing more than 5 sibling
components directly (rather than composing them via props/children) is a coupling smell.

- **Detect:** `react-architecture-reviewer` maps the component/import graph and flags deep drilling
  and cycles.
- **Fix:** `react-refactor-specialist` extracts shared state into Context or a store, or restructures
  the tree to pass data through composition. For an import cycle, it extracts the shared type, hook,
  or constant into a third module both sides can import without a cycle.

<!-- slot: perf-profiler-ref -->
react-performance-profiler

<!-- slot: design-patterns -->
Use composition (`children`, render props, compound components) for interchangeable UI slots,
custom hooks for reusable stateful logic, and a Factory function for constructing complex initial
state. Avoid a giant "god" Context that holds unrelated state (forces every consumer to re-render on
any change) and avoid prop-based feature flags that branch a component's entire render tree — split
into separate components instead.

<!-- slot: error-handling -->
Wrap a subtree that can throw during render (a data-dependent component, third-party integration)
in an Error Boundary with a scoped fallback — do not let one broken widget blank the whole page.
For async operations, catch and surface errors explicitly (toast, inline message); never let a
rejected promise in an event handler fail silently.

```tsx
// Correct — scoped boundary, rest of the page keeps working
<ErrorBoundary fallback={<WidgetErrorFallback />}>
  <FlakyThirdPartyWidget />
</ErrorBoundary>
```

The anti-pattern to avoid: a single top-level `<ErrorBoundary>` around the entire app with a generic
"Something went wrong" fallback — it loses all context about which feature actually failed.
