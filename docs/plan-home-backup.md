# Plan: home-scope backup skips files that hold only sigil's entries (issue #103)

## Context

Issue #103: when a home-scoped config file did not exist before `sigil add`, the first later write (`update` or
`uninstall`) takes the "pristine" `.sigil.bak` of sigil's own content, and the backup outlives the file after
`uninstall` deletes it. Cause: `ensureHomeBackup` (`src/config-utils.ts`) copies whatever file it first sees with no
`.sigil.bak` beside it; it can't tell that sigil wrote everything in it. Called from `add`
(`src/commands/add/execute-config.ts`), `update` (`src/commands/update-config-io.ts`) and `uninstall` / `prune`
(`src/commands/uninstall-config.ts`). Claude's user scope shares the code; Copilot's new `$COPILOT_HOME/hooks/` files
(#102) made it easy to hit.

**Design: decide from content, not from a flag.** The issue suggests recording on the first write whether the file
existed. A per-entry flag breaks on a shared file: with two Copilot hooks, the second `add` finds a file sigil created
for the first one. Instead, before backing up, reverse every fragment the manifest records for that file (all
entries, `sameFile`) on a copy of its content:

- nothing left (`{}`): the file holds only sigil's entries, so there is nothing of the user's to protect, and no
  backup is taken;
- anything left (a user key, a sigil entry the user edited), or the file is not valid JSON: back it up, as today.

No manifest or schema change. It also corrects itself: if the user later adds their own key to a file sigil created,
the next sigil write backs it up then. That backup holds sigil's entries too, so it is the first copy with user
content, not a pre-sigil original; the docs say so.

Branch: `fix/home-backup-created-file`. Execute one step at a time: "execute step N of docs/plan-home-backup.md".

## Steps

1. **RED tests** `[worker:medium]`
   - New `test/commands/home-backup.test.ts`.
   - `ensureHomeBackup(fullPath, sigilOps)` (the new signature), each case in a temp dir:
     - file absent → no `.sigil.bak`;
     - file holds exactly one recorded fragment → no `.sigil.bak`;
     - file holds two recorded fragments (two Copilot hook ops, `version` file-marker included) → no `.sigil.bak`;
     - file holds a recorded fragment plus a user key → `.sigil.bak` equals the file byte for byte;
     - file is not valid JSON → `.sigil.bak` equals the file;
     - `.sigil.bak` already exists → left unchanged.
   - Round trip through the CLI, Copilot user scope with `COPILOT_HOME` in a temp dir (modelled on the user-scope
     case in `test/targets/copilot-hooks.test.ts`):
     - empty home: `add --scope user shared/protect-config` → `update` → `uninstall` → no `.sigil.bak` at any point,
       and the hook file is gone;
     - `hooks/sigil.json` already holds a user hook: `add` → `.sigil.bak` equals the original bytes; `uninstall` →
       the user hook remains and `.sigil.bak` is unchanged;
     - empty home, `add`, then the user adds a key to the file, then `uninstall` → `.sigil.bak` exists and holds the
       user's key.
   - The F23 tests in `test/commands/update-config.test.ts` stay green (a pre-existing file is still backed up).
   - Test: `npm test`; the new cases fail for the right reason (the extra `.sigil.bak`, or the old signature).

2. **`ensureHomeBackup` decides from content** `[worker:medium]`
   - `src/manifest/config-fragments.ts`: `recordedOpsAt(manifest, dest)` returns every recorded op for `dest`'s file
     (`sameFile`, all entries, as `recordedOp`).
   - `src/config-utils.ts`: `ensureHomeBackup(fullPath, sigilOps: readonly ConfigMergeOp[])` reverses each op in turn
     (`reverseMerge`) on the parsed content; an empty result skips the backup and prints one line saying the file
     holds only sigil's entries. Invalid JSON keeps today's behaviour. Update its doc comment. If importing
     `reverseMerge` into `config-utils.ts` creates a cycle, put the content check beside the writers instead and say
     where.
   - Test: step 1's unit cases pass.

3. **Callers pass the recorded ops**, split in two (amended before step 3 ran: it touches about six files, over the
   step-size limit).

   3a. **`add` and `uninstall`** `[worker:medium]`
   - `add` (`commands/add/execute-config.ts`): `recordedOpsAt(ctx.manifest, op)`, taken before this install is
     upserted.
   - `uninstall` / `prune` (`commands/uninstall-config.ts`): `reverseMergeOneConfigFile` takes the ops recorded for
     the file, including the one being removed; `reverseMergeConfigEntries` builds them from the removed and kept
     entries. Its other caller, `commands/update-config-move.ts`, passes the moving entry's records.
   - Test: the step-1 CLI case "empty $COPILOT_HOME" passes; `npm test` passes.

   3b. **`update`** `[worker:medium]`
   - `writeMergedConfigFile` (`commands/update-config-io.ts`) takes the recorded ops; its callers
     (`update-config.ts`, `update-config-catalog.ts`, `update-config-move.ts`) pass the ops recorded for the file,
     including the fragment being replaced, threading the manifest (or a lookup built from it) down from `update`.
   - Remove the `= []` default from `ensureHomeBackup`, so a caller that passes nothing fails to compile.
   - Test: every step-1 case passes; `npm test` passes.

4. **Docs** `[worker:medium]`
   - `CLAUDE.md` config-kind invariant and `docs/reference/config-kinds.md` backup rule: a backup is taken before the
     first write to a home file that holds content sigil did not write; a file holding only sigil's entries gets
     none; a backup taken after the user edits a sigil-created file holds sigil's entries too.
   - `CHANGELOG.md` under Unreleased → Fixed, citing #103.
   - Test: `npx prettier --check` on the changed files.

5. **Retire the shipped copilot-hooks brief** `[inline: small doc edit]`
   - `docs/ideas/copilot-hooks.md` shipped in #102. Move any still-true fact not already in
     `docs/decisions/copilot-hooks-2026-10.md` there, delete the brief, and drop its row from `docs/ideas/README.md`.

## Verification

- `npm run ci:local` green.
- Manual: the issue's repro (empty `$COPILOT_HOME`, `add` then `uninstall`) leaves no `.sigil.bak`.
- PR body says "Fixes #103". Close-out: `workflow-report sigil`, `/agent-skills:review`, delete this plan after merge.
