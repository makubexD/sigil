---
name: ng-add-project
description: "Add an application or library to an existing Angular workspace with its standards pre-wired — newProjectRoot, prefix, standalone, test runner, tsconfig path mapping — then build and test it (Angular)"
when_to_use: "Run via `/ng-add-project <name>` when an Angular workspace (an `angular.json`) already exists and needs another project in it — e.g. \"add a shared-ui library to the workspace\", \"generate an admin application next to the main app\". Pass the project name and optional `--type`. Requires an existing workspace; to create a brand-new workspace in an empty directory use ng-new-project instead. Never overwrites existing files; confirms before editing workspace config."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<name> [--type=app|lib]"
---

# Add Project

**Project name + type:** $ARGUMENTS

Parse `$ARGUMENTS`: first token → `<name>` (kebab-case, e.g. `shared-ui`, `admin`);
`--type=<app|lib>` (default: `lib`).

## Step 1 — Discover repo standards

Confirm `angular.json` exists at the workspace root. If it does not, **stop** — this skill adds to
an existing workspace; creating one is a different task.

Read: `angular.json` (`newProjectRoot`, each project's `prefix`, `schematics` defaults such as
`standalone`, `style`, `changeDetection`, and the `test` builder in use — Karma, Jest, Vitest, or
Web Test Runner); root `package.json` (Angular version, scripts, which test runner is actually a
`devDependency`); `tsconfig.json` (`compilerOptions.paths`, strictness flags); `eslint.config.*`;
`CLAUDE.md` for documented layering and naming; and one existing project of the
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
