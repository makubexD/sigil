---
id: shared/allow-dev-tools
kind: settings
title: "Allow Common Dev Tools"
description: >-
  Grants Claude Code permission to run standard development commands (npm scripts,
  tsc, eslint, prettier) without requiring per-call confirmation.
permissions:
  allow:
    - "Bash(npm run *)"
    - "Bash(npx tsc *)"
    - "Bash(npx eslint *)"
    - "Bash(npx prettier *)"
tags: [permissions, developer-experience, shared]
# version:       # per-artifact semver (optional; package version is the default)
# platforms:     # omit to propagate to ALL supporting AIs (DRY default)
---

<!-- Describe what this settings fragment configures. Fields above are merged into settings.json. -->

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json`
using array-union semantics — your existing allow entries are preserved; only missing
entries are added.

**What's allowed:**
- `npm run *` — any npm script (lint, test, build, etc.)
- TypeScript compiler, ESLint, Prettier via `npx`

No `git` entries: Claude Code already runs read-only commands such as `git status`, `git diff` and
`git log` without a prompt, so allowing them here changed nothing.

To allow additional commands, install another settings artifact with extra allow entries
or use `sigil patch shared/allow-dev-tools --add-permission-allow "Bash(your-command)"`.
