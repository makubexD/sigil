---
id: angular/ng-add-project
kind: skill
title: "Add Project (Angular)"
description: "Add an application or library to an existing Angular workspace with its standards pre-wired — newProjectRoot, prefix, standalone, test runner, tsconfig path mapping — then build and test it (Angular)"
name: ng-add-project
language: angular
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=app|lib]"
uses:
  rules:
    - angular/ng-project-layout
    - angular/ng-conventions
  agents:
    - angular/ng-architecture-reviewer
tags:
  - angular
  - scaffold
  - project
whenToUse: "Run via `/ng-add-project <name>` when an Angular workspace (an `angular.json`) already exists and needs another project in it — e.g. \"add a shared-ui library to the workspace\", \"generate an admin application next to the main app\". Pass the project name and optional `--type`. Requires an existing workspace; to create a brand-new workspace in an empty directory use ng-new-project instead. Never overwrites existing files; confirms before editing workspace config."
---

# Add Project

**Project name + type:** {sigil:arguments}

Parse `{sigil:arguments}`: first token → `<name>` (kebab-case, e.g. `shared-ui`, `admin`);
`--type=<app|lib>` (default: `lib`).

## Step 1 — Discover repo standards

Confirm `angular.json` exists at the workspace root. If it does not, **stop** — this skill adds to
an existing workspace; creating one is a different task.

Read: `angular.json` (`newProjectRoot`, each project's `prefix`, `schematics` defaults such as
`standalone`, `style`, `changeDetection`, and the `test` builder in use — Karma, Jest, Vitest, or
Web Test Runner); root `package.json` (Angular version, scripts, which test runner is actually a
`devDependency`); `tsconfig.json` (`compilerOptions.paths`, strictness flags); `eslint.config.*`;
`{sigil:conventions-file}` for documented layering and naming; and one existing project of the
same type as a concrete reference. Never assume a test runner — use the one the workspace uses.

## Step 2 — Determine placement

- `app` → `<newProjectRoot>/<name>/` (default `projects/<name>/`)
- `lib` → `<newProjectRoot>/<name>/` with `ng-package.json` and `src/public-api.ts`

If the workspace uses a different convention (for example apps under `apps/` and libraries under
`libs/` via `--project-root`), follow the existing projects, not the default. Pick the `prefix`
the sibling projects use. **Do not overwrite any existing file** — if `angular.json` already has a
project named `<name>` or the target path exists, stop and report.

## Step 3 — Scaffold the project

Use the Angular CLI so `angular.json` and the project tsconfigs are written consistently:

```bash
# application
npx ng generate application <name> --prefix=<prefix> --style=<style> --routing --ssr=false
# library
npx ng generate library <name> --prefix=<prefix>
```

Add `--project-root=<path>` when Step 2 chose a non-default root, and `--standalone=false` only
when the workspace's existing projects are NgModule-based. Then align the generated files with the
sibling project: tsconfig `extends`, ESLint config, `changeDetection: OnPush` default in the
project's `schematics`, and a seed component or service that shows the conventions (standalone,
signals, `inject()`).

## Step 4 — Scaffold the tests

Configure the project's `test` target with the same builder and options as the reference project
(the CLI default may differ from what the workspace uses). Create a seed spec next to the seed
component or service, in the runner's style — `TestBed` with the standalone component in
`imports`, one real behavior asserted (no `expect(true)` placeholders left behind).

## Step 5 — Add to the solution or workspace

Present what will change before editing shared config:

```
The following will be updated:
  angular.json                  — project "<name>" (already added by ng generate)
  tsconfig.json                 — paths: "<scope>/<name>": ["<lib dist or src path>"]   (lib only)
  package.json                  — scripts: build:<name>, test:<name>   (if siblings have them)

Proceed? [y/N]
```

Wait for confirmation. For a library, make sure the `paths` entry matches how sibling libraries
are consumed (the `dist/` output or the source `public-api.ts`) — the CLI adds a `dist/` mapping by
default. Add per-project scripts only if the workspace already uses that pattern.

## Step 6 — Build and test

```bash
npx ng build <name>
npx ng test <name> --watch=false
npx ng lint <name>   # when a lint target exists
```

For a library, also import it from one consuming project (or a throwaway check) to confirm the
path mapping resolves. If any command fails, report the error — do not leave a broken project in
the workspace.

## Step 7 — Report

```
## Add Project Report

Project:   <newProjectRoot>/<name>/
Type:      <app / lib>
Prefix:    <prefix>
Runner:    <discovered in Step 1>

Files created / updated:
  angular.json                       (project "<name>")
  <newProjectRoot>/<name>/...        (generated files)
  tsconfig.json                      (paths — lib only)

Standards applied:
  ✅ Standalone components (matches workspace schematics)
  ✅ Prefix matches sibling projects
  ✅ Test builder matches the workspace runner
  ✅ tsconfig extends the workspace base (strict)

Build: ✅ passed  /  ❌ <error>
Tests: ✅ passed  /  ❌ <error>
Lint:  ✅ passed  /  ⚠ no lint target  /  ❌ <error>
```
