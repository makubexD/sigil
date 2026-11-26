---
id: react/react-git
kind: rule
title: Git (React)
description: React .gitignore additions — dependencies, build output and local env files
language: react
extends:
  - shared/git
appliesTo:
  - "**/.gitignore"
tags:
  - react
  - git
appliesToRationale: Scoped to .gitignore because the React-specific additions apply on top of the shared git baseline.
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
