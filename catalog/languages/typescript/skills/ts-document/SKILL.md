---
id: typescript/ts-document
kind: skill
title: "Document (TypeScript)"
description: "Generate or update TSDoc on exported symbols following the project's documented documentation style"
name: ts-document
language: typescript
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[file-or-module] (optional)"
whenToUse: >-
  Use when exported functions, classes, interfaces, or type aliases are missing TSDoc, or after
  adding new public API surface — "document this", "add TSDoc", "write docs for this module".
  Pass a target file; omit to scan for undocumented public exports across the source.
uses:
  rules:
    - typescript/ts-documentation
  agents:
    - typescript/ts-code-reviewer
tags:
  - typescript
  - document
  - documentation
---

# Document

**Target:** {sigil:arguments}

## Step 1 — Resolve target

If `{sigil:arguments}` is provided, use it as the target file or module. If empty, discover the source root
from `package.json`. Scan for exported symbols missing TSDoc:

```bash
grep -rn "^export " src/ --include="*.ts" --include="*.tsx" -l
```

List the top candidates by undocumented export count and ask the user to choose before proceeding.

## Step 2 — Discover documentation style

Do not assume. Read in order:
1. `{sigil:conventions-file}` and any rules files present for stated documentation conventions.
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
Symbols documented (added): <N>
Symbols documented (updated): <N>
Still undocumented: <N> (list if > 0)
Lint: ✅ passed  /  ❌ <error>  /  ⏭ not configured
Type check: ✅ passed  /  ❌ <error>
```
