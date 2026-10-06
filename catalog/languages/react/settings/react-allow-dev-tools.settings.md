---
id: react/react-allow-dev-tools
kind: settings
title: "Allow Dev Tools (React)"
description: >-
  Grants Claude Code permission to run the standard React development commands (npm scripts, tsc,
  eslint, prettier, vitest) without per-call confirmation (React)
language: react
permissions:
  allow:
    - "Bash(npm run *)"
    - "Bash(npx tsc *)"
    - "Bash(npx eslint *)"
    - "Bash(npx prettier *)"
    - "Bash(npx vitest run *)"
tags: [permissions, developer-experience, react]
---

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json` using
array-union semantics: your existing allow entries are preserved; only missing entries are added.

**What's allowed:**
- `npm run *`: any npm script (dev, lint, test, build, etc.)
- The TypeScript compiler, ESLint and Prettier through `npx`
- `npx vitest run *`: a single test run (never watch mode, which does not exit)

No `git` entries: Claude Code already runs read-only commands such as `git status` and `git diff`
without a prompt.

To allow more commands, install another settings artifact with extra allow entries or use
`sigil patch react/react-allow-dev-tools --add-permission-allow "Bash(your-command)"`.
