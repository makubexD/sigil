---
id: angular/ng-git
kind: rule
title: Git (Angular)
description: Angular-specific git additions — .gitignore entries, public-surface deprecation, ng pre-push gate.
language: angular
appliesTo:
  - "**/*"
appliesToRationale: Matches shared/git — it governs commit/PR workflow, not any specific file.
extends: [shared/git]
tags:
  - angular
  - git
---

## Angular Secrets Hygiene

Remember that anything bundled into the client (including `environment.ts`) is public by
definition — see `ng-security`.

Use `.gitignore` to exclude `node_modules/`, `dist/`, `.angular/` (build cache), `coverage/`,
`*.log`, and `.env*` files. Use `.env.example` with placeholder values to document required
variables.

## Angular Deprecation Mechanics

Changing or removing a public interface is a **breaking change** — for a published library that
means a removed/renamed export or selector, a removed or newly-`required` `@Input`, a narrowed
type, or a widened Angular peer-range floor (see `ng-api-compat-reviewer`). Mark the old surface
with a `@deprecated` TSDoc tag (and a runtime warning where practical), and keep it working for at
least one release. Don't break a consumer silently — an unexpected runtime error in downstream
code is harder to diagnose than an explicit deprecation notice.

## Pre-Push Checklist (manual — no hooks)

Before pushing:
1. Quality gate green: discovered `npm run check` (or `ng lint` + `tsc --noEmit` + `vitest run`).
2. Optional formatter clean if configured (`prettier --check .` / `biome check .`).
3. No `.env` / credential files staged.
4. Commit message follows the convention above.
