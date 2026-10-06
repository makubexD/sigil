---
id: angular/ng-allow-dev-tools
kind: settings
title: "Allow Dev Tools (Angular)"
description: >-
  Grants Claude Code permission to run the standard Angular development commands (npm scripts, ng
  build, ng test, ng lint) without per-call confirmation (Angular)
language: angular
permissions:
  allow:
    - "Bash(npm run *)"
    - "Bash(npx ng build *)"
    - "Bash(npx ng test *)"
    - "Bash(npx ng lint *)"
    - "Bash(npx prettier *)"
tags: [permissions, developer-experience, angular]
---

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json` using
array-union semantics: your existing allow entries are preserved; only missing entries are added.

**What's allowed:**
- `npm run *`: any npm script
- `npx ng build *`, `npx ng test *`, `npx ng lint *`: the Angular CLI's build, test and lint
  targets (not `ng serve`, which never exits, and not `ng update`, which rewrites the workspace)
- Prettier through `npx`

No `git` entries: Claude Code already runs read-only commands such as `git status` and `git diff`
without a prompt.

To allow more commands, install another settings artifact with extra allow entries or use
`sigil patch angular/ng-allow-dev-tools --add-permission-allow "Bash(your-command)"`.
