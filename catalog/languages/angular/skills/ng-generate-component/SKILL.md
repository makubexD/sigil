---
id: angular/ng-generate-component
kind: skill
title: "Generate Component (Angular)"
description: "Scaffold a component, directive, service, pipe, or guard plus its spec, following the project's discovered era and conventions"
name: ng-generate-component
language: angular
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "<name> [--type=component|directive|service|pipe|guard]"
uses:
  rules:
    - angular/ng-components
    - angular/ng-templates
  agents:
    - angular/ng-architecture-reviewer
tags:
  - angular
  - generate
  - component
---

## When to Use

Use to add a new building block to an Angular project. Pass the name and optionally a --type (defaults to component). Discovers the project's selector prefix, era, and test layout, prefers the Angular CLI when present, and never overwrites existing files.

---

# Generate Component

**Target:** $ARGUMENTS  (name, optional `--type=`; defaults to `component`)

## Step 1 — Parse arguments and discover conventions

Parse the `<name>` and `--type` (one of `component` | `directive` | `service` | `pipe` | `guard`; default `component`).

Discover the project's conventions before generating — do **not** assume:
- **Selector prefix** from `angular.json` (`projects.*.prefix`, e.g. `app`).
- **Era / reactivity style**: standalone+signals (`bootstrapApplication`, `standalone: true`, `inject()`, `@if`/`@for`, `signal(`) vs NgModule classic (`@NgModule`, constructor DI, `*ngIf`/`*ngFor`). Match what the project uses.
- **Template/style layout**: inline vs separate `.html`/`.css|scss` files (inspect neighbouring components and `angular.json` schematics defaults).
- **Test layout**: co-located `*.spec.ts` (Angular default) vs a `tests/` mirror; the test runner (Vitest / Karma / Jest).
- **Change-detection default**: confirm OnPush is the house style (it should be — see `ng-components`).

## Step 2 — Resolve target path and check for collisions

Derive the file path(s) from the name using the project's kebab-case convention
(`user-profile` → `user-profile.component.ts` + `.html`/`.scss` + `.spec.ts`).

**Never overwrite.** If any target file already exists, stop and report the collision — ask the user how to proceed.

## Step 3 — Generate

**Prefer the Angular CLI when present** (`ng` resolvable / `@angular/cli` in `devDependencies`):

```bash
ng generate <type> <name> --dry-run   # preview first
```

Inspect the dry-run output, confirm it matches the discovered conventions (prefix, standalone flag,
change detection), then run it for real. **Review the generated files** — the CLI's defaults may not
match every house convention (e.g. add `changeDetection: OnPush` if the schematic omits it).

**If the CLI is not available**, hand-write the files following the discovered conventions:

### Standalone + signals (default for Angular 17+)
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-profile.component.html',
})
export class UserProfileComponent {
  readonly userId = input.required<string>();
  readonly saved = output<void>();
}
```

### NgModule (classic) — when the project uses it
```ts
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-user-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-profile.component.html',
})
export class UserProfileComponent {
  @Input({ required: true }) userId!: string;
  @Output() saved = new EventEmitter<void>();
}
```
Declare it in the appropriate `@NgModule` (and export it if shared).

For `service` use `@Injectable({ providedIn: 'root' })` (or a feature scope); for `pipe` a pure
`@Pipe`; for `guard` a functional `CanActivateFn` in the standalone era, or a class guard in classic.

Always generate a matching **spec** (Vitest + TestBed, AAA) per `ng-testing` and the `ng-generate-tests` conventions.

## Step 4 — Confirm, gate, and report

- **Confirm before creating** if you hand-wrote files (show the planned file list).
- Run the project's gate on the new files: `ng lint` (angular-eslint) + `tsc --noEmit` + the spec via
  `vitest run <spec>` (or `ng test`). Optional formatter (`prettier --check`) only if configured.

```
Generate Component Report
  Type:            <component | directive | service | pipe | guard>
  Detected style:  <standalone+signals / NgModule classic>
  Files created:   <list>
  Generator:       <ng generate / hand-written>
  Gate:            ✅ lint  ✅ types  ✅ spec  /  ❌ <which failed>
```
