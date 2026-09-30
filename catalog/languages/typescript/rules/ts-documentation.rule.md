---
id: typescript/ts-documentation
kind: rule
title: Documentation (TypeScript)
description: TypeScript documentation standards — TSDoc on exports, why-not-what comments, file headers, README expectations
language: typescript
appliesTo:
  - "**/*.ts"
  - "**/*.tsx"
severity: recommended
extends: []
tags:
  - typescript
  - documentation
appliesToRationale: TSDoc conventions apply only to TypeScript source with exportable symbols — excluded from config and non-source files with nothing to document.
---

## TSDoc Style

Use TSDoc (`/** … */`) for all exported symbols. Discover the project's doc-generation tool first
(TypeDoc, API Extractor, Compodoc) and follow any project-specific tag conventions. Default to
standard TSDoc tags:

```typescript
/**
 * Merges calendar rows and dev-activity rows into a unified daily timeline.
 *
 * Calendar rows are placed verbatim. Dev rows fill remaining capacity in ticket
 * order until the daily cap is reached; the row crossing the cap is truncated
 * and later rows are dropped.
 *
 * @param calendarRows - Pre-normalized calendar events for the day.
 * @param devRows - Dev-activity rows ordered by ticket priority.
 * @param dailyCapMinutes - Maximum billable minutes for the merged day.
 * @returns Merged rows sorted by start time, total ≤ dailyCapMinutes.
 * @throws {RangeError} If dailyCapMinutes is negative.
 */
export function mergeTimeline(
  calendarRows: readonly TimesheetRow[],
  devRows: readonly TimesheetRow[],
  dailyCapMinutes: number,
): TimesheetRow[] { … }
```

## What Requires Documentation

Document every **exported** symbol: functions, classes, interfaces, type aliases, constants, and
enum members. Non-obvious private/internal helpers warrant a one-liner if their intent is not
apparent from their name and signature.

Priority for `@param` and `@returns`:
- Non-trivial parameters (ranges, units, formats, side effects).
- Return values that carry a contract beyond the type (e.g. "sorted ascending", "never empty").
- Every `@throws` the **caller** might need to handle.

For interfaces that define a behavioral contract — not just a shape — document the invariants the
implementer must uphold:

```typescript
/**
 * Parses an ICS file into a list of raw calendar events.
 *
 * Implementers must expand RRULE recurrences and apply EXDATE cancellations.
 * All returned datetimes must be UTC-aware.
 */
export interface IcsParser {
  parse(icsContent: string): CalendarEvent[];
}
```

## What Must Not Go in Documentation

- Implementation details that will drift (data structure internals, algorithmic steps that change).
- Commented-out code — delete it; see `ts-code-quality`.
- Name restatement: `/** Get the user. */ getUser()` adds zero information.

## Comments

Comments explain **why**, not **what**. The code shows what is happening; a comment explains the
non-obvious motivation, constraint, or trade-off:

```typescript
// Offset by one because the ADO API uses 1-based sprint indices
const sprintIndex = rawIndex + 1;

// Use Object.create(null) to prevent __proto__ pollution from external keys
const lookup: Record<string, string> = Object.create(null);
```

## File-Level Headers

Add a file-level TSDoc comment to modules with non-obvious scope or public importance:

```typescript
/**
 * Calendar normalizer — converts raw CalendarEvent objects (UTC) into
 * TimesheetRow objects in the configured local timezone, applies deduplication,
 * and enforces the daily-cap rounding rule.
 *
 * @module
 */
```

Keep it to one or two sentences. Avoid restating the filename.

## README Expectations

Every package's top-level `README.md` should cover:
- What it does (one paragraph).
- Install / quickstart (commands the user runs).
- Required environment variables — names and descriptions only, never actual values.
- How to run tests and the quality gate.

Do not edit the README as part of a normal coding task unless the install steps, env vars, or CLI
interface has changed.

## Keeping Docs Current

When you change a function's signature, return type, thrown exceptions, or observable behavior,
update its TSDoc in the **same commit**. Update the file-level header if the module's responsibility
changed. Update the README if the install steps, CLI flags, or required environment variables changed.

## Types as Documentation

Accurate, fully annotated types are documentation. A `readonly` property communicates that callers
must not mutate it. A `T | undefined` return type communicates that callers must handle absence.
A narrow literal union (`"pending" | "active" | "closed"`) documents the valid state space.

Prioritize accurate types over voluminous prose — a wrong `@param` description is worse than none,
but a wrong type annotation fails the compiler.
