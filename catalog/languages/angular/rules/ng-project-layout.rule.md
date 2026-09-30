---
id: angular/ng-project-layout
kind: rule
title: Project Layout (Angular)
description: Angular workspace & project structure, angular.json build targets, standalone-first feature folders, environment and path-alias configuration
language: angular
appliesTo:
  - "angular.json"
  - "**/tsconfig*.json"
  - "**/*.workspace.json"
  - "**/environment*.ts"
tags:
  - angular
  - project
  - layout
appliesToRationale: Scoped to angular.json, tsconfig, workspace, and environment files because workspace/project structure and the build-target control plane are configured there, not in component/service source — those are covered by ng-components/ng-templates.
---

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
