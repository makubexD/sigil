---
id: react/react-documentation
kind: rule
title: Documentation (React)
description: React component documentation — TSDoc for exported components/hooks, Storybook stories as living docs, prop-table expectations
language: react
appliesTo:
  - "**/*.tsx"
tags:
  - react
  - documentation
appliesToRationale: Scoped to component files because these documentation conventions apply to exported React components and hooks specifically.
---

## TSDoc on Exported Components and Hooks

Document every exported component and custom hook with TSDoc — what it renders/does, and any
non-obvious prop contract:

```tsx
/**
 * Renders a user's avatar with a fallback to their initials when no image is set.
 *
 * @param size - Diameter in pixels. Defaults to 40.
 * @param user - Must include at least `name`; `avatarUrl` is optional.
 */
export function Avatar({ user, size = 40 }: AvatarProps): React.ReactElement { ... }
```

For a custom hook, document the contract the caller must uphold (call-order rules, cleanup
requirements) the same way `ts-documentation` asks for interface invariants:

```tsx
/**
 * Subscribes to real-time presence updates for a room.
 *
 * Must be called inside a component that stays mounted for the room's lifetime —
 * unmounting tears down the subscription; remounting re-subscribes from scratch.
 */
export function usePresence(roomId: string): PresenceState { ... }
```

## Props as the Primary Contract

A well-typed `Props` interface with narrow, specific types (a literal union instead of `string`
for a variant prop) documents the component's contract more reliably than prose — prioritize
accurate prop types over restating them in a comment.

```tsx
interface ButtonProps {
  /** Visual style. "danger" triggers the confirm-before-action pattern automatically. */
  variant: "primary" | "secondary" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}
```

## Storybook Stories as Living Documentation

For a shared/design-system component, a Storybook story documents real usage better than prose —
it's executable, visually verifiable, and stays honest because it actually renders:

```tsx
export const Danger: Story = {
  args: { variant: "danger", children: "Delete account" },
};
```

Not every component needs a story — reserve them for shared, reused, or design-system components;
a one-off page-specific component does not need one.

## What Must Not Go in Documentation

- Implementation details likely to drift (internal state shape, which hook it's built on).
- Commented-out JSX — delete it; version control remembers it.
- Restating the component name: `/** Renders the Avatar. */` on `Avatar` adds nothing.

## README Expectations

A shared component library's `README.md` covers: what it is, install/setup, a minimal usage example
per major export, and how to run Storybook/tests locally. A single app's top-level `README.md`
covers install, dev-server start command, required environment variables (names only), and how to
run tests/build.

## Keeping Docs Current

When a component's props, a hook's return shape, or its side-effect contract changes, update its
TSDoc and any Storybook story in the **same commit**. A story that no longer matches the component's
actual prop types is worse than no story — it teaches the wrong usage.
