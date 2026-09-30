---
id: typescript/ts-sync-tests
kind: skill
title: "Sync Tests (TypeScript)"
description: "Sync the test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)"
name: ts-sync-tests
language: typescript
whenToUse: >-
  Use after multiple source files have changed and the test suite has drifted — missing tests for
  new exports, stale tests for renamed symbols, orphaned tests for deleted files. Also fires for
  "sync the tests", "clean up orphaned tests", or "make sure tests match the current source". Not
  for a single untested file with no drift to reconcile (see ts-generate-tests for that — it's
  cheaper for the one-file case).
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

# Sync Tests

**Scope:** {sigil:arguments} (default: `--scope=changed`)

## Step 1 — Determine scope

Parse `{sigil:arguments}` for `--scope=changed` (default) or `--scope=all`.

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

Run the test command discovered in Step 2 (the project's own `package.json` script, not a
hardcoded runner invocation). Fix any failures introduced by the new or updated tests.

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
