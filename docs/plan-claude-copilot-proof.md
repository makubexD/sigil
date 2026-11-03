# Plan: Claude and Copilot first-class proof

The owner's priority order is Claude, then Copilot, then Antigravity, then OpenCode; the rest wait for a license.
Antigravity is shipped (v0.6.0). Claude and Copilot are built, but parts of them were never proven where a new user
would start. This plan closes what is left in the queue for those two targets before the OpenCode eval begins.

Sources: [distribution-channels ADR](decisions/distribution-channels-2026-09.md) § 6 (phases 1b and 1c open, 2b
"left open", B5), [copilot-plugin-channel](decisions/copilot-plugin-channel-2026-10.md) § Scope and open questions,
[setup/claude-code.md](setup/claude-code.md), [setup/copilot.md](setup/copilot.md).

## What is open

| Item                                             | Target          | Today                                                                                |
| ------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------ |
| Marketplace install on a clean machine           | Claude          | Only on the owner's machine (v0.3.0, 2026-10-30)                                     |
| `sigil add` from a fresh clone, full lifecycle   | Claude, Copilot | Only from the dev clone                                                              |
| `.env` write through Copilot's `create` / `edit` | Copilot         | Untested live; `apply_patch` was denied (2026-10-31)                                 |
| Complement reader on a real plugin install (B5)  | Copilot         | Docs only: `~/.copilot/installed-plugins/` was empty                                 |
| Marketplace install in VS Code                   | Copilot         | Untested: VS Code runs used a local clone                                            |
| Skill description budget                         | Copilot         | Unknown: the docs read didn't say                                                    |
| Cloud agent installs from a repo marketplace     | Copilot         | Untested                                                                             |
| Phase 1b `sigil cost`                            | Claude first    | Not built; `scripts/rule-load.cjs` measures rule bytes only                          |
| Phase 1c rich skill packaging                    | all             | Partly done (stack references); `assets/`, `scripts/`, rules as references not built |

Out of scope: npm first-publish (last in the backlog), Cursor, Codex agents, OpenCode (next plan).

## Decisions

1. **Clean machine = a podman container** (`docker.io/library/node:24`, podman is installed), with Claude Code and
   Copilot CLI installed from npm inside it. It proves install and file layout without auth. Live model sessions run on
   the owner's machine in a fresh scratch repo, because they need the owner's sign-in. If a CLI refuses a plugin
   command without auth, record that and fall back to a fresh `CLAUDE_CONFIG_DIR` on the host for that case.
2. **Every live result lands in the repo** (setup doc, ADR § 6, copilot-plugin-channel open questions) in the same PR
   as the step that produced it. No result lives only in a PR body.
3. **1b and 1c end in a recorded go or no-go**, not code. A go gets its own step plan.
4. All steps are `[inline]` (live probes, decisions or user-facing docs) except step 3, a code fix found by step 2.

## Steps

## Step 1: Claude marketplace in a clean container `[inline: live probe]`

In a scratch dir, run `podman run --rm -it docker.io/library/node:24 bash`; inside: `npm i -g @anthropic-ai/claude-code`,
`git init /w && cd /w`, then the commands from `setup/claude-code.md` as written.

| Case | Command                                                            | Expected                                                                              |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1a   | `claude plugin marketplace add makubexD/sigil#marketplace`         | Marketplace `sigil` added, 21 plugins                                                 |
| 1b   | `claude plugin install typescript-starter@sigil --scope project`   | Installs; its dependencies install too; `.claude/settings.json` gets `enabledPlugins` |
| 1c   | `claude plugin install hook-protect-config@sigil --scope project`  | Installs; `enabledPlugins` has both                                                   |
| 1d   | `claude plugin uninstall typescript-starter@sigil --scope project` | Removed from `enabledPlugins`; cache cleaned or documented                            |
| 1e   | Any command that needs auth                                        | Recorded as "needs sign-in", not a failure                                            |

Then on the host, in a fresh `git init` scratch repo with the owner's sign-in: install `typescript-starter` and
`hook-protect-config` at project scope, run `claude -p` asking for one plugin skill by slash name, and ask it to write
`.env`. Expected: the skill answers, the `.env` write is denied.

## Step 2: `sigil add` from a fresh clone, full lifecycle `[inline: live probe]`

In the container from step 1 (or a second one): `git clone https://github.com/makubexD/sigil`, then the README
§ Install steps exactly (`npm ci`, `npm run build`, `npm link`). In a fresh `git init` project:

| Case | Command                                                                             | Expected                                                    |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 2a   | `sigil init` path from README (non-interactive flags)                               | Manifest written, no error                                  |
| 2b   | `sigil add` one pack `--target claude-code --yes`                                   | Rules, skills, agents under `.claude/`; manifest lists them |
| 2c   | Same pack `--target copilot --yes`                                                  | Files under `.github/`; both targets in the manifest        |
| 2d   | `sigil add hook:shared/protect-config mcp:shared/filesystem --target copilot --yes` | `.github/hooks/sigil.json`, `.mcp.json`                     |
| 2e   | `sigil status`                                                                      | Every entry `intact`                                        |
| 2f   | Edit one installed rule, `sigil status`, `sigil update`                             | `modified`; update refuses without `--force`                |
| 2g   | `sigil uninstall --all --yes` (or the documented form)                              | No sigil file left; user-owned JSON intact                  |

Any README step that fails or needs an unwritten step is a doc bug: fix it in step 7.

## Step 3: `update --force` restores an edited file whose catalog content is unchanged `[worker:medium]`

Found in step 2 (v0.8.0, fresh clone): after a hand edit to an installed rule, `sigil status` says "To replace them
with the catalog version: sigil update --force", but `sigil update --force --yes` prints `(already up-to-date)` and
keeps the edit, with or without the id. Cause: `classifyFreshFile` in `src/commands/update-wholefile.ts` returns
`'unchanged'` when the fresh render's hash equals the recorded hash, before it looks at the file on disk or at
`opts.force`.

Change, `src/commands/update-wholefile.ts` only: in `classifyFreshFile`, when the fresh hash equals the recorded hash,
return `'write'` if `opts.force` is set and `isFileDrifted(fullPath, recordedHash)` is true; otherwise `'unchanged'` as
today. Leave the non-force path and every other function unchanged. Update the doc comment above it.

Tests, `test/commands/update-wholefile.test.ts`, in `describe('updateWholeFileEntry')`, same helpers as the existing
cases:

| Case | Setup                                                                                                | Expected                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 3a   | Disk `hand-edited by the user`; fresh render and recorded hash both `catalog content`; `force: true` | `updated` true; disk is `catalog content`                                    |
| 3b   | Same, `force: false`                                                                                 | `updated` false; `skippedDriftCount` 0; disk still `hand-edited by the user` |
| 3c   | Same as 3a with `dryRun: true`                                                                       | `updated` false, `pending` true; disk unchanged                              |

3a and 3c fail before the change. Test: `npm run build && node --test test-compiled/commands/update-wholefile.test.js`,
then `npm test`.

## Step 4: Copilot `.env` through `create` and `edit` `[inline: live probe]`

On the host, scratch repo from step 2's layout (`hook:shared/protect-config --target copilot`), `copilot --trust-folder -p`
with a free or included model.

| Case | Prompt                                       | Expected                   |
| ---- | -------------------------------------------- | -------------------------- |
| 3a   | Create `.env` with the `create` tool         | Denied by `protect-config` |
| 3b   | Edit an existing `.env` with the `edit` tool | Denied                     |
| 3c   | Create `notes.txt`                           | Allowed (control)          |

If 3a or 3b is allowed, stop and report: that is a hook bug, not a doc fix.

## Step 5: Copilot complement reader on a real install (B5) `[inline: live probe]`

On the host: `copilot plugin marketplace add makubexD/sigil#marketplace`, `copilot plugin install typescript-tooling@sigil`.

| Case | Check                                                     | Expected                                                    |
| ---- | --------------------------------------------------------- | ----------------------------------------------------------- |
| 4a   | `ls ~/.copilot/installed-plugins/sigil/`                  | A `typescript-tooling` folder, layout as the reader assumes |
| 4b   | `sigil add` a skill that plugin holds, `--target copilot` | Warns the plugin already delivers it, still installs        |
| 4c   | Same with `--complement`                                  | Skipped with cause `plugin`                                 |
| 4d   | `sigil status --json`                                     | That entry carries `plugin`                                 |
| 4e   | `copilot plugin uninstall typescript-tooling@sigil`       | Folder gone; leftover marketplace state recorded            |

If 4a's layout differs from the reader, stop: the reader fix gets its own step.

## Step 6: Copilot open questions `[inline: owner GUI + docs]`

- 5a, VS Code (owner, GUI): set `chat.plugins.enabled`, add `"makubexD/sigil#marketplace"` to
  `chat.plugins.marketplaces`, install `typescript-tooling` from **Customize**, run one skill. Expected: it runs.
- 5b, description budget: re-read the Copilot skills docs (CLI and VS Code). Record the limit if documented, else
  "undocumented" with the date. No probe.
- 5c, cloud agent: optional, owner's call (it spends premium requests). If skipped, record "not tested, by choice".

## Step 7: Record results `[inline: user-facing docs]`

Update `docs/setup/claude-code.md` and `docs/setup/copilot.md` (drop "wasn't tested" lines that are now tested, fix
any README/install gap from step 2), ADR § 6 (clean-machine and B5 results), and
`copilot-plugin-channel-2026-10.md` § Scope and open questions. Test: `npm run check` and `npx prettier --check docs`.

## Step 8: Phase 1b decision: `sigil cost` `[inline: design]`

Measure what an install costs per session today, from built output, for one pack per language on Claude:
always-on (skill and agent descriptions, repo-wide rules), on-match (path-scoped rules, which `rule-load.cjs` already
counts), on-invoke (`SKILL.md` + references). Decide whether a `sigil cost` command adds value beyond `rule-load` and
`provider-limits`. Record go or no-go with the numbers in ADR § 6. A go writes `docs/plan-sigil-cost.md` (not built here).

## Step 9: Phase 1c decision: rich skill packaging `[inline: design]`

List catalog skills that would use `assets/` or `scripts/`, and the token saving of rules as on-demand references
(numbers from step 8). Record go, narrowed go or no-go in ADR § 6; update the roadmap row either way.

## Step 10: Review the branch `[inline: review]`

`/agent-skills:review` of the whole branch, one round of fixes (steps 11 and 12). Done 2026-11-03: approved.

## Review fixes

## Step 11: `update` records a skipped user edit as the baseline `[worker:medium]`

Found by the step 10 review, already on master: `rebuildEntryFiles` (`src/commands/update-stale.ts`) records the
on-disk hash for every freshly rendered path, including a drifted file that `update` skipped or left unchanged. The
next plain `sigil update` then sees no drift and overwrites the user's edit, and `--force` can no longer restore it.

Change, `src/commands/update-stale.ts` and its one caller `writeAndRefreshEntry` in `src/commands/update-wholefile.ts`:
`rebuildEntryFiles` takes the written map (`toWrite: Record<string, string>`) as a new parameter. For each fresh path:
written → `sha256(toWrite[path])`; not written and a hash was recorded → keep the recorded hash; not written and none
recorded → the disk hash if the file exists, else `''` (today's fallback). Kept-stale carry-over is unchanged. Update
the doc comment. CHANGELOG `### Fixed` gets a line: a plain `sigil update` no longer overwrites a file you edited on
the run after it skipped that file.

Tests, `test/commands/update-wholefile.test.ts`, in `describe('updateWholeFileEntry')`, an entry with two files
`a.md` and `b.md`:

| Case | Setup                                                                                                           | Expected                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 11a  | Recorded `a v1`, `b v1`; disk `a.md` = `USER EDIT`, `b.md` = `b v1`; render `a v2`, `b v2`; no force; run twice | After each run `a.md` is `USER EDIT`; recorded `a.md` hash stays `sha256('a v1')`; recorded `b.md` hash is `sha256('b v2')` |
| 11b  | Recorded `a v2`, `b v2`; disk `a.md` = `USER EDIT`; render `a v2`, `b v3`; no force                             | `a.md` still `USER EDIT`; recorded `a.md` hash stays `sha256('a v2')`; `b.md` is `b v3`                                     |
| 11c  | Continue 11b with `force: true`, same render                                                                    | `a.md` is `a v2`                                                                                                            |

11a and 11b fail before the change. Test: `npm run build && npm run build:test && node --test
test-compiled/commands/update-wholefile.test.js`, then `npm test`.

## Step 12: Review doc fixes `[inline: user-facing docs]`

From the step 10 review: in `docs/decisions/copilot-plugin-channel-2026-10.md` (the "Answered 2026-11-03" paragraph),
say that the plugin-level `name` / `description` caps aren't checked (`plugin.json` is not a `KindEmitSpec`; longest pack
description is 522 characters); in `docs/setup/copilot.md` § Limits, reword to "`protect-config`'s `create` / `edit`
case wasn't reached on that plan"; in `docs/setup/claude-code.md` § Remove, mention `claude plugin prune --dry-run`
first and `-y` outside a terminal. Not fixed, recorded as a follow-up: the guided update and the wizard's Update can't
offer to restore an edited file whose catalog text is unchanged (it classifies `unchanged`, not `skip-drifted`).

## Step 13: Close out `[inline: release]`

PR with every step, `pr-ready`, merge. Delete this plan in a follow-up PR. Update memory: the next item is the OpenCode
eval plan.
