---
name: ng-generate-tests
description: "Generate a Vitest + TestBed suite for an Angular file or component, following the project's documented test conventions"
when_to_use: "Run via `/ng-generate-tests [file]` when a source file lacks a spec or a new public member has no test coverage — e.g. \"generate tests for user.service.ts\", \"write a spec for this component\". Omit the argument to scan for untested files and choose interactively. Complements ng-sync-tests, which syncs the whole spec suite rather than one target."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[file-or-component] (optional)"
---

# Generate Tests

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or component path.

**If `$ARGUMENTS` is empty:**
1. Discover source files that lack a corresponding `*.spec.ts` (using the mirroring logic in Step 2).
2. List the top candidates with a one-line description of each, and ask the user to choose before proceeding.

## Step 2 — Discover the runner and layout

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

Follow the project's documented test conventions. Discover them from `CLAUDE.md`, any rules files present, `vitest.config.*`, or by reading existing specs. Apply these principles consistently:

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

Run it. If a new test fails, decide whether the test or the code is wrong: fix a wrong test, but never weaken an assertion to make it pass; report a suspected bug instead. Report:

```
Generated: <spec-path>
Tests written: <N>
Detected style: <standalone+signals / NgModule classic>
Result: ✅ <N> passed  /  ❌ <N> failed
Coverage: <output if available>
```

---

## Applied Rules

### Testing (Angular)

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

Hold the project's configured floor (the test runner's coverage thresholds, or the CI config) — do
not assume a number. Close coverage gaps before merging a new feature. Gaps on thin I/O-boundary code (HTTP wrappers, bootstrap) are acceptable; gaps on pure
domain logic, pipes, and computed signals are not.

## Anti-Patterns
- Real timers / `setTimeout`-based waits in tests — use `vi.useFakeTimers()` or `fakeAsync`/`tick`.
- Test-specific flags or branches in production code.
- Asserting on private internals when a public template/output exercises the same path — unless the
  private function is complex enough to warrant its own unit contract.
- Shallow snapshot abuse — a giant snapshot that nobody reads hides regressions instead of catching them.
- A single-row `it.each` (use a plain `it`).
- Forgetting `httpMock.verify()` in an `afterEach` when using `HttpTestingController`.
