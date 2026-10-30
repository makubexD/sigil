---
name: ng-sync-tests
description: "Sync an Angular spec suite with source code — add missing specs, update stale ones, and remove orphaned specs (with confirmation before deletion)"
when_to_use: "Run via `/ng-sync-tests` after multiple source files have changed and the spec suite has drifted — e.g. \"sync my tests\", \"find missing and orphaned specs\". Default scope targets only files changed in the working tree; pass `--scope=all` for a full-project audit. Complements ng-generate-tests, which targets one file at a time."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[--scope=changed|all] (default: changed)"
---

# Sync Tests

**Scope:** $ARGUMENTS (defaults to `changed` if empty)

## Step 1 — Determine scope

**`changed` (default):** Modified, added, or renamed source files in the current git working tree.

```bash
git status --porcelain
git diff --name-only HEAD
```

Use the Grep and Glob tools to process the results — avoid shell pipelines with `awk`/`xargs` for cross-platform reliability.

Exclude: deleted source files (handle separately in Step 4), existing `*.spec.ts` files, cache directories (`node_modules`, `dist`, `.angular`, `coverage`), lock files, and generated files.

**`all`:** All source files in the project.

Use Glob with `**/*.ts` (excluding `**/*.spec.ts`), excluding test/cache/generated directories.

## Step 2 — Discover the runner and layout

Inspect the repo — do **not** assume a fixed structure:
- Confirm the spec convention by reading 2–3 existing specs — Angular co-locates `foo.ts` → `foo.spec.ts`; some projects mirror into `tests/`. Apply the in-use pattern consistently.
- Detect the test runner (`package.json` scripts, `vitest.config.*`, `angular.json`, `karma.conf.js`, `jest.config.*`).
- Detect the era/reactivity style so generated specs match (standalone+signals vs NgModule classic; signals vs RxJS).

## Step 3 — Add and update tests

For each in-scope source file:

1. Derive the expected spec path using the co-location/mirroring convention.
2. **Spec does not exist:** create it. Follow the project's documented conventions — discover from `CLAUDE.md`, any rules files present, config, or existing specs. Apply the same principles as single-file generation:
   - AAA pattern, one behaviour per test, descriptive `describe`/`it` names.
   - TestBed + ComponentFixture; mock only I/O boundaries (`provideHttpClientTesting`, service stubs).
   - `it.each` over multiple inputs; fake timers / `fakeAsync` for time; signal/observable assertions.
   - Extract test data to constants/builders; cover happy path + edge + error paths.
3. **Spec exists:** read it alongside the source. Identify public members (methods, inputs, outputs) that lack tests. Add the missing tests following the same principles. Flag stale tests (whose source counterpart no longer exists) in the report — do not remove them here.

## Step 4 — Detect orphaned tests

Orphaned specs are spec files (or `describe`/`it` blocks within them) whose source counterpart was deleted or renamed:

```bash
git status --porcelain   # lines starting with D or R indicate deleted/renamed sources
```

Map each deleted/renamed source file to its expected spec path. If the spec exists, mark it as an orphan candidate.

Report them — **make no deletions yet.**

## Step 5 — Confirm before any deletion (guardrail)

If orphan candidates were found, present them clearly:

```
Orphaned specs detected:
  - src/app/old-widget/old-widget.component.spec.ts   (source deleted: old-widget.component.ts)
  - describe('RemovedService')                         in user.service.spec.ts  (class deleted)
  - it('formats legacy date')                          in date.pipe.spec.ts     (method removed)

These will be permanently deleted. Proceed? [y/N]
```

**Stop and wait for explicit confirmation.** Only after receiving "y" or "yes" should you proceed with deletions. If the user says no, declines, or does not respond, skip all deletions and record "orphans not removed — user declined" in the final report.

## Step 6 — Run and report

Discover the project's test command (check `package.json` scripts; fallback `vitest run` or `ng test --watch=false`). Run it. If a test fails after the sync, decide whether the test or the code is wrong: never weaken an assertion to make it pass; report a suspected bug instead.

```
## Sync Tests Report
  Scope:           <changed | all>
  Files analyzed:  <N>
  Tests created:   <N>
  Tests updated:   <N>
  Orphans removed: <N>  (or "none" / "skipped — user declined")

Suite: ✅ <N> passed  /  ❌ <N> failed
Coverage delta: <+/-N%>  (if reported by runner)
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
