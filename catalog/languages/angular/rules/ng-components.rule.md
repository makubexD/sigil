---
id: angular/ng-components
kind: rule
title: Components (Angular)
description: Angular component & directive design — OnPush, smart/presentational, inputs/outputs, lifecycle, teardown
language: angular
appliesTo:
  - "**/*.component.ts"
  - "**/*.directive.ts"
tags:
  - angular
  - components
appliesToRationale: Scoped to component and directive files specifically because change-detection, lifecycle, and OnPush concerns are unique to those two building blocks and do not apply to services, pipes, or other TypeScript files.
---

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
