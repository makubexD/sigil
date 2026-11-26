---
id: react/react-conventions
kind: rule
title: "Conventions (React)"
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
- Function components only, one primary component per file.
- Props are a `Props` interface (or `<Component>Props`), destructured at the top; no inline anonymous prop types.
- Never mutate state: spread or `immer`, not `arr.push(item)`.
- Always provide a stable, unique `key` on list items, never the array index unless the list is static.
- Each `useEffect` does one thing; two unrelated cleanups are two effects.
- `useCallback`/`useMemo` only for a measured problem or a callback passed to a `React.memo` child.
- No prop drilling beyond two levels: use Context or the state library the project already has.
- Names: `PascalCase` components and their files, `use` + `PascalCase` hooks (the Rules of Hooks lint relies on
  the prefix), `on<Event>` props and `handle<Event>` handlers, `is`/`has`/`should` booleans.

For a code review in this repo, use the `react-code-reviewer` agent when it is installed, not a general-purpose
reviewer: it reviews against these rules.
