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

## Templates

- Control flow follows the project's existing style: `@if` / `@for` / `@switch`, or `*ngIf` / `*ngFor`.
- `@for` tracks a stable id (`track item.id`), not the index or the object; `*ngFor` over a non-trivial list has a
  `trackBy`.
- Read a stream with one `| async as value` and reuse `value`; don't pipe the same stream twice, and don't
  subscribe in the class to copy into a field.
- No method call that does work in a binding (`{{ computeTotal() }}`) and no object or array literal
  (`[style]="{ color: c }"`): use a `computed`, a field or a pure pipe.
- Semantic elements before ARIA: a `<button>`, not a clickable `<div>`. Every form control has a label or
  `aria-label`, every image an `alt`, every icon-only button an accessible name.
- Interactive elements work from the keyboard with visible focus; dialogs use the CDK (`cdkTrapFocus`,
  `LiveAnnouncer`), not hand-rolled focus code.
