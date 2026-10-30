---
name: ts-sync-tests
description: "Sync the test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion) (TypeScript)"
when_to_use: "Use after multiple source files have changed and the test suite has drifted — missing tests for new exports, stale tests for renamed symbols, orphaned tests for deleted files. Also fires for \"sync the tests\", \"clean up orphaned tests\", or \"make sure tests match the current source\". Not for a single untested file with no drift to reconcile (see ts-generate-tests for that — it's cheaper for the one-file case)."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[--scope=changed|all] (default: changed)"
---

# Sync Tests

**Scope:** $ARGUMENTS (default: `--scope=changed`)

## Step 1 — Determine scope

Parse `$ARGUMENTS` for `--scope=changed` (default) or `--scope=all`.

**`changed`:** `git status --porcelain` / `git diff --name-only HEAD` for modified files. Exclude
deleted source files (handled in Step 4), existing test files, lock/generated/config files.

**`all`:** use Glob to enumerate every source file (`**/*.ts`, `**/*.tsx`) excluding test files
(`*.test.*`, `*.spec.*`), `node_modules/`, `dist/`, `build/`, and generated files.

## Step 2 — Discover the runner and layout

Never assume a runner — read `package.json` `scripts.test`/`devDependencies` for which of
`vitest`/`jest`/`node:test`/etc. is actually used. Read 2–3 existing test files to confirm the
mirroring pattern and import style; apply both consistently to every file in scope.

## Step 3 — Add and update tests

For each source file in scope:
1. Derive the expected test file path from the discovered mirroring pattern.
2. **If the test file is missing:** create it following `ts-testing` (loaded natively for
   `**/*.test.ts` — AAA structure, naming, mocking discipline).
3. **If the test file exists:** read both files side-by-side. Add tests for any exported symbol
   that has no corresponding test case. **Do not remove** existing tests — flag stale ones in the
   report instead; let a human decide whether to delete or update.

## Step 4 — Detect orphaned tests

Orphaned tests are test files whose source counterpart no longer exists. `git status --porcelain`
lines starting with `D` (deleted) or `R` (renamed) indicate source files that may have left
orphaned test files behind. Map each to its expected test path and flag existing matches as
candidates. **Report only — make no deletions here.**

## Step 5 — Confirm before any deletion (guardrail)

If orphaned test files were found, present the list before touching any file:

```
The following test files appear to be orphaned (their source file was deleted or renamed):

  test/calendar/oldParser.test.ts   (source: src/calendar/oldParser.ts — deleted)
  test/reporting/legacyReport.test.ts   (source: src/reporting/legacyReport.ts — renamed to devReport.ts)

Proceed with deletion? [y/N]
```

**Stop and wait for explicit confirmation.** Only proceed on `y` or `yes`. If the user declines or
does not respond, skip all deletions and record "orphans not removed — user declined" in the report.

## Step 6 — Run and report

Run the test command discovered in Step 2 (the project's own `package.json` script, not a
hardcoded runner invocation). If a test fails after the sync, decide whether the test or the code is wrong: never weaken an assertion to make it pass; report a suspected bug instead.

```
## Sync Tests Report

Scope: <changed / all>
Files analyzed: <N>
Tests created: <N files / M tests>
Tests updated: <N tests>
Orphans removed: <N>  /  Orphans not removed — user declined

Suite: ✅ <N passed>  /  ❌ <N failed — detail>
Coverage delta: <+X% / -X% / unchanged>
```

---

## Applied Rules

### Testing (TypeScript)

> Example shown with Vitest syntax (`vi.fn`, `vi.mock`, `it.each`) — the structural conventions
> below (AAA, naming, fixture discipline, mock-only-at-boundaries) apply regardless of runner;
> translate the syntax to whatever the project's `package.json` actually uses (`node:test`, Jest,
> etc.) — never assume Vitest specifically.

## AAA Pattern

Structure every test as Arrange / Act / Assert with a blank line separating each phase and an
inline comment labeling each:

```typescript
it("should return formatted duration when given whole hours", () => {
  // Arrange
  const minutes = 120;

  // Act
  const result = formatDuration(minutes);

  // Assert
  expect(result).toBe("2h 00m");
});
```

One behavior per test. If a test requires more than one non-trivial assertion, it is likely covering
multiple behaviors — split it.

## Naming

Use `describe` to group tests by subject under test, and `it`/`test` with a description that reads
as a sentence: **`should <behavior> when <condition>`**.

```typescript
describe("formatDuration", () => {
  it("should include minutes when duration is not a whole hour", () => { … });
  it("should omit minutes when duration is exactly an hour", () => { … });
  it("should return zero when given zero minutes", () => { … });
});
```

One `describe` block per subject under test. Keep test files focused: one source module → one test
file.

## No Magic Values

Extract test data to named module-level constants or builder helpers at the top of the file. Name
them to communicate intent, not just structure:

```typescript
const PARIS_TZ = "Europe/Paris";
const FULL_DAY_MINUTES = 480;

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id: "evt-1", start: utc("2026-06-01T09:00Z"), end: utc("2026-06-01T10:00Z"), ...overrides };
}

function utc(iso: string): Date {
  return new Date(iso);
}
```

No inline literal objects in assertions. A reader should understand what a value represents without
tracing back to where it was defined.

## Mock Only I/O Boundaries

Mock at the boundary where your code touches something external: filesystem, network calls, clocks,
environment variables, external services. Test pure logic and data transformations without any mocking.

```typescript
// Correct — mock only the I/O boundary
vi.mock("./githubClient.js", () => ({
  fetchPullRequests: vi.fn().mockResolvedValue([makePr()]),
}));

// Avoid — mocking internal pure helpers defeats the test
vi.mock("./formatDuration.js");
```

Use Vitest's built-in `vi.fn()` / `vi.spyOn()` / `vi.mock()` — do not add a separate mocking
library. Pass mock implementations through constructor injection when the subject has dependencies;
reach for `vi.mock` only for module-level singletons that cannot be injected.

## Fixtures and Setup

Use `beforeEach` to reset shared state and construct fresh instances. Never share mutable state
between test cases inside a `describe` block.

```typescript
describe("CalendarNormalizer", () => {
  let normalizer: CalendarNormalizer;

  beforeEach(() => {
    normalizer = new CalendarNormalizer(DEFAULT_CONFIG);
  });

  it("should …", () => { … });
});
```

For expensive, read-only shared resources (large parsed fixtures, a real DB schema), use
`test.extend` or Vitest's `beforeAll` scoped to that `describe` block. Never put mutable state
in `beforeAll`.

## Parametrize with `it.each`

Use `it.each` / `test.each` when the same behavior needs verification over multiple inputs. Never
use a single-case `it.each` — write a plain `it` instead. Provide readable labels:

```typescript
it.each([
  [60,   "1h 00m"],
  [90,   "1h 30m"],
  [0,    "0h 00m"],
  [1440, "24h 00m"],
])("should format %i minutes as %s", (minutes, expected) => {
  expect(formatDuration(minutes)).toBe(expected);
});
```

## Time and Dates

Never assert against real `Date.now()` or `new Date()`. Inject a deterministic clock or use
`vi.useFakeTimers()` / `vi.setSystemTime()`:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
```

## Coverage

Discover the project's coverage command first: check `package.json` scripts for a `coverage`,
`test:coverage`, or `check` task. Only if none exists, fall back to the discovered runner's own
coverage flag (e.g. `vitest run --coverage`, `jest --coverage`, or Node's built-in
`node --test --experimental-test-coverage`) — never assume a specific runner.

Hold the project's configured floor (Vitest `coverage.thresholds`, Jest `coverageThreshold`, or
the CI config) — do not assume a number. Gaps on I/O-boundary adapters (network
clients, filesystem wrappers) are acceptable when those boundaries are mocked in tests; gaps on
pure domain logic are not.

## Anti-Patterns

- `setTimeout` / real waits in tests — use fake timers.
- Test-specific flags or branches in production code (`if (process.env.NODE_ENV === "test") { … }`).
- Asserting on private class members when the public API observably covers the behavior.
- Single-case `it.each` — write a plain `it`.
- Asserting on snapshot strings for logic that changes frequently — prefer targeted property assertions.
- `vi.mock` hoisting surprises — place `vi.mock` calls at the top of the file or use `vi.doMock`
  for dynamic mocks inside tests.
