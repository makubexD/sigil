---
id: angular/ng-git
kind: rule
title: Git (Angular)
description: Angular .gitignore additions — dependencies, build cache and output, local env files
language: angular
appliesTo:
  - "**/.gitignore"
appliesToRationale: Scoped to .gitignore because the Angular-specific additions apply on top of the shared git baseline.
extends:
  - shared/git
tags:
  - angular
  - git
---

## Angular `.gitignore` Additions

Standard Angular additions on top of the shared baseline. Anything bundled into the client, `environment.ts`
included, is public.

```
node_modules/
dist/
.angular/
coverage/
*.log
.env*
```
