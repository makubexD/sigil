---
id: react/react-sync-tests
kind: skill
title: "Sync Tests (React)"
description: "Sync the Testing Library suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)"
name: react-sync-tests
language: react
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
    - react/react-testing
  agents: []
tags:
  - react
  - testing
  - sync
whenToUse: "Use after multiple components have changed and the test suite has drifted — missing tests for new components, stale tests for renamed props, orphaned tests for deleted components. Also fires for \"sync the tests\", \"clean up orphaned tests\", or \"make sure tests match the current components\". Not for a single untested component with no drift to reconcile (see react-generate-tests for that)."
---

# Sync Tests

**Scope:** {sigil:arguments} (default: changed files since the last commit on the base branch)

## Step 1 — Determine scope

`--scope=changed` (default): `git diff --name-only <base>...HEAD -- '*.tsx' '*.ts'`, excluding test
files themselves. `--scope=all`: every component under `src/`/`app/`.

## Step 2 — Find drift

For each component/hook in scope:
- **Missing tests** — an exported component/hook with no corresponding `.test.tsx` file.
- **Stale tests** — a test referencing a renamed/removed prop (TypeScript error), or querying for
  UI text/roles that no longer exist in the rendered output.
- **Orphaned tests** — a test file whose corresponding component no longer exists.

```bash
npx tsc --noEmit 2>&1 | grep -i "test"   # surfaces type errors in test files from renamed props
npx vitest run 2>&1 | grep -i "cannot find"
```

## Step 3 — Add missing tests

For each undocumented exported component, write tests following `react-testing`'s query-by-role
convention — cover the default render, one interaction path, and one error/empty state at minimum.

## Step 4 — Fix stale tests

Update tests referencing a changed prop or rendered output to match the current component,
preserving the original test's intent (what user behavior it was verifying) — do not delete and
regenerate blindly.

## Step 5 — Handle orphaned tests

List orphaned test files and **ask for confirmation before deleting** — a test with no
corresponding component might indicate the component was wrongly deleted, not that the test is
genuinely obsolete.

## Step 6 — Verify

```bash
npx vitest run
npx tsc --noEmit
```

## Step 7 — Report

```
## Sync Tests Report
Scope: <changed files / all>

### Added
- `Component.test.tsx::renders with default props` — covers `Component`

### Fixed (stale)
- `Component.test.tsx::test case` — updated for renamed prop `oldProp` → `newProp`

### Orphaned (pending confirmation)
- `OldWidget.test.tsx` — component `OldWidget.tsx` no longer exists. Delete? [confirm before removing]

### Verification
Tests: <pass count>, all green
Type check: clean
```
