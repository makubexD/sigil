---
id: typescript/ts-sync-tests
kind: skill
title: "Sync Tests (TypeScript)"
description: "Sync the test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)"
name: ts-sync-tests
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
argumentHint: "[--scope=changed|all] (default: changed)"
uses:
  rules:
    - typescript/ts-testing
  agents:
    - typescript/ts-code-reviewer
tags:
  - typescript
  - sync
  - tests
---

## When to Use

Use after multiple source files have changed and the test suite has drifted — missing tests for new exports, stale tests for renamed symbols, orphaned tests for deleted files. Run with --scope=all for a full audit; default --scope=changed targets only files modified in the current working tree.

---

# Sync Tests

**Scope:** $ARGUMENTS (default: `--scope=changed`)

## Step 1 — Determine scope

Parse `$ARGUMENTS` for `--scope=changed` (default) or `--scope=all`.

**`changed`:** use the git working tree to identify modified files:
```bash
git status --porcelain
git diff --name-only HEAD
```
Process results with Grep/Glob. Exclude: deleted source files (handle in Step 4), existing test
files, lock files, generated files, and config files.

**`all`:** use Glob to enumerate every source file (`**/*.ts`, `**/*.tsx`) excluding test files
(`*.test.*`, `*.spec.*`), `node_modules/`, `dist/`, `build/`, and generated files.

## Step 2 — Discover layout

Locate the source root and test root. Read `vitest.config.*` and `package.json` scripts. Read 2–3
existing test files to confirm the mirroring pattern. Apply it consistently to all files in scope.

## Step 3 — Add and update tests

For each source file in scope:
1. Derive the expected test file path from the discovered mirroring pattern.
2. **If the test file is missing:** create it following the project's conventions (AAA, `it.each`,
   mock only at I/O boundaries, named builders, `describe` blocks per subject).
3. **If the test file exists:** read both files side-by-side. Add tests for any exported symbol
   that has no corresponding test case. **Do not remove** existing tests — flag stale ones in the
   report instead; let a human decide whether to delete or update.

## Step 4 — Detect orphaned tests

Orphaned tests are test files whose source counterpart no longer exists.

```bash
git status --porcelain
```

Lines starting with `D` (deleted) or `R` (renamed) indicate source files that may have left
orphaned test files behind. Map each deleted/renamed source to its expected test path. Flag existing
matches as orphan candidates. **Report only — make no deletions here.**

## Step 5 — Confirm before any deletion (GUARDRAIL)

If orphaned test files were found, present the list before touching any file:

```
The following test files appear to be orphaned (their source file was deleted or renamed):

  test/calendar/oldParser.test.ts   (source: src/calendar/oldParser.ts — deleted)
  test/reporting/legacyReport.test.ts   (source: src/reporting/legacyReport.ts — renamed to devReport.ts)

Proceed with deletion? [y/N]
```

**Stop and wait for explicit confirmation.** Only proceed on `y` or `yes`. If the user declines or
does not respond, skip all deletions and record "orphans not removed — user declined" in the report.

## Step 6 — Run suite and report

Discover the test command from `package.json` scripts. Fallback: `npx vitest run`. Fix any
failures introduced by the new or updated tests before reporting.

```
## Sync Results

Scope: <changed / all>
Files analyzed: <N>
Tests created: <N files / M tests>
Tests updated: <N tests>
Orphans removed: <N>  /  Orphans not removed — user declined

Suite: ✅ <N passed>  /  ❌ <N failed — detail>
Coverage delta: <+X% / -X% / unchanged>
```
