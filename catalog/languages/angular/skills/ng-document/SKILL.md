---
id: angular/ng-document
kind: skill
title: "Document (Angular)"
description: "Generate or update TSDoc and module-level documentation following the project's documented documentation style"
name: ng-document
language: angular
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
    - angular/ng-documentation
  agents:
    - angular/ng-code-reviewer
tags:
  - angular
  - document
  - documentation
---

## When to Use

Use when public symbols, components, or services are missing TSDoc, or after adding new public API surface. Pass a target file; omit to scan for undocumented public symbols across the source.

---

# Document

**Target:** $ARGUMENTS

## Step 1 — Resolve target

**If `$ARGUMENTS` is provided:** treat it as the target file or module.

**If `$ARGUMENTS` is empty:**
1. Discover the source root (from `angular.json` or `package.json`).
2. Scan for exported symbols, components, and services that lack TSDoc:
   ```bash
   grep -rn "export \(class\|function\|const\|interface\|type\|enum\)" <source-root> --include="*.ts"
   ```
3. List the top candidates (most undocumented symbols) and ask the user to choose.

## Step 2 — Discover documentation style

Do **not** assume a style. Discover it:
- Read `CLAUDE.md` and `.claude/` rules if present.
- Check for Compodoc config (`.compodocrc*`, a `compodoc` script in `package.json`) and any TSDoc/eslint-jsdoc config.
- Read 2–3 existing doc comments to match the in-use tag conventions.
- If no style is in use, default to **TSDoc** (`@param` / `@returns` / `@throws` / `@remarks` / `@deprecated`).

## Step 3 — Read the target

Read the target file fully. Identify:
- Exported classes, functions, methods, interfaces, types, enums that are **missing** TSDoc — primary targets.
- Component **`@Input`/`@Output`** and signal **`input()`/`output()`/`model()`** — document each contract (range, units, default, required).
- Public service methods and any `InjectionToken` — document what they provide and the expected lifetime.
- Items with **incomplete** docs (missing `@param`, `@returns`, or `@throws`).
- Module/file header: present and accurate, or absent/stale.

Do not touch private helpers unless their purpose is genuinely non-obvious.

## Step 4 — Write documentation

For each missing or incomplete doc comment:

**One-liner (trivial):**
```ts
/** Return true if `d` falls on Saturday or Sunday. */
export function isWeekend(d: Date): boolean { … }
```

**Full TSDoc (non-trivial):**
```ts
/**
 * Merge calendar and dev-activity rows into a unified daily timeline.
 *
 * Calendar rows are preserved verbatim. Dev-activity rows fill the remaining
 * time up to the daily cap, in ticket order; rows crossing the cap are truncated.
 *
 * @param calRows - Ordered calendar rows.
 * @param devRows - Ordered dev-activity rows.
 * @returns A merged list sorted by start time.
 * @throws RangeError if the inputs contain overlapping time ranges.
 */
export function mergeTimeline(calRows: CalRow[], devRows: DevRow[]): TimesheetRow[] { … }
```

**Component contract:**
```ts
/** Current rating, 0–5 inclusive. Values outside the range are clamped. */
readonly value = input.required<number>();
```

**Rules:**
- Never restate the symbol name as the entire summary (`getUser()` + `/** Get the user. */`).
- Document *why* and *what contract*, not *how* (implementation details drift).
- Keep the summary line ≤ 72 characters.
- `@throws`: only document errors the caller must handle.

## Step 5 — Run and report

Run the project's lint/type command to verify the new docs compile and satisfy any doc lint rules
(check `package.json` scripts; fallback `ng lint` / `npx eslint <file>` and `tsc --noEmit`).

```
Documentation Report
  Target: <file-or-module>
  Doc comments added: <N>
  Doc comments updated: <N>
  Public symbols still undocumented: <N> (list them)
  Lint / type check: ✅ passed / ❌ failed
```
