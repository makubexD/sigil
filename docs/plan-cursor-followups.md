# Plan: Cursor follow-ups (no Cursor usage needed)

Runs while Phase F waits for Cursor usage ([plan-cursor-target-f.md](plan-cursor-target-f.md) § Status). It clears review
items deferred from Phases C, D and E, and documents what Phase F's step 1 already proved. Nothing here calls Cursor.
Branch `fix/cursor-followups`, one PR. Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase F.

Out of scope: hook `matcher`s still written in Claude names and translated in `hook-ops.ts` (Phase N follow-up). That is
a vocabulary design question, not a fix.

## Regression guards (every step)

`npm test` green with no change to existing expectations outside the files a step names, and
`test/fixtures/output-snapshot/build.json` unchanged (no step changes rendered files). `npm run check` before the
step is accepted.

## Step 1 `[worker:medium]`: the nearest warning says which way the mapping went

Phase E deferred this: on Cursor, an edit agent's nearest mapping writes no `readonly` line, so the agent gets every
Cursor tool, and the warning doesn't say so.

Files: `src/targets/tool-restriction.ts`, `test/commands/tool-restriction.test.ts`.

- In `restrictionOutcome`'s `nearest` branch, when `spec.toolDialect?.kind === 'read-only-flag'` and
  `frontmatter.tools` is an array, render it with `renderTools(spec.toolDialect, <its string entries>)` and add a suffix
  after `the nearest mapping is written`:
  - `readOnly: true` → ` (read-only, so the agent loses those tools)`
  - `readOnly: false` → ` (no read-only flag, so the agent gets every tool this target has)`
- Any other case (a `names` dialect, no dialect, `tools` absent) keeps today's text exactly.
- Update the module comment's `nearest` sentence to say the warning names the direction on a `read-only-flag` target.

Cases, in the `restrictionOutcome` describe block, with a `read-only-flag` agent spec (`readOnly: [read, search]`,
`writes: [edit]`, `tools` mapped) and `toolPolicy: nearest`:

| `tools`                       | Expected `warning`                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[read, search, shell]`       | `this tool cannot express tools tool(s) shell exactly; the nearest mapping is written (read-only, so the agent loses those tools)`                             |
| `[read, search, edit, shell]` | `this tool cannot express tools tool(s) edit, shell exactly; the nearest mapping is written (no read-only flag, so the agent gets every tool this target has)` |
| `[read, search]`              | outcome `exact` (unchanged)                                                                                                                                    |

Plus: the existing `names`-dialect `nearest` test passes unchanged (no suffix). Test: `npm test`.

## Step 2 `[worker:medium]`: the scope refusal names the scope that is missing

Phase D deferred this: `destinationFor` always says "no personal per-project", which is wrong when a target omits the
`project` or `user` scope instead.

Files: `src/targets/config-kind-table.ts`, `test/targets/config-kind-table.test.ts`.

- In `destinationFor`, pick the phrase by `scope`: `local` → `personal per-project`, `project` → `project`, `user` →
  `user-level`. The message stays `` `${targetName} has no ${phrase} ${kind} file — install at ${scopeChoices(writer)}.` ``.

| Case                                                                    | Expected message                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| The existing test (`hook`, `local`, `Cursor`)                           | unchanged, byte for byte                                                        |
| A hook writer listing only `project`, asked for `user`, target `Cursor` | starts with `Cursor has no user-level hook file — install at 'project' scope (` |
| A hook writer listing only `user`, asked for `project`, target `Codex`  | starts with `Codex has no project hook file — install at 'user' scope (`        |

Test: `npm test`.

## Step 3 `[worker:medium]`: the wizard stops counting a config artifact the target can't render

Phase C deferred this: the add wizard's artifact list and pack hints count a hook whose `configSkipReason` refuses it
on the chosen target. `add` itself already skips it (`plan-ids.ts` passes `skipReason`).

Files: `src/wizard/steps/add/state.ts`, `src/wizard/steps/add/options.ts`, `test/targets/capabilities.test.ts`.

- `visibleArtifacts`: keep an artifact only when `isInstallable(ct, a.kind)` and `ct.configSkipReason?.(a) === undefined`.
- `resolvePackIds` gains a `target: Target | undefined` parameter and passes
  `skipReason: a => target?.configSkipReason?.(a)` to `resolveSelection`, the way `src/commands/add/plan-ids.ts` does, so a
  refused artifact is not in `ids`. `packContentHint` passes its `target` through.
- Add the cases to the `add wizard — visibleArtifacts follows the chosen target` describe block. Use a copy of a real
  target with `configSkipReason` overridden to refuse one catalog hook id (`{ ...target, configSkipReason: a => a.id ===
<id> ? 'probe' : undefined }`), so no real target's behavior is assumed:

| Case                                                            | Expected                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `visibleArtifacts` with the refusing target                     | excludes that hook; every other artifact still listed       |
| `visibleArtifacts` with the unmodified target                   | unchanged from today                                        |
| `packContentHint` for a pack holding that hook, refusing target | its hook count is one lower than with the unmodified target |
| `packContentHint` with `target` undefined                       | unchanged from today                                        |

Test: `npm test`.

## Step 4 `[inline: debugging, the bug may already be gone]`: `update` after a hook becomes unrenderable

Phase C deferred this: `update` throws, rather than skips, when a catalog hook becomes unrenderable on the target after it
was installed. `catalogConfigOps` (`src/freshness.ts`) now catches a scaffold failure per scope and restores the recorded
fragment, so this may already hold.

- Write the test first in `test/commands/update-config.test.ts`: install a hook for `cursor` from a fixture catalog,
  change the fixture so `configSkipReason` refuses it (or so its scaffold throws), run `update`.
- Expected: `update` exits 0, leaves `.cursor/hooks.json` byte-identical, and prints the skip reason once.
- If it passes already, keep the test as the guard, and say so in the commit. If it fails, fix it the way Codex did
  (skip with the reason, never throw) and name the root cause in the commit.

## Step 5 `[inline: user-facing copy]`: docs

- `docs/setup/cursor.md`: rename `## Skills Cursor already reads` to `## What Cursor already reads from Claude Code`,
  adding Phase F step 1's facts. A Claude Code plugin installed at user or project scope reaches Cursor with its
  skills (inlined rules included) and its agents. Its hooks did not fire. Cursor ignores a Claude agent's `tools:`
  list, so a sigil reviewer from the Claude plugin can edit files in Cursor. For Cursor, install agents with
  `sigil add --target cursor`, which writes `readonly: true` (one run each, CLI `2026.10.22-27dcf5f`; link the ADR §
  Phase F probes).
- `docs/setup/cursor.md` § Agents: the new warning text from step 1, if the section quotes or describes it.
- `docs/reference/troubleshooting.md`: one entry for the step 2 message, only if the old message is quoted there.
- `npx prettier --write` on the touched docs; `npm run check` green.
