---
id: angular/ng-testing
kind: rule
title: Testing (Angular)
description: Vitest + TestBed conventions — AAA pattern, builder helpers, it.each, coverage
language: angular
appliesTo:
  - "**/*.spec.ts"
tags:
  - angular
  - testing
appliesToRationale: Scoped to spec files because that is the only location Angular tests live in — source and template files have no test-specific conventions of their own.
---

## AAA Pattern
Every test has three sections separated by blank lines:
**Arrange** (build data and configure `TestBed`), **Act** (call the unit under test or trigger
change detection), **Assert** (verify results). Label each section with an inline comment
(`// Arrange`, `// Act`, `// Assert`) for readability, even when the section is one line.

## Naming
Group related tests with `describe('FeatureOrUnit', …)`; name each case
`it('does X when Y', …)` so a failure reads as a sentence. Each test covers exactly one
behaviour. Multiple behaviours under the same condition → multiple `it` blocks, not one long test.

## No Magic Values
All test data is named: module-level or `describe`-level constants, or builder helper functions
(`makeUser`, `utc`) declared at the top of the file. Never use unnamed inline literals (raw dates,
magic strings, unexplained integers) directly in assertions or act calls.

## TestBed and ComponentFixture
Configure the runner-agnostic `TestBed` and drive components through `ComponentFixture`:

```ts
beforeEach(() => {
  // Arrange
  TestBed.configureTestingModule({
    imports: [UserProfileComponent], // standalone component
    providers: [{ provide: UserService, useValue: makeUserServiceStub() }],
  });
});

it('renders the user name when loaded', () => {
  // Arrange
  const fixture = TestBed.createComponent(UserProfileComponent);
  // Act
  fixture.detectChanges();
  // Assert
  const name = fixture.nativeElement.querySelector('[data-test="name"]').textContent;
  expect(name).toContain(EXPECTED_NAME);
});
```

For an NgModule-based component, import its declaring module (or the component under a testing
module) instead of the standalone import. Prefer `data-test` attributes or roles over brittle CSS
selectors when querying the DOM.

## Mock Only I/O Boundaries
Mock HTTP, the router, browser APIs, clocks, and external services — not pure logic or internal
collaborators. Mock `HttpClient` with `provideHttpClientTesting` and `HttpTestingController`; stub
services with a plain object or `vi.fn()`. Use `vi.fn()` / `vi.spyOn()` at those boundaries only.
Test pure functions, pipes, and signal/computed logic through their real implementations.

## it.each, Never Single-Case
Use `it.each` for the same behaviour over multiple inputs; never a single-case table — use a plain
`it` instead. Give each row enough context that a failure is self-describing.

```ts
it.each([
  [15, '15m'],
  [60, '1h'],
  [75, '1h 15m'],
])('formats %i minutes as %s', (minutes, expected) => {
  // Arrange / Act
  const result = formatDuration(minutes);
  // Assert
  expect(result).toBe(expected);
});
```

## Time, Async, and Reactivity
Never assert against the real `new Date()` / `Date.now()`. Freeze time with
`vi.useFakeTimers()` (and `vi.setSystemTime(...)`), or inject a clock you control. For Angular
async, prefer `fakeAsync` + `tick()` / `flush()` to drive timers and microtasks deterministically.

- **Signals:** read a `signal`/`computed` after the triggering `set`/`update` (run within
  `TestBed.runInInjectionContext` or a fixture so the reactive context exists); assert the derived value.
- **Observables:** assert with `firstValueFrom(obs$)` for a single emission, or a marble test for
  sequences. Never leave a live subscription open across tests.

A test that passes today but fails tomorrow because of real time or a leaked timer is a broken test.

## Coverage
Discover and run the project's coverage command:
- Check `package.json` scripts for `test` / `test:coverage`; check `vitest.config.*`,
  `angular.json` (`test` target), `karma.conf.js`, `jest.config.*`.
- Fallback: `vitest run --coverage` (v8 provider) or `ng test --watch=false --code-coverage`.

Hold a minimum of **70% line coverage** across the source. Close coverage gaps before merging a new
feature. Gaps on thin I/O-boundary code (HTTP wrappers, bootstrap) are acceptable; gaps on pure
domain logic, pipes, and computed signals are not.

## Anti-Patterns
- Real timers / `setTimeout`-based waits in tests — use `vi.useFakeTimers()` or `fakeAsync`/`tick`.
- Test-specific flags or branches in production code.
- Asserting on private internals when a public template/output exercises the same path — unless the
  private function is complex enough to warrant its own unit contract.
- Shallow snapshot abuse — a giant snapshot that nobody reads hides regressions instead of catching them.
- A single-row `it.each` (use a plain `it`).
- Forgetting `httpMock.verify()` in an `afterEach` when using `HttpTestingController`.
