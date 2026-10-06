---
id: angular/ng-sync-tests
kind: skill
title: "Sync Tests (Angular)"
description: "Sync an Angular spec suite with source code — add missing specs, update stale ones, and remove orphaned specs (with confirmation before deletion)"
name: ng-sync-tests
language: angular
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
    - angular/ng-testing
  agents:
    - angular/ng-code-reviewer
tags:
  - angular
  - sync
  - tests
whenToUse: "Run via `/ng-sync-tests` after multiple source files have changed and the spec suite has drifted — e.g. \"sync my tests\", \"find missing and orphaned specs\". Default scope targets only files changed in the working tree; pass `--scope=all` for a full-project audit. Complements ng-generate-tests, which targets one file at a time."
---

# Sync Tests

**Scope:** {sigil:arguments} (defaults to `changed` if empty)

## Step 1 — Determine scope

**`changed` (default):** Modified, added, or renamed source files in the current git working tree.

```bash
git status --porcelain
git diff --name-only HEAD
```

Use the Grep and Glob tools to process the results — avoid shell pipelines with `awk`/`xargs` for cross-platform reliability.

Exclude: deleted source files (handle separately in Step 4), existing `*.spec.ts` files, cache directories (`node_modules`, `dist`, `.angular`, `coverage`), lock files, and generated files.

**`all`:** All source files in the project.

Use Glob with `**/*.ts` (excluding `**/*.spec.ts`), excluding test/cache/generated directories.

## Step 2 — Discover the runner and layout

Inspect the repo — do **not** assume a fixed structure:
- Confirm the spec convention by reading 2–3 existing specs — Angular co-locates `foo.ts` → `foo.spec.ts`; some projects mirror into `tests/`. Apply the in-use pattern consistently.
- Detect the test runner (`package.json` scripts, `vitest.config.*`, `angular.json`, `karma.conf.js`, `jest.config.*`).
- Detect the era/reactivity style so generated specs match (standalone+signals vs NgModule classic; signals vs RxJS).

## Step 3 — Add and update tests

For each in-scope source file:

1. Derive the expected spec path using the co-location/mirroring convention.
2. **Spec does not exist:** create it. Follow the project's documented conventions — discover from `{sigil:conventions-file}`, any rules files present, config, or existing specs. Apply the same principles as single-file generation:
   - AAA pattern, one behaviour per test, descriptive `describe`/`it` names.
   - TestBed + ComponentFixture; mock only I/O boundaries (`provideHttpClientTesting`, service stubs).
   - `it.each` over multiple inputs; fake timers / `fakeAsync` for time; signal/observable assertions.
   - Extract test data to constants/builders; cover happy path + edge + error paths.
3. **Spec exists:** read it alongside the source. Identify public members (methods, inputs, outputs) that lack tests. Add the missing tests following the same principles. Flag stale tests (whose source counterpart no longer exists) in the report — do not remove them here.

## Step 4 — Detect orphaned tests

Orphaned specs are spec files (or `describe`/`it` blocks within them) whose source counterpart was deleted or renamed:

```bash
git status --porcelain   # lines starting with D or R indicate deleted/renamed sources
```

Map each deleted/renamed source file to its expected spec path. If the spec exists, mark it as an orphan candidate.

Report them — **make no deletions yet.**

## Step 5 — Confirm before any deletion (guardrail)

If orphan candidates were found, present them clearly:

```
Orphaned specs detected:
  - src/app/old-widget/old-widget.component.spec.ts   (source deleted: old-widget.component.ts)
  - describe('RemovedService')                         in user.service.spec.ts  (class deleted)
  - it('formats legacy date')                          in date.pipe.spec.ts     (method removed)

These will be permanently deleted. Proceed? [y/N]
```

**Stop and wait for explicit confirmation.** Only after receiving "y" or "yes" should you proceed with deletions. If the user says no, declines, or does not respond, skip all deletions and record "orphans not removed — user declined" in the final report.

## Step 6 — Run and report

Discover the project's test command (check `package.json` scripts; fallback `vitest run` or `ng test --watch=false`). Run it. If any tests fail after sync, diagnose and fix before finishing.

```
## Sync Tests Report
  Scope:           <changed | all>
  Files analyzed:  <N>
  Tests created:   <N>
  Tests updated:   <N>
  Orphans removed: <N>  (or "none" / "skipped — user declined")

Suite: ✅ <N> passed  /  ❌ <N> failed
Coverage delta: <+/-N%>  (if reported by runner)
```
