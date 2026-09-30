---
id: angular/ng-generate-tests
kind: skill
title: "Generate Tests (Angular)"
description: "Generate a Vitest + TestBed suite for a file or component following the project's documented test conventions"
name: ng-generate-tests
language: angular
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[file-or-component] (optional)"
uses:
  rules:
    - angular/ng-testing
  agents:
    - angular/ng-code-reviewer
tags:
  - angular
  - generate
  - tests
whenToUse: Use when a source file lacks a spec or when new public members have been added without corresponding test coverage. Pass the target file path as the argument; omit to scan for untested files and choose interactively.
---

# Generate Tests

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or component path.

**If `$ARGUMENTS` is empty:**
1. Discover source files that lack a corresponding `*.spec.ts` (using the mirroring logic in Step 2).
2. List the top candidates with a one-line description of each, and ask the user to choose before proceeding.

## Step 2 — Discover layout and era

Inspect the repo — do **not** assume a fixed structure:
- Angular specs are conventionally **co-located** with their source (`foo.component.ts` → `foo.component.spec.ts`). Confirm by reading 2–3 existing specs; if the project instead mirrors into a `tests/` tree, follow that.
- Detect the test runner: `package.json` scripts, `vitest.config.*`, `angular.json` (`test` target), `karma.conf.js`, `jest.config.*`. This template targets **Vitest**; if the project uses Karma/Jest, follow the in-use runner's API while keeping the same TestBed structure.
- **Detect the era/reactivity style** (standalone+signals vs NgModule classic; signals vs RxJS) so the spec uses the matching setup — a standalone component is imported directly into `TestBed`; an NgModule-declared one needs its module.

## Step 3 — Read the target

Read the target file fully. Identify:
- Public classes, methods, components, pipes, directives, services — the primary test subjects.
- Component `@Input`/`@Output`/signal `input()`/`output()`/`model()` — the contract to exercise.
- External dependencies (HTTP, router, browser APIs, time, external services) — these are mock boundaries.
- Complex branching, documented invariants, edge cases, and error paths.

## Step 4 — Write tests

Follow the project's documented test conventions. Discover them from `CLAUDE.md`, `.claude/` rules (if present), `vitest.config.*`, or by reading existing specs. Apply these principles consistently:

- **One behaviour per test.** Each `it` has a single, named reason to fail.
- **AAA pattern.** Arrange (`TestBed.configureTestingModule`, build data), Act (call the method or `fixture.detectChanges()`), Assert. Mark each section with an inline `// Arrange` / `// Act` / `// Assert` comment even if one line.
- **Descriptive names.** `describe('Unit', …)` + `it('does X when Y', …)`.
- **it.each.** Use `it.each` for the same logic over multiple inputs; give each row context. Never single-row.
- **Mock only I/O boundaries.** Test pure logic, pipes, and computed signals directly. Mock `HttpClient` via `provideHttpClientTesting` + `HttpTestingController`; stub services with a plain object or `vi.fn()`/`vi.spyOn()`. Do not mock internal collaborators.
- **TestBed + ComponentFixture.** Import a standalone component directly; for classic components import the declaring module. Query the DOM via `data-test`/roles, not brittle CSS.
- **Time & async.** `vi.useFakeTimers()` / `fakeAsync` + `tick`/`flush`; read signals after their triggering `set`/`update`; assert observables with `firstValueFrom` or marbles. Never real timers.
- **Extract constants.** Test data goes to module-level constants or builder helpers — no unnamed inline literals.
- **Coverage target.** Happy path + edge cases (empty, `null`/`undefined`, zero, boundary) + error paths + critical outputs/emissions verified. `httpMock.verify()` in `afterEach` when using `HttpTestingController`.

## Step 5 — Run and report

Discover the project's test command:
- Check `package.json` scripts for `test`; fallback `vitest run <spec-path>` (or `ng test --watch=false --include <spec>`).

Run it. If it fails, diagnose and fix before finishing. Report:

```
Generated: <spec-path>
Tests written: <N>
Detected style: <standalone+signals / NgModule classic>
Result: ✅ <N> passed  /  ❌ <N> failed
Coverage: <output if available>
```
