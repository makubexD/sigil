---
id: typescript/ts-allow-dev-tools
kind: settings
title: "Allow Dev Tools (TypeScript)"
description: >-
  Grants Claude Code permission to run the standard Node.js / TypeScript development commands (npm
  scripts, tsc, eslint, prettier) without per-call confirmation (TypeScript)
language: typescript
permissions:
  allow:
    - "Bash(npm run *)"
    - "Bash(npx tsc *)"
    - "Bash(npx eslint *)"
    - "Bash(npx prettier *)"
tags: [permissions, developer-experience, typescript]
---

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json` using
array-union semantics: your existing allow entries are preserved; only missing entries are added.

**What's allowed:**
- `npm run *`: any npm script (lint, test, build, etc.)
- The TypeScript compiler, ESLint and Prettier through `npx`

No `git` entries: Claude Code already runs read-only commands such as `git status`, `git diff` and
`git log` without a prompt.

To allow more commands, install another settings artifact with extra allow entries or use
`sigil patch typescript/ts-allow-dev-tools --add-permission-allow "Bash(your-command)"`.
