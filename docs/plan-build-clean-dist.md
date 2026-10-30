# Plan: `sigil build` replaces `dist/<target>/`

Source: ADR Phase 0, "`build` cleans `dist/<target>/`"
([distribution-channels-2026-09](decisions/distribution-channels-2026-09.md#6-roadmap-each-phase-built-separately-suggested-order-1a--1c--1b--0--1--2--2b--3--4--5--6)),
flagged ⚠ "deletes `dist/`". Branch: `fix/build-clean-dist`. One PR.

## What is true today (checked 2026-10-30)

- `npm run build` removes only `dist-cli/` and `test-compiled/` (the `clean` script). It never touches `dist/`.
- `sigil build` only adds and overwrites (`buildOneTarget` → `writeFilesSync`), so removed output stays:
  - the repo's `dist/claude/plugins/` has 15 folders and `marketplace.json` lists 13. `essentials` and `free-worker`
    are stale.
  - reproduced with a scratch `--out-dir`: a planted plugin folder, a planted file in `claude/` and a planted folder
    in `copilot/` all survive a rebuild, exit 0.
- Local impact: `scripts/validate-claude-plugins.cjs` walks every folder under `dist/claude/plugins/`, so
  `ci:local` validates plugins that no longer exist.
- Published output is not affected. CI, `release.yml` and `check-marketplace-drift.cjs` build into fresh folders, and
  the release job replaces the branch contents itself. This fix is for `dist/`, and for a fork rebuilding `./out`
  (`docs/guides/publishing.md`).
- No test reads the repo's own `dist/<target>/`, so wiping it adds no race to the test run.

## Decisions

1. **`sigil build` does the cleaning, not `npm run build`.** It is the command that owns the folder, and a custom
   `--out-dir` needs it too. The `clean` script stays as it is.
2. **Each built target's folder is removed and rewritten; nothing else is touched.** `--target claude` leaves
   `<out>/copilot/` alone. Other entries in `<out>` stay. `registry.json` is overwritten as today.
3. **Compile every target before deleting anything.** A failed compile or output-contract check leaves the previous
   output intact. Today's loop writes `claude` before `copilot` is compiled, so `runBuild` splits into compile, then
   write.
4. **Guard against deleting a folder sigil did not build.** `--out-dir` is free-form, so `sigil build --out-dir .`
   would otherwise delete a project's own `claude/` or `copilot/` folder. `build` refuses when a target folder exists
   and `<out>/registry.json` does not: every `build` writes that file, so it marks an output root without adding
   anything to the emitted tree. The refusal happens before any deletion. Rejected:
   - a marker file inside `<target>/`: it would land in the published marketplace and break the drift check;
   - cleaning only the default `dist/`: forks keep the bug.
5. **No `--no-clean` flag.** Nothing needs the old merge behaviour.

Out of scope: `--catalog-dir` pointing inside the output folder, and `sigil index` (it writes only `registry.json`).

## Steps

### Step 1 `[worker:medium]`: RED tests

File: `test/commands/build-clean.test.ts` (new). Call `runBuild` directly and use `withTempDirAsync`, `CATALOG` and
`PACKS` as `test/commands/build-identity.test.ts` does. `<out>` is `path.join(root, 'dist')`.

| #   | Case                           | Setup                                                                                                                                                                                 | Expected                                                                                                               | Before step 2 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | stale files go                 | build `claude`; add `<out>/claude/plugins/stale-plugin/SKILL.md` and `<out>/claude/note.md`; build `claude` again                                                                     | both gone; `<out>/claude/.claude-plugin/marketplace.json` exists                                                       | fails         |
| 2   | every target is cleaned        | build `all`; add `stale.md` to `<out>/<name>/` for each `getAllTargets()` name; build `all` again                                                                                     | every `stale.md` gone                                                                                                  | fails         |
| 3   | other folders are kept         | build `all`; add `<out>/copilot/stale.md` and `<out>/keep/a.txt`; build `claude`                                                                                                      | both still exist                                                                                                       | passes        |
| 4   | guard refuses, single target   | create `<out>/claude/mine.md`, no `registry.json`; build `claude`                                                                                                                     | rejects with `SigilError` matching `/registry\.json/`; `mine.md` exists; no `<out>/registry.json`, no `claude/plugins` | fails         |
| 5   | guard checks before deleting   | build `claude`, then delete `<out>/registry.json` and add `<out>/copilot/mine.md`; build `all`                                                                                        | rejects; `<out>/copilot/mine.md` and `<out>/claude/.claude-plugin/marketplace.json` both exist; no `registry.json`     | fails         |
| 6   | a failed build changes nothing | build `claude` into `<out>`, add `<out>/claude/stale.md`; build `all` with the seeded catalog from `test/commands/foreign-literal-gate.test.ts` (it passes `claude`, fails `copilot`) | rejects; `<out>/claude/stale.md` still exists                                                                          | passes        |
| 7   | first build needs no guard     | `<out>` does not exist; build `claude`                                                                                                                                                | resolves; `<out>/registry.json` exists                                                                                 | passes        |

Case 6 passes today only because nothing is ever deleted. It must still pass after step 2, and only compile-first
makes it pass, so after step 2 confirm it by temporarily moving the delete before the compile. Copy the seeding from
`foreign-literal-gate.test.ts`; do not export anything from it.

Test: `npm run build && npm run build:test && node --test test-compiled/commands/build-clean.test.js`.
Expected: cases 1, 2, 4 and 5 fail on their assertions, not on setup; 3, 6 and 7 pass. Commit the tests with step 2 so
the commit stays green (`test: …` is not committed alone).

### Step 2 `[worker:medium]`: compile first, guard, replace

File: `src/commands/build.ts` only.

- Split `buildOneTarget` into `compileTarget(target, resolved, compileOpts)`, which logs `Building target:`, compiles,
  runs the output-contract check and returns the `FileMap`, and `writeTarget(target, files, outDir)`, which does
  `fs.rmSync(dir, { recursive: true, force: true })`, then `writeFilesSync(files, dir)`, then the existing `✓` line.
- Add `assertReplaceable(targets, outDir)`: if `<outDir>/registry.json` does not exist and any
  `path.join(outDir, target.name)` does, throw
  `SigilError("Refusing to replace <dir>: <outDir> has no registry.json, so it is not a sigil build output.", { hint: 'Use an empty --out-dir, or remove the folder first.' })`.
- `runBuild` order: compile all targets into a list, `assertReplaceable`, write each target, `writeRegistry`.
- Give the new helpers one-line doc comments, as the file's other helpers have. Fix the `@module` line only if it
  becomes wrong.

Test: `npm run build && npm run build:test && node --test test-compiled/commands/build-clean.test.js test-compiled/commands/build-identity.test.js test-compiled/commands/build-determinism.test.js test-compiled/commands/foreign-literal-gate.test.js test-compiled/scripts/check-marketplace-drift.test.js test-compiled/targets/output-snapshot.test.js`.
Expected: all pass, and the output snapshot needs no update (fresh folders emit the same bytes).

### Step 3 `[inline: judgment]`: check it for real

Run `npm run catalog:build` in the repo: `dist/claude/plugins/` must drop to the 13 folders in `marketplace.json`,
and `npm run validate:claude-plugins` must pass. Repeat the scratch `--out-dir` reproduction from above, plus
`sigil build --out-dir .` in a scratch folder holding a `claude/` folder (refused, folder intact). This is the
evidence for the PR.

### Step 4 `[worker:medium]`: help text and reference

Files: `src/cli.ts`, `docs/reference/cli-flags.md`, `docs/reference/spec.md`.

- `.description` of `build` (`src/cli.ts:38`) and its `summary` (`src/cli.ts:421`) become
  `Compile the catalog to dist/<target>/, replacing that folder.`
- `cli-flags.md`: paste the new description, and fix the `--target` line, which is out of date. It must read
  `(claude, copilot, agents-standard, all)`.
- `spec.md` `sigil build` row: same sentence, plus that it refuses a folder whose output root has no `registry.json`.

Test: `npm run build && npm run build:test && node --test test-compiled/cli-flags.test.js test-compiled/cli-help-accuracy.test.js`.

### Step 5 `[worker:medium]`: guides, changelog, ADR

Files: `docs/guides/operations.md`, `docs/guides/publishing.md`, `CHANGELOG.md`,
`docs/decisions/distribution-channels-2026-09.md`.

- `operations.md`, after the `sigil build --target all` example (line ~144): `build` removes and rewrites each target
  folder it builds, and `npm run build` does not touch `dist/`.
- `publishing.md` § 2, after the build command: `--out-dir` should be a folder only sigil writes to. A target folder
  there is replaced on every build, and `build` refuses when the folder has no `registry.json`.
- `CHANGELOG.md`, `[Unreleased]`, `### Changed`: `sigil build` now replaces `dist/<target>/` instead of adding to it,
  so removed plugins no longer linger, and refuses to replace a folder it did not build.
- ADR, the note after the roadmap table (line 207): record `build` cleaning `dist/<target>/` as done on the merge date,
  next to "No empty plugins". Leave line 62: it describes the state when the ADR was written.

Test: `npx prettier --check docs CHANGELOG.md`.

### Step 6 `[inline: close-out]`

`npm run ci:local`, `workflow-report .`, `/agent-skills:review` of the branch, PR, merge on green CI, then delete this
plan after merge.
