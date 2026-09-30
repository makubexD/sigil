---
id: react/react-document
kind: skill
title: "Document (React)"
description: "Add or update TSDoc comments for a React component's exported components/hooks and their props, following the project's documented conventions"
name: react-document
language: react
allowedTools:
  - Read
  - Edit
  - Glob
  - Grep
argumentHint: "<file-or-component>"
uses:
  rules:
    - react/react-documentation
  agents: []
tags:
  - react
  - documentation
whenToUse: "Use when a component or hook's exported symbols lack TSDoc, or existing docs are stale relative to the current props/return shape. Fires for \"document this component\", \"add docs\", or \"update the docs for this hook\"."
---

# Document

**Target:** {sigil:arguments}

## Step 1 — Discover the project's documentation convention

Check existing components for TSDoc style and whether Storybook is configured (`.storybook/` present
— stories are part of the documentation surface for shared components; see `react-documentation`).

## Step 2 — Identify undocumented or stale exported symbols

For the target file, list every exported component, hook, and its `Props`/return type. For each:
- **Missing TSDoc** — no `/** ... */` above the export.
- **Stale TSDoc** — described props don't match the current `Props` interface, or a documented
  return shape no longer matches the hook's actual return.
- **Adequate** — skip; do not touch documentation that already matches the code.

## Step 3 — Write TSDoc

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

## Step 4 — Update or add a Storybook story (shared components only)

If the component is a shared/design-system component with an existing story, verify it still
matches the current props — update it if it references a removed/renamed prop. Do not create a new
story for a one-off, page-specific component.

## Step 5 — Verify

```bash
npx tsc --noEmit   # confirm the edit introduced no type errors
```
Re-read each edited doc comment against the actual current props/return type.

## Step 6 — Report

```
## Documentation Report

### Documented
- `Component`/`useHook` — <what was added/updated>

### Skipped (already adequate)
- `Component`/`useHook`

### Verification
Type check: clean
```
