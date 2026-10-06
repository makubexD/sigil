---
id: angular/ng-new-project
kind: skill
title: "New Project (Angular)"
description: "Create a new Angular workspace in an empty directory with ng new — standalone, routing, strict, SSR choice — plus angular-eslint, the CLI's default test runner, and a starter test (Angular)"
name: ng-new-project
language: angular
allowedTools:
  - Read
  - Write
  - Bash
  - Glob
argumentHint: "<app-name>"
uses:
  rules:
    - angular/ng-project-layout
    - angular/ng-testing
  agents: []
tags:
  - angular
  - scaffold
  - new-project
whenToUse: "Use when starting a brand-new Angular workspace in an empty directory. Fires for \"create a new Angular app\", \"ng new a project called X\", or \"set up an Angular workspace from scratch\". Not for adding an application or library to an existing Angular workspace (use ng-add-project there) or for adding a feature to an existing app."
---

# New Project

**App name:** {sigil:arguments}

## Step 1 — Confirm the target directory is empty

If the target directory already contains an `angular.json`, a `package.json`, or `.git/`, stop and
ask before going further — this skill creates a genuinely new workspace, not a retrofit.

## Step 2 — Create the project structure

Ask the two choices `ng new` cannot default safely: SSR (yes/no) and package manager (npm, pnpm,
yarn, bun; default npm). Then run, without prompts:

```bash
npx @angular/cli@latest new <app-name> --routing --strict --style=scss \
  --ssr=<true|false> --package-manager=<pm>
cd <app-name>
```

Components are standalone by default — never pass `--standalone=false` or add an `NgModule`. Lay
out `src/app/` per `ng-project-layout` (`core/`, `shared/`, `features/`), empty to start.

## Step 3 — Configure tooling

### Lint

```bash
npx ng add @angular-eslint/schematics --skip-confirmation
```

This adds the `lint` target to `angular.json` and an `eslint.config.js` flat config.

### Test runner

Keep the runner the current CLI generated — do not swap it. Read the `test` target in
`angular.json`: recent Angular CLI versions generate Vitest (`@angular/build:unit-test`); older
ones generate Karma + Jasmine. Record which one it is for the report.

### Strictness

Confirm `tsconfig.json` has `"strict": true` and `angularCompilerOptions` has
`strictTemplates`, `strictInjectionParameters`, and `strictInputAccessModifiers` set to `true`.

## Step 4 — Write a starter test and README

Keep the generated `app.spec.ts` if it passes; otherwise replace it with a smoke test that the
root component creates:

```ts
// src/app/app.spec.ts — smoke test confirming the root component renders; replace once real features exist
import { TestBed } from "@angular/core/testing";
import { App } from "./app";

describe("App", () => {
  it("creates the root component", async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
```

Match the class name and file the CLI generated (`App` in `app.ts`, or `AppComponent` in
`app.component.ts` on older versions). Confirm `.gitignore` matches `ng-git`, and replace the
generated `README.md` with: app name, one-sentence description, dev-server command (`ng serve`),
and how to lint and test.

## Step 5 — Verify

```bash
npx ng lint
npx ng build
npx ng test --watch=false
```

## Step 6 — Report

```
## New Project Report

App: <app-name>
Stack: Angular <version>, standalone, routing, strict, SSR <on|off>, <package-manager>

### Created
- Workspace via ng new; src/app/ core/, shared/, features/
- angular-eslint (lint target, eslint.config.js)
- Test runner: <Vitest|Karma + Jasmine> (CLI default)
- src/app/app.spec.ts (starter smoke test), README.md

### Verification
✅ lint, build, and tests all pass on the new workspace
```
