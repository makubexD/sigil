---
name: react-document
description: "Add or update TSDoc comments for a React component's exported components/hooks and their props, following the project's documented conventions"
when_to_use: "Use when a component or hook's exported symbols lack TSDoc, or existing docs are stale relative to the current props/return shape. Fires for \"document this component\", \"add docs\", or \"update the docs for this hook\"."
allowed-tools: Read, Edit, Glob, Grep
argument-hint: "<file-or-component>"
---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

If `$ARGUMENTS` is provided, use it as the target file or component. If empty, ask the user
which component or hook to document before proceeding.

## Step 2 — Discover documentation style

Check existing components for TSDoc style and whether Storybook is configured (`.storybook/` present
— stories are part of the documentation surface for shared components; see `react-documentation`).

## Step 3 — Read the target

For the target file, list every exported component, hook, and its `Props`/return type. For each:
- **Missing TSDoc** — no `/** ... */` above the export.
- **Stale TSDoc** — described props don't match the current `Props` interface, or a documented
  return shape no longer matches the hook's actual return.
- **Adequate** — skip; do not touch documentation that already matches the code.

## Step 4 — Write documentation

For each exported component, document what it renders and any non-obvious prop contract:

```tsx
/**
 * Renders a user's avatar with a fallback to their initials when no image is set.
 *
 * @param size - Diameter in pixels. Defaults to 40.
 * @param user - Must include at least `name`; `avatarUrl` is optional.
 */
export function Avatar({ user, size = 40 }: AvatarProps): React.ReactElement { ... }
```

For each exported hook, document the contract the caller must uphold (call-order rules, cleanup
requirements):

```tsx
/**
 * Subscribes to real-time presence updates for a room.
 *
 * Must be called inside a component that stays mounted for the room's lifetime —
 * unmounting tears down the subscription.
 */
export function usePresence(roomId: string): PresenceState { ... }
```

Add inline TSDoc on individual `Props` fields whose purpose isn't obvious from the name/type alone.

### Update or add a Storybook story (shared components only)

If the component is a shared/design-system component with an existing story, verify it still
matches the current props — update it if it references a removed/renamed prop. Do not create a new
story for a one-off, page-specific component.

## Step 5 — Run and report

```bash
npx tsc --noEmit   # confirm the edit introduced no type errors
```
Re-read each edited doc comment against the actual current props/return type.

```
## Documentation Report

### Documented
- `Component`/`useHook` — <what was added/updated>

### Skipped (already adequate)
- `Component`/`useHook`

### Still undocumented: <N>
- `Component`/`useHook` — <why it was left (e.g. intent unclear from the code)>

### Verification
Type check: clean
```

---

## Applied Rules

### Documentation (React)

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
