---
id: react/react-git
kind: rule
title: Git (React)
description: React-specific git hygiene — .gitignore for build/env artifacts, no secrets, deprecating a shared component
language: react
extends:
  - shared/git
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/.gitignore"
tags:
  - react
  - git
appliesToRationale: Scoped to component files and .gitignore because these additions (build-artifact exclusions, component deprecation mechanics) are React-specific on top of the shared git baseline.
---

## React `.gitignore` Additions

Standard React/frontend additions on top of the shared baseline:

```
node_modules/
dist/
build/
.next/
.vite/
coverage/
.env
.env.local
.env.*.local
storybook-static/
```

Never commit build output (`dist/`, `.next/`) — it's fully reproducible from source and bloats
history with generated diffs on every commit.

## No Secrets in History

Never commit secrets — even a client-exposed `NEXT_PUBLIC_*`/`VITE_*` variable that looks like
"just a public key" deserves review before committing a real value; use `.env.example` with
placeholders. A genuinely private key (a server-only API secret) must never be prefixed
`NEXT_PUBLIC_`/`VITE_` in the first place — that prefix ships the value straight into client bundles.

If a real secret is accidentally committed, rotate it immediately and remove it from history with
`git filter-repo`.

## Deprecating a Shared Component

Mark a deprecated exported component or hook with `@deprecated` in its TSDoc and keep it functional
for at least one release before removal, same as `ts-git`'s convention:

```tsx
/**
 * @deprecated Use `<Avatar />` instead. Will be removed in v3.0.
 */
export function UserIcon(props: UserIconProps) { ... }
```

If the component has a Storybook story, mark the story deprecated too (a banner or a `deprecated:
true` parameter, per the project's Storybook config) so it doesn't read as a recommended pattern.

## Pre-Push Checklist (manual — no hooks)

Before pushing: the quality gate is green (discover from `package.json` scripts — typically
lint + type-check + `vitest run`/`jest` + a production build to catch build-only errors), no `.env`
files are staged, and the commit message follows the shared convention.
