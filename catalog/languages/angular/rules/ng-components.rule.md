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

## Components

- Every component sets `changeDetection: ChangeDetectionStrategy.OnPush`; replace an input object or array, never
  mutate it in place.
- A presentational component takes inputs and emits outputs and injects no data service; containers fetch and hold
  state.
- Inputs and outputs follow the project's existing style: signal `input()`, `input.required()`, `output()` and
  `model()`, or `@Input()` / `@Output()`. Never both in one file.
- The constructor only wires dependencies: no input reads, no DOM access. Inputs are read in `computed`,
  `ngOnInit` or `ngOnChanges`; view and content queries from `ngAfterViewInit` / `ngAfterContentInit`. `ngDoCheck`
  stays empty.
- Every manual subscription is torn down: prefer the `async` pipe or `toSignal()`, else `takeUntilDestroyed()`.
- Set classes, styles and attributes through `host` metadata or `Renderer2`, not `nativeElement`; guard any direct
  DOM access for the browser platform.
