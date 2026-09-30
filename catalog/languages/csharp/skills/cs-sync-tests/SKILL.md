---
id: csharp/cs-sync-tests
kind: skill
title: "Sync Tests (.NET / C#)"
description: "Sync the xUnit test suite with source code — add missing tests, update stale ones, and remove orphaned tests (with confirmation before deletion)"
name: cs-sync-tests
language: csharp
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
    - csharp/cs-testing
  agents:
    - csharp/cs-code-reviewer
tags:
  - csharp
  - sync
  - tests
---

## When to Use

Use after multiple source files have changed and the test suite has drifted — missing tests for new public members, stale tests for renamed symbols, orphaned tests for deleted files. Run with --scope=all for a full audit; default --scope=changed targets only files modified in the current working tree.

---

# Sync Tests

**Scope:** $ARGUMENTS (defaults to `changed` if empty)

## Step 1 — Determine scope

**`changed` (default):** Modified, added, or renamed source files in the current git working tree.

```bash
git status --porcelain
git diff --name-only HEAD
```

Use the Grep and Glob tools to process results — avoid shell pipelines with `awk`/`xargs`/`grep`
for cross-platform reliability.

Exclude: deleted source files (handled in Step 4), existing test files (`*Tests.cs`, `*Test.cs`),
`GlobalUsings.cs`, `*.g.cs` generated files, `bin/`, `obj/`, cache directories, and lock files.

**`all`:** All primary source `.cs` files in the project.

Use Glob with `src/**/*.cs` (or the discovered source root). Exclude test projects, generated files,
`bin/`, `obj/`, `*.g.cs`.

## Step 2 — Discover layout

Inspect the repo — do **not** assume a fixed directory structure:
- Locate the solution root from `.sln` or `Directory.Build.props`.
- Locate the source root (`src/`) and test root (`tests/`).
- Read 2–3 existing test files to learn the mirroring pattern in use
  (e.g. `src/Foo/Bar.cs` → `tests/Foo.Tests/BarTests.cs`).
- Apply it consistently for every file in scope.

## Step 3 — Add and update tests

For each in-scope source file:

1. Derive the expected test file path using the mirroring convention.
2. **Test file does not exist:** create it. Follow the project's documented conventions — discover
   from `CLAUDE.md`, `.claude/` rules, or by reading existing tests:
   - AAA with `// Arrange` / `// Act` / `// Assert`.
   - One behaviour per test; `Method_Should_Behavior_When_Condition` names.
   - Moq for I/O boundaries; test pure logic directly.
   - `[Theory]` + `[InlineData]` over multiple inputs; never single-case.
   - Named class-level constants / builders for test data.
   - Happy path + null/empty edges + error paths.
3. **Test file exists:** read it alongside the source file. Identify public members that lack tests.
   Add the missing tests following the same principles. Flag stale tests (whose source counterpart
   no longer exists) in the report — do not remove them here.

## Step 4 — Detect orphaned tests

Orphaned tests are test files (or classes/methods within them) whose source counterpart was deleted
or renamed:

```bash
git status --porcelain   # lines starting with D or R indicate deleted/renamed sources
```

Map each deleted/renamed source file to its expected test file path. If the test file exists,
mark it as an orphan candidate.

Also scan for test classes whose tested type no longer exists in the source (rename without corresponding
test rename) — grep the test class name / method name pattern against the source tree.

Report them — **make no deletions yet.**

## Step 5 — Confirm before any deletion (guardrail)

If orphan candidates were found, present them clearly:

```
Orphaned tests detected:
  - tests/Foo.Tests/OldParserTests.cs          (source deleted: src/Foo/OldParser.cs)
  - CalendarParserTests.ParseLegacyFormat       in tests/Foo.Tests/CalendarParserTests.cs
    (method ParseLegacyFormat removed from CalendarParser)

These will be permanently deleted. Proceed? [y/N]
```

**Stop and wait for explicit confirmation.** Only after receiving "y" or "yes" should you proceed
with deletions. If the user says no, declines, or does not respond, skip all deletions and record
"orphans not removed — user declined" in the final report.

## Step 6 — Run suite and report

Discover the test command (check `build.ps1`, `Nuke`, `Cake`, `justfile`; fallback `dotnet test`).
Run it. If any tests fail after sync, diagnose and fix before finishing.

```
Sync Results
  Scope:           <changed | all>
  Files analyzed:  <N>
  Tests created:   <N>
  Tests updated:   <N>
  Orphans removed: <N>  (or "none" / "skipped — user declined")

Suite: ✅ <N> passed  /  ❌ <N> failed
Coverage delta: <+/-N%>  (if reported by runner)
```
