---
name: ng-generate-component
description: "Scaffold an Angular component, directive, service, pipe, or guard plus its spec, following the project's discovered era and conventions"
when_to_use: "Run via `/ng-generate-component <name>` when scaffolding a new component, directive, service, pipe, or guard — e.g. \"generate a UserProfile component\", \"scaffold a new auth guard\". Discovers the project's selector prefix, era (standalone vs NgModule), and test layout; prefers the Angular CLI when present and never overwrites existing files."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<name> [--type=component|directive|service|pipe|guard]"
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

---

## Applied Rules

### Components (Angular)

## Change Detection: OnPush by Default
Set `changeDetection: ChangeDetectionStrategy.OnPush` on every component. OnPush re-renders only
when an input reference changes, an event fires, an observable bound with `async` emits, or a signal
read in the template changes — far less work than the default. The contract OnPush depends on is
**immutability**: never mutate an `@Input` object/array in place; replace it with a new reference.

```ts
@Component({
  selector: 'app-user-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* … */
})
export class UserCardComponent { /* … */ }
```

## Smart vs Presentational Split
Separate **container (smart)** components — which inject services, fetch data, and hold state —
from **presentational (dumb)** components — which receive data through inputs and emit events
through outputs, with no service dependencies. This keeps presentational components trivially
testable and reusable, and concentrates I/O in a thin container layer. A presentational component
that injects a data service is mixing two responsibilities (see `ng-code-quality` layering).

## Inputs and Outputs
> **Discovery rule:** detect the project's style first. Use **signal `input()`/`output()`/`model()`**
> if the codebase already uses them (or uses signals broadly); use **decorator `@Input()`/`@Output()`**
> if the project is on the classic style. Match the surrounding components; don't introduce a second
> style in one file.

### Standalone + signals (Angular 17.1+)
```ts
export class RatingComponent {
  readonly value = input.required<number>();          // required signal input
  readonly max = input(5);                             // optional, with default
  readonly valueChange = output<number>();            // typed event
  readonly selected = model<number>();                // two-way bindable [(selected)]
}
```
Read inputs reactively (`computed(() => this.value() * 2)`); never reach into them in the constructor —
their value is not yet set there.

### NgModule / classic
```ts
export class RatingComponent {
  @Input({ required: true }) value!: number;
  @Input() max = 5;
  @Output() valueChange = new EventEmitter<number>();
}
```
React to input changes in `ngOnChanges` (or a setter), not the constructor.

Document every input/output contract (range, units, default, required) per `ng-documentation`.

## Lifecycle Discipline
- **Constructor** wires dependencies only — no DOM access, no input reads, no heavy work.
- **`ngOnInit`** is for initialisation that needs resolved inputs.
- **`ngOnChanges`** reacts to input changes (classic); prefer `computed`/`effect` with signal inputs.
- **`@ViewChild`/`@ContentChild`** (or signal `viewChild()`/`contentChild()`) results are available
  from `ngAfterViewInit`/`ngAfterContentInit` — not earlier.
- Keep `ngDoCheck` empty unless absolutely necessary; it runs on every change-detection cycle.

## Subscription Teardown
Every manual subscription must be torn down, or it leaks the component after destruction:
- Prefer the `async` pipe (auto-unsubscribes) or `toSignal(...)` over manual `subscribe`.
- When you must subscribe in TS, use `takeUntilDestroyed()` (inject `DestroyRef` when subscribing
  outside an injection context), or unsubscribe in `ngOnDestroy`.

```ts
private readonly destroyRef = inject(DestroyRef);

ngOnInit(): void {
  this.search$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(results => this.update(results));
}
```

See `ng-rxjs` for stream composition and `ng-signals` for the reactive-state model.

## Host Bindings over Manual DOM
Use `host` metadata, `@HostBinding`/`@HostListener`, and `Renderer2` (or signal-driven bindings)
rather than reaching into `nativeElement` to set classes, styles, or attributes. Direct DOM mutation
breaks platform-server/SSR rendering and OnPush assumptions, and bypasses sanitization. If you must
touch the DOM, do it through the renderer and guard for the browser platform.

See `ng-templates` for template-level control flow, binding cost, and accessibility.

### Templates (Angular)

## Control Flow
> **Discovery rule:** detect which control flow the project uses. **Built-in `@if`/`@for`/`@switch`**
> if the templates already use them (Angular 17+); **structural directives `*ngIf`/`*ngFor`/
> `[ngSwitch]`** if the project is classic. Match the surrounding templates.

### Built-in control flow (Angular 17+)
```html
@if (user(); as u) {
  <app-user-card [user]="u" />
} @else {
  <app-spinner />
}

@for (item of items(); track item.id) {
  <li>{{ item.name }}</li>
} @empty {
  <li>No items</li>
}
```
`@for` **requires** a `track` expression — track by a stable identity (an id), not by index or the
object reference, so Angular reuses DOM nodes instead of recreating the list on every change.

### Structural directives (classic)
```html
<app-user-card *ngIf="user$ | async as u; else spinner" [user]="u"></app-user-card>
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>
```
Always provide a `trackBy` function for `*ngFor` over non-trivial lists, for the same reuse reason.

## Subscribe in the Template, Not the Class
Prefer the **`async` pipe** over a manual `subscribe` + field assignment — it subscribes, renders,
and unsubscribes automatically, and it cooperates with OnPush. Bind a single `… | async as value`
and reuse `value` rather than piping the same stream multiple times (which creates multiple
subscriptions); multicast upstream with `shareReplay` if several bindings need it (see `ng-rxjs`).

## Keep Logic and Cost Out of Bindings
A template binding is re-evaluated on every change-detection pass, so expensive or impure expressions
there are a recurring cost (see `ng-performance-profiler`):
- **No method calls that do real work** in bindings (`{{ computeTotal() }}`) — move the value to a
  `computed` signal or a field updated on input change.
- **No new object/array literals** in bindings (`[style]="{ color: c }"`, `[data]="[a, b]"`) — they
  produce a fresh reference each pass and defeat OnPush on the child. Hoist them to a field/computed.
- Keep conditional and formatting logic in the component (`computed`/getter/pure pipe), not inline in
  the template.
- Prefer **pure pipes** over method calls for formatting — they are memoised on their inputs.

## Accessibility
Templates are the accessibility surface — build them so assistive technology works:
- Use **semantic HTML** (`<button>`, `<nav>`, `<main>`, `<label>`, headings) before reaching for ARIA.
  A clickable `<div>` is not a button.
- **Associate labels** with controls (`<label for>` / `aria-label`); every form field has an accessible name.
- Add **ARIA only when semantics are insufficient**, and keep `aria-*` state in sync with the view.
- Ensure **keyboard operability and visible focus** — interactive elements are reachable and operable
  by keyboard, focus order is logical, and focus is managed on route/dialog changes.
- Provide **text alternatives**: meaningful `alt` on images, accessible names on icon-only buttons.
- Use Angular CDK a11y utilities (`FocusTrap`, `LiveAnnouncer`, `cdkTrapFocus`) for dialogs and
  dynamic announcements rather than hand-rolled focus code.

See `ng-components` for the class-side contract behind the template and `ng-performance-profiler`
for measuring change-detection cost.
