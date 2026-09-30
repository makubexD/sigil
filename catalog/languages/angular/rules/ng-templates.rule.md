---
id: angular/ng-templates
kind: rule
title: Templates (Angular)
description: Angular template conventions — control flow with track, async pipe, binding cost, accessibility
language: angular
appliesTo:
  - "**/*.html"
  - "**/*.component.ts"
tags:
  - angular
  - templates
appliesToRationale: Scoped to HTML templates and component files because Angular templates can live externally (.html) or inline in the component decorator, and this rule's control-flow and binding-cost guidance applies to both.
---

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
