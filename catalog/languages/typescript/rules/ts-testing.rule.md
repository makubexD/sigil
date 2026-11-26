---
id: typescript/ts-testing
kind: rule
title: Testing (TypeScript)
description: "Test conventions — runner discovery, naming, builders, mocking boundaries, fake timers, coverage floor (TypeScript)"
language: typescript
appliesTo:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*.test.tsx"
  - "**/*.spec.tsx"
tags:
  - typescript
  - testing
appliesToRationale: Scoped to test files only (both .test. and .spec. naming, both .ts and .tsx) — testing conventions like AAA and mocking do not apply to non-test source.
---

## Testing

- Use the runner `package.json` already uses (Vitest, Jest, `node:test`); never assume one. The API names below are
  Vitest's.
- One test file per source module and one `describe` per subject. Test names read
  `should <behavior> when <condition>`; one behavior per test, arrange-act-assert.
- Test data comes from named constants or a builder (`makeEvent(overrides)`), not repeated inline literals.
- Mock only I/O boundaries (filesystem, network, clock, environment), never a pure helper or the unit under test.
  Inject the mock; `vi.mock` only for a module that can't be injected, at the top of the file. No second mocking
  library.
- `beforeEach` builds fresh instances; no mutable state shared between tests or created in `beforeAll`.
- The same logic over several inputs is one `it.each` with readable labels; a single case is a plain `it`.
- Never the real clock: `vi.useFakeTimers()` and `vi.setSystemTime(...)`, restored in `afterEach`; no `setTimeout`
  waits.
- No test-only branch in production code, no assertion on a private member, no snapshot for logic that changes
  often.
- Run the project's coverage script and hold its configured floor (`coverage.thresholds`, `coverageThreshold`);
  don't assume a number.
