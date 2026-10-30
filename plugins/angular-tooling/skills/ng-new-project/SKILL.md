---
name: ng-new-project
description: "Create a new Angular workspace in an empty directory with ng new — standalone, routing, strict, SSR choice — plus angular-eslint, the CLI's default test runner, and a starter test (Angular)"
when_to_use: "Use when starting a brand-new Angular workspace in an empty directory. Fires for \"create a new Angular app\", \"ng new a project called X\", or \"set up an Angular workspace from scratch\". Not for adding an application or library to an existing Angular workspace (use ng-add-project there) or for adding a feature to an existing app."
allowed-tools: Read, Write, Bash, Glob
argument-hint: "<app-name>"
---

# New Project

**App name:** $ARGUMENTS

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

---

## Applied Rules

### Project Layout (Angular)

## Workspace Structure

An Angular CLI workspace (`ng new`) has one or more **projects** declared in `angular.json`, each
with its own build/serve/test targets. Prefer a single application project for most repos; reach
for a multi-project workspace (or Nx) only when you genuinely ship more than one deployable
artifact (an app + a component library, or several apps sharing a design-system library):

```
my-workspace/
  angular.json          ← project registry + build/serve/test target config
  tsconfig.json          ← workspace-wide compiler options + path aliases
  tsconfig.app.json       ← app-specific overrides (extends tsconfig.json)
  tsconfig.spec.json      ← test-specific overrides
  projects/               ← only present in a multi-project workspace
    my-lib/
  src/
    app/
    environments/
```

Do not hand-edit generated build-target boilerplate in `angular.json` outside `options`/
`configurations` — use `ng generate`/`ng add` to add a project, builder, or schematic so the
registry stays consistent with what the CLI expects.

## Feature-Based Folders, Not Type-Based

Group files by feature/domain, not by artifact type. A type-based layout (`components/`,
`services/`, `pipes/` at the top level) forces every change to touch three unrelated directories;
a feature-based layout keeps a change to one concern in one place:

```
// Avoid — type-based, a "user profile" change touches 3 scattered directories
src/app/components/user-profile.component.ts
src/app/services/user.service.ts
src/app/pipes/user-display.pipe.ts

// Correct — feature-based, one directory per concern
src/app/features/user-profile/
  user-profile.component.ts
  user.service.ts
  user-display.pipe.ts
```

Reserve a top-level `shared/` (or `core/`) folder for code genuinely reused across ≥ 2 features —
a single-use file belongs inside the feature that uses it, not in `shared/` "just in case."

## Standalone Components — No `NgModule` Registry

New Angular code should be `standalone: true` (the default since Angular 19) — components declare
their own `imports` array instead of being registered in an `NgModule`. This removes the
module-registry indirection entirely; do not introduce a new `NgModule` for new feature code:

```typescript
@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, UserAvatarComponent],
  templateUrl: './user-profile.component.html',
})
export class UserProfileComponent { }
```

If the project still has legacy `NgModule`-declared code, migrate incrementally via `ng generate
@angular/core:standalone` rather than mixing paradigms indefinitely in new work.

## Route-Level Code Splitting with `loadComponent`

Lazy-load feature routes with `loadComponent` (standalone) instead of `loadChildren` +
`NgModule`-per-feature — one file, one dynamic import, no module wrapper:

```typescript
export const routes: Routes = [
  {
    path: 'user-profile',
    loadComponent: () => import('./features/user-profile/user-profile.component').then((m) => m.UserProfileComponent),
  },
];
```

## Path Aliases in `tsconfig.json`

Declare workspace-relative import paths under `compilerOptions.paths` rather than long relative
chains (`../../../shared/models/user`):

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["src/app/shared/*"],
      "@features/*": ["src/app/features/*"]
    }
  }
}
```

Keep the alias set small and stable — an alias per top-level folder, not per file — so it does not
need updating on every move.

## Environment Configuration

Use `angular.json`'s `fileReplacements` (per build configuration) to swap `environment.ts` for
`environment.prod.ts` — never branch on `environment.production` deep inside business logic for
anything beyond feature flags. Never commit real secrets into any `environment*.ts` file; treat it
as build-time configuration only, backed by placeholder values with real values injected at deploy
time.

See `ng-components` for the component/directive-level conventions this layout organizes, and
`ng-signals`/`ng-rxjs` for the reactive-state and stream conventions that live inside each feature
folder.
