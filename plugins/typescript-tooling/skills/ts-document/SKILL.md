---
name: ts-document
description: "Generate or update TSDoc on exported symbols following the project's documented documentation style (TypeScript)"
when_to_use: "Use when exported functions, classes, interfaces, or type aliases are missing TSDoc, or after adding new public API surface — \"document this\", \"add TSDoc\", \"write docs for this module\". Pass a target file; omit to scan for undocumented public exports across the source."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[file-or-module] (optional)"
---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

If `$ARGUMENTS` is provided, use it as the target file or module. If empty, discover the source root
from `package.json`. Scan for exported symbols missing TSDoc:

```bash
grep -rn "^export " src/ --include="*.ts" --include="*.tsx" -l
```

List the top candidates by undocumented export count and ask the user to choose before proceeding.

## Step 2 — Discover documentation style

Do not assume. Read in order:
1. `CLAUDE.md` and any rules files present for stated documentation conventions.
2. `package.json` for TypeDoc or API Extractor configuration.
3. 2–3 existing TSDoc comments in the codebase to determine the project's style and tag usage.

Default to standard TSDoc tags (`@param`, `@returns`, `@throws`, `@remarks`, `@deprecated`) if no
style is documented.

## Step 3 — Read the target

Identify exported functions/classes/interfaces/type aliases/constants missing TSDoc (`/** … */`)
or with incomplete TSDoc (missing `@param`/`@returns`/`@throws` where relevant); interfaces that
define behavioral contracts (document the invariants implementers must uphold); and whether a
file-level module comment is needed. Do not touch private/internal symbols unless genuinely
non-obvious.

## Step 4 — Write documentation

For each symbol needing documentation:

**One-liner (trivial cases):**
```typescript
/** The default timezone used when none is specified in config. */
export const DEFAULT_TIMEZONE = "UTC";
```

**Full TSDoc (non-trivial functions and interfaces):**
```typescript
/**
 * Normalizes raw calendar events into timesheet rows for the given date window.
 *
 * Applies deduplication (same-start events → longest retained), local-timezone
 * conversion, status filtering, and daily-cap rounding. The returned rows are
 * sorted by start time within each day.
 *
 * @param events - Raw calendar events, all in UTC.
 * @param config - Normalization settings including timezone and accepted statuses.
 * @param from - First day of the window (inclusive), in config timezone.
 * @param to - Last day of the window (inclusive), in config timezone.
 * @returns Normalized rows sorted by date and start time.
 * @throws {ConfigError} If config.timezone is not a valid IANA zone name.
 */
export function normalize(
  events: readonly CalendarEvent[],
  config: Config,
  from: Date,
  to: Date,
): TimesheetRow[] { … }
```

Rules:
- Never restate the function name as the entire summary (`/** Get the user. */` for `getUser`).
- Document **why** or **what the contract is**, not how the implementation works.
- `@param` for every non-obvious parameter (units, ranges, formats, side effects).
- `@returns` when the return value has a contract beyond the type (e.g. "sorted ascending").
- `@throws` only for exceptions the **caller** needs to handle.
- `@deprecated` with a migration note when a symbol is being phased out.
- Summary line ≤ 72 characters.

## Step 5 — Run and report

Run ESLint on the target (if a tsdoc/jsdoc plugin is configured) and `tsc --noEmit` to catch any
import/type errors introduced by the edits. Emit:

```
## Documentation Report

Target: <file>
Doc comments added: <N>
Doc comments updated: <N>
Still undocumented: <N> (list them)
Lint: ✅ passed  /  ❌ <error>  /  ⏭ not configured
Type check: ✅ passed  /  ❌ <error>
```

---

## Applied Rules

### Documentation (TypeScript)

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
