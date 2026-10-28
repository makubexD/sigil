# Phase 1 step plan: Copilot hook target (audit row 17)

## Context

Codebase state: `master` is clean at `3ec7686` (PR #99 merged). The roadmap `docs/plan-audit-rows-15-18.md` has
Phase 0 done and the Phase 1 spike done (`docs/decisions/copilot-hooks-2026-10.md`, verdict go). The next open items
are the owner probe (which `tool_input` key Copilot sends for `create` / `edit`) and then the step plan. The owner
chose to **skip the probe and plan defensively**: step 1 makes `protect-config` accept both keys. The live check at
the end of the phase still confirms it.

Goal: `sigil add --target copilot shared/protect-config` writes a working hook for Copilot CLI and VS Code, using the
same config-kind merge machinery as Claude (`replaceMerge`, `previousOpFor`, `ensureHomeBackup` / `isHomeScopedRoot`,
`array-append` on `hooks.<Event>`).

Step plan for Phase 1 of `docs/plan-audit-rows-15-18.md`. Execute one step at a time: "execute step N of
docs/plan-audit-rows-15-18-phase1.md". Branch: `feat/copilot-hook-target`.

## Two deviations from the decision record (flagging them for your review)

1. **User scope honors `$COPILOT_HOME`.** The record fixes `~/.copilot/hooks/sigil.json`. The existing
   `copilot-home` root (`src/config-utils.ts`) already resolves `$COPILOT_HOME` → `~/.copilot` and counts as
   home-scoped, and the Copilot docs say the CLI reads `$COPILOT_HOME/hooks/`. Reusing the root means less code and
   matches the docs.
2. **`shared/worker-mode-guard` gets `platforms: [claude]`.** Its body and script are about `~/.claude`. Once `hook`
   stops being Claude-owned, it would otherwise ship to Copilot and trip `platform-path-leak`.

## Steps

1. **protect-config accepts `path`** `[worker:medium]`
   - `catalog/shared/hooks/protect-config.hook.md`: `JSON.parse(raw).tool_input.file_path` →
     `const ti = JSON.parse(raw).tool_input; file = ti.file_path ?? ti.path;`
   - `test/catalog/protect-config-hook.test.ts`: add cases. `{tool_input:{path:'.env'}}` → exit 2.
     `{tool_input:{path:'src/a.ts'}}` → exit 0. `{tool_input:{}}` → exit 0. The existing `file_path` cases stay green.
   - Test: `npm test -- --test-name-pattern protect-config`

2. **Hook bodies stay provider-neutral** `[inline: user-facing copy]`
   - `protect-config` body: drop the "Claude Code" and `.claude/settings.json` literals (generic "the agent" wording,
     scope text without provider paths). Add a "Not covered" line saying that on Copilot a hook that can't start
     **denies** the call (fail-closed), and that the cloud agent skips exec-form hooks.
   - `worker-mode-guard`: add `platforms: [claude]`.
   - Test: `npm run sigil -- sync --check` (provider-term-leak, platform-path-leak) clean.

3. **RED tests for the Copilot hook emitter** `[worker:medium]`
   - New `test/targets/copilot-hooks.test.ts` (modelled on `test/targets/config-destinations.test.ts` and
     `copilot-mcp-cli.test.ts`). `scaffoldConfig` on a hook:
     - project → `.github/hooks/sigil.json`, root `project`, fragment
       `{version:1, hooks:{PreToolUse:[{type:'command', matcher:'Edit|Write', exec:'node', args:[…]}]}}`, plus
       `timeoutSec` when `timeout` is set. Strategy: `hooks` array-append.
     - Shell form (no `args`) → `{type, matcher, command}`.
     - local → `.github/copilot/settings.local.json`, root `project`, no `version` key.
     - user → `hooks/sigil.json`, root `copilot-home`.
     - `event: Stop` / `SubagentStop` / `Notification` → throws a SigilError that names the event and says
       Copilot has no PascalCase alias for it.
   - Round trip in a temp project (`add` → `update` → `uninstall`, through the command functions): after `update`
     there is still exactly one entry. With two hooks installed, uninstalling one keeps `version: 1` and the other
     entry, and uninstalling the last one leaves no sigil entries.
   - `test/targets/capabilities.test.ts` expectation: Copilot `hook` scaffold is `native`.
   - Confirm they fail for the right reason ("only supports 'mcp' kind", capability `none`).

4. **Implement the emitter** `[worker:medium]`
   - `src/targets/copilot/config.ts`: hook destinations for each scope. Widen `resolveCopilotConfigDestination` to
     `'mcp' | 'hook'`.
   - New `src/targets/copilot/hook-ops.ts`: `buildCopilotHookOps(artifact, dest)`, the flat entry shape from decision
     §4 (`exec` / `args` / `timeoutSec`, or `command`), refusing the unaliased events.
   - `src/targets/copilot/index.ts`: `scaffoldConfig` dispatches `mcp` | `hook`. `configScopes` /
     `buildScopeDestinations` now report a separate local destination for hooks. Fix the stale "mcp only" comments.
   - `capabilities.ts`: `hook: { mode: 'native' }` (settings stays `CLAUDE_OWNED`). `src/kinds.ts`: `hook.ownedBy: []`,
     and update the comment.
   - `src/targets/doc-refs.ts`: `COPILOT_HOOKS_DOC` and `VSCODE_HOOKS_DOC`, cited in
     `src/targets/copilot/aggregate-docs.ts`.
   - Test: step 3's tests pass, and `npm test` passes.

5. **Keep `version` while hooks remain** `[inline: shared merge primitive]`
   - Two installed hooks both contribute `version: 1` (object-spread). Today `reverseMerge`
     (`src/config-merge/reverse.ts`) deletes it on the first uninstall. The fix is the smallest one that keeps the
     invariants: the Copilot op marks `version` as a file-level key that is only removed once nothing else is left,
     via an op field read by `reverseMerge` and `classifyConfigDrift`. Writing it goes through `serialize()`.
   - Test: step 3's two-hook round trip is green, and `test/config-merge.test.ts` still passes.

6. **Docs and close-out** `[worker:medium]`
   - `docs/reference/config-kinds.md`: Copilot hook scope table, fail-closed note, `$COPILOT_HOME`.
   - `npm run build` regenerates `docs/reference/capabilities.md`.
   - `CHANGELOG.md` entry. `docs/audits/2026-10-16/results.md` row 17 → `done (PR #N)`. Tick the roadmap boxes, noting
     the probe was replaced by step 1.
   - Review follow-up (step 4): `CLAUDE.md:231` and `docs/reference/spec.md:264` still say "hook/settings stay
     flagged `KindDescriptor.ownedBy` until a second target supports them". Now only `settings` is Claude-owned.
   - config-kinds.md: note that a `Stop` / `SubagentStop` / `Notification` hook aborts `add --target copilot`
     (refused, not skipped); use `platforms: [claude]`.

7. **Scope label for mixed mcp + hook selections** `[inline: user-facing copy]` (review follow-up, step 4)
   - `src/targets/copilot/target-helpers.ts` `HOOK_CONFIG_SCOPES`: the `local` option reads "settings.local.json,
     not git-committed", but with `mcp` also selected its mcp part goes to the committed `.mcp.json`. When `kinds`
     includes `mcp`, say so in the local description.
   - Test: a `configScopes(['mcp','hook'], dir)` case in `test/targets/copilot-hooks.test.ts`.

Step 5 landed as a `file-marker` `MergeStrategy` rather than an op field: the strategy map already round-trips
through the manifest, so no manifest change was needed.

## Verification

- `npm run ci:local` green (it includes `sync --check` and the capabilities staleness test).
- Manual: in a temp dir, `npm run sigil -- add --target copilot shared/protect-config` for each scope. Inspect the
  JSON, run `update` (no duplicate), then `uninstall` (clean). For user scope, check that `.sigil.bak` was written.
- Owner live check (stays open after merge): in Copilot CLI, the installed guard blocks a `.env` write.
- Close-out: `workflow-report sigil`, `/agent-skills:review`, then delete the phase step plan after merge.
