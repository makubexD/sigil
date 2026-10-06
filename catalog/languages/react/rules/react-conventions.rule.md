---
id: react/react-conventions
kind: rule
title: React Component Style
description: React-specific style and architecture rules — hooks conventions, component composition patterns, and TypeScript integration (the clean-code baseline arrives through react-code-quality).
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
tags:
  - react
  - typescript
  - hooks
  - style
appliesToRationale: Scoped to component files (.tsx/.jsx) because these hooks and composition conventions apply only to React component code, not plain TypeScript modules or config.
---
- **Function components only.** Never write class components for new code. Use function components with hooks.
- **One component per file.** Each file exports one primary component. Co-located sub-components are fine if small and not reused elsewhere.
- **Props typed with interfaces.** Define a `Props` interface at the top of each component file. Never use inline anonymous types in function signatures.
- **Destructure props at the top.** `const { title, onClick, children } = props;` — do not access `props.x` throughout the body.
- **Explicit return types.** `function MyComponent(props: Props): React.ReactElement` — helps catch accidental `undefined` returns.
- **`useCallback` and `useMemo` with intention.** Only memoize when the profiler shows a real problem or when a callback is passed to a child wrapped in `React.memo`. Premature memoization adds noise.
- **Keep effects minimal.** Each `useEffect` does one thing. If an effect has two unrelated cleanup paths, split into two effects.
- **No direct state mutation.** Treat all state as immutable. Use spread (`[...arr, item]`) or `immer` — never `arr.push(item)`.
- **Avoid prop drilling beyond two levels.** Use Context or a state library (Zustand, Jotai) when data flows more than two component levels down.
- **Key props on lists.** Always provide a stable, unique `key` on list items — never the array index unless the list is static and unordered.
- **`data-testid` over CSS class selectors in tests.** Use `data-testid="submit-button"` for test targeting; CSS classes and element structure change more often.
