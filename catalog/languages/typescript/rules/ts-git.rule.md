---
id: typescript/ts-git
kind: rule
title: Git (TypeScript)
description: TypeScript .gitignore additions — dependencies, build output and local env files
language: typescript
appliesTo:
  - "**/.gitignore"
appliesToRationale: Scoped to .gitignore because the TypeScript-specific additions apply on top of the shared git baseline.
extends:
  - shared/git
tags:
  - typescript
  - git
---

## TypeScript `.gitignore` Additions

Standard TypeScript additions on top of the shared baseline:

```
node_modules/
dist/
build/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
```
