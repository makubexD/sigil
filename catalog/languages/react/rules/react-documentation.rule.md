---
id: react/react-documentation
kind: rule
title: Documentation (React)
description: React component documentation — TSDoc for exported components/hooks, Storybook stories as living docs, prop-table expectations
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
tags:
  - react
  - documentation
appliesToRationale: Scoped to component files because these documentation conventions apply to exported React components and hooks specifically.
---

## TSDoc

- Every exported component and custom hook has a TSDoc comment: what it renders or does, and any prop contract
  the types don't show. A hook documents what the caller must keep (call order, mount lifetime, cleanup).
- Accurate prop types (a literal union, not `string`) come before prose; don't restate them or the component name.
- A shared or design-system component has a Storybook story when the project uses Storybook; a one-off page
  component does not need one.
- Deprecate an exported component or hook with `@deprecated Use X instead.`, keep it working for at least one
  release, and mark its story deprecated.
- A README covers install, the dev-server command, required environment variable names (never values), and how to
  run tests and the build; a component library adds a usage example per major export.
- When props, a hook's return shape or its side effects change, update the TSDoc and the story in the same commit.
