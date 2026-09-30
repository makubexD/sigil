---
id: typescript/ts-generate-tests
kind: skill
title: "Generate Tests (TypeScript)"
description: "Generate a Vitest suite for a source file or module following the project's documented test conventions"
name: ts-generate-tests
language: typescript
appliesTo:
  - "**/*"
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[file-or-module] (optional)"
uses:
  rules:
    - typescript/ts-testing
  agents:
    - typescript/ts-code-reviewer
tags:
  - typescript
  - generate
  - tests
---

## When to Use

Use when a source file lacks tests or when new exported functions have been added without corresponding test coverage. Pass the target file path as the argument; omit to scan for untested files and choose interactively.

---

# Generate Tests

**Target:** $ARGUMENTS

## Step 1 — Resolve target

If `$ARGUMENTS` is provided, use it as the target source file or module. If empty, discover the
source root from `package.json` (`"main"`, `"exports"`, or the `src/` convention). Scan for source
files that have no corresponding test file; present the top candidates and ask the user to choose
before proceeding.

## Step 2 — Discover layout

Do not assume a fixed layout. Read:
- `package.json` scripts for the test runner command and any test path pattern.
- `vitest.config.*` for `include`, `exclude`, and `root`.
- 2–3 existing test files to learn the mirroring pattern.

Common patterns (determine from existing tests, not from convention):
- Co-located: `src/calendar/parser.ts` → `src/calendar/parser.test.ts`
- Separate test dir: `src/calendar/parser.ts` → `test/calendar/parser.test.ts`
- Flat test dir: `src/calendar/parser.ts` → `test/parser.test.ts`

If no tests exist yet, default to co-located (`<source-path>.test.ts`) and document the choice.

## Step 3 — Read the target

Identify:
- Every exported function, class, and method (test subjects).
- External dependencies (HTTP clients, filesystem, clock, env vars, external services) — these are
  the mock boundaries.
- Branching conditions, invariants, edge cases, and error paths to cover.

## Step 4 — Write tests

Follow the project's documented conventions from `CLAUDE.md`, `.claude/` rules, and existing tests.

Core principles:
- One behavior per test (`it`).
- AAA with labeled `// Arrange` / `// Act` / `// Assert` comments.
- Descriptive name: `it("should <behavior> when <condition>", …)`.
- `it.each` for the same behavior over multiple inputs (never single-case).
- Mock only at I/O boundaries — `vi.mock("./httpClient.js", …)`, `vi.fn()` for injected deps;
  test pure logic without any mocking.
- Extract test data to named module-level builders / constants.
- Cover: happy path, empty/zero/boundary inputs, error paths, and any documented side effects.

Example structure:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseIcs } from "./parser.js";

const EMPTY_ICS = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
const SINGLE_EVENT_ICS = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Standup\n…\nEND:VEVENT\nEND:VCALENDAR`;

describe("parseIcs", () => {
  it("should return an empty array when the calendar has no events", () => {
    // Arrange
    // (no setup needed)

    // Act
    const result = parseIcs(EMPTY_ICS);

    // Assert
    expect(result).toHaveLength(0);
  });

  it("should parse a single event with summary and dates", () => {
    // Arrange — (SINGLE_EVENT_ICS defined at module scope)

    // Act
    const [event] = parseIcs(SINGLE_EVENT_ICS);

    // Assert
    expect(event.summary).toBe("Standup");
    expect(event.start).toBeInstanceOf(Date);
  });

  it.each([
    ["malformed VCALENDAR", "BEGIN:VCALENDAR\n---garbage---\nEND:VCALENDAR"],
    ["empty string", ""],
  ])("should throw ParseError when given %s", (_label, input) => {
    expect(() => parseIcs(input)).toThrow(ParseError);
  });
});
```

Create the containing directory if it does not exist.

## Step 5 — Run and report

Discover the test command from `package.json` scripts. Fallback:
```bash
npx vitest run <test-file-path> --reporter=verbose
```

Fix any failures before finishing. Then emit:

```
## Test Generation Report

Target: <source file>
Tests written to: <test file>
Tests written: <N>
Result: ✅ <N> passed  /  ❌ <detail>
Coverage delta: <if available>
```
