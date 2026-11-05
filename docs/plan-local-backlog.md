# Plan: what this machine can finish

**Done 2026-11-04:** all nine steps are merged with this branch.

Everything here runs on this machine, with DeepSeek through `mk-exec`, the paid DeepSeek API, and free OpenCode and
Antigravity models. It uses Claude only for planning and review. Every item was checked against the code on 2026-11-04.

**Already fixed, so left out:** the quadratic trust patterns (under 100 ms on 64 KiB hostile lines), the YAML-escaped trust
scan, `rules/README.md` aborting an import, duplicate ids on import, `sigil check --trust` in CI, the wizard's pack hints,
and the status note for a refused hook.

**Parked, each for a reason:**

| Item                                   | Needs                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| Real `shared/ado` call                 | A personal machine and a personal Azure DevOps org                 |
| Cursor F, and Cursor's desktop check   | Cursor usage; the desktop check also needs Windows                 |
| Copilot `.env` through `create`/`edit` | A paid plan: Copilot Free offers only `apply_patch`                |
| `plugin-rules-as-references` eval      | Spare Claude quota (branch `docs/plan-plugin-rules-as-references`) |
| npm first-publish                      | The owner's decision; stays last                                   |

Steps run in order. Each live step passes its key only to an isolated home, as in the opencode ADR's D0, and never touches
`~/.config/opencode/` or `~/.gemini`. Delete isolated homes before `ci:local`: `/tmp` is a small tmpfs that the tests also use.

## Step 1: Guided update restores an edited file `[worker:medium]`

Files: `src/commands/update-wholefile.ts`, `src/commands/update.ts`, `src/commands/update-guided.ts`,
`test/commands/update-guided.test.ts`, `docs/guides/consuming.md`.

Today an edited file whose catalog text is unchanged gets the `unchanged` verdict (`update-wholefile.ts:70`), so the guided
update and the wizard's Update never offer the restore that `update --force` does. Without `--force`, count such a file as
drifted in `UpdateRunTotals.skippedDrift`. `nothingToApply` and the `force` choice already read that total, so the guided
flow then offers the restore with no change of its own. Update the sentence at `docs/guides/consuming.md:357-359`.

| Case                                            | Expected                                          |
| ----------------------------------------------- | ------------------------------------------------- |
| Edited file, unchanged catalog, guided preview  | `skippedDrift` 1, the replace choice is offered   |
| Same, choose the replace option                 | File restored                                     |
| Same, choose plain apply                        | File keeps the edit                               |
| No edits, unchanged catalog                     | "Everything is already up to date"                |
| `update --yes` on the edited file, no `--force` | File keeps the edit, summary counts it as skipped |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/update-guided.test.js`, then the same with
`test-compiled/commands/update-config.test.js`.

## Step 2: OpenCode Boundary stops saying "delegate" `[worker:medium]`

Files: `src/targets/shared/boundary.ts`, `src/targets/opencode/spec/agent.ts`, `test/targets/opencode-agent.test.ts`.

`## Boundary` tells an agent to delegate to co-installed agents, but on OpenCode `'*': deny` blocks `task` for every agent
that doesn't list the `agent` tool. Adding `task` would widen an authored restriction, so change the words only. Add an
optional `escalatesHeading` parameter to `renderBoundarySection`. OpenCode's spec passes
`Name these co-installed agents in your report, so the caller can hand the work over:` when the agent doesn't list `agent`.
Every other target keeps today's heading.

| Case                                                   | Expected                   |
| ------------------------------------------------------ | -------------------------- |
| OpenCode agent without `agent`, with an `escalates-to` | New heading                |
| OpenCode agent that lists `agent`                      | Today's "Delegate" heading |
| Cursor agent, same input                               | Today's "Delegate" heading |
| `complements` and `see-also` groups on OpenCode        | Unchanged                  |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-agent.test.js`, then check that
`dist/claude/` is byte-identical before and after with `npm run catalog:build`.

## Step 3: Check prompts sent as plugin skills against skill limits `[worker:medium]`

Files: `src/targets/claude-code/spec/skill.ts`, `src/targets/claude-code/spec/prompt.ts`, `test/` for `provider-limits`.

`CLAUDE_PLUGIN_PROMPT_SPEC` ships a prompt as a plugin skill, but it declares no `limits`, so `provider-limits` skips it.
Export the skill spec's `limits` array as `CLAUDE_SKILL_LIMITS` and use it in both specs. If a catalog prompt then fails, stop
and report: shortening prose is an author's call.

| Case                                            | Expected                |
| ----------------------------------------------- | ----------------------- |
| Plugin prompt with a description past the limit | `provider-limits` error |
| Plugin prompt within limits                     | No finding              |
| Scaffold prompt past the limit                  | No finding, as today    |
| The real catalog                                | No new finding          |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/provider-limits.test.js &&
node dist-cli/cli.js sync --check`.

## Step 4: Remove the unused allow file `[worker:medium]`

Files: `src/trust/scan/allowlist.ts`, `src/trust/scan/index.ts`, `test/trust-scan.test.ts`.

Nothing outside its own test calls `loadAllowlist`, so `.sigil/allow.json` looks like a feature and does nothing. Delete the
loader, its export and its tests. The inline allowlist and the `Set` parameter on the scanner stay, with their tests.

| Case                                                        | Expected     |
| ----------------------------------------------------------- | ------------ |
| `grep -rn "loadAllowlist\|allow.json" src test docs/guides` | No hits      |
| Inline allowlist tests                                      | Still pass   |
| External `Set` allowlist test                               | Still passes |

Test: `npm run build && npm run build:test && node --test test-compiled/trust-scan.test.js`.

## Step 5: Small text and coverage fixes `[worker:medium]`

Files: `catalog/shared/prompts/author-artifact.prompt.md`, its output snapshot, `README.md`, `test/commands/add-overlaps.test.ts`.

- `author-artifact`: "add a new artifact to the sigil" becomes "add a new artifact to the sigil catalog", and the body's
  `# Author a New Catalog Artifact` line goes if the rendered prompt shows the title twice.
- `README.md`: an install `<details>` block for OpenCode, in the same shape as the other targets' blocks.
- A test where one refused selector holds a skill and an agent: both are named in the refusal.

Test: `npm run build && npm run build:test && node --test test-compiled/commands/add-overlaps.test.js && npm run format:check`.

## Step 6: OpenCode 2 checks left in the setup note `[inline: live check measures OpenCode]`

Files: `docs/setup/opencode.md`, `docs/decisions/opencode-target-2026-11.md`.

On `@opencode/cli` with `deepseek/deepseek-flash`, as in the ADR's Phase F run:

- The same skill with a different body in `.agents/skills/` and `.claude/skills/`: which body the model gets.
- A skill with `disable-model-invocation: true`: whether the model can pick it on its own.
- `skill` under `'*': deny`: whether a locked agent can really load a skill, or the model's report in Phase F was wrong.
  Correct the setup note's claim either way.

Test: a dated row per case in the ADR, each with a control.

## Step 7: Antigravity live check `[inline: live check measures Antigravity]`

Files: `docs/setup/antigravity.md`, `docs/decisions/antigravity-target-2026-11.md`.

`npm run probe:antigravity` first, for loader drift on `agy` 1.4.12. Then try one model call from a scratch folder. If a free
model answers, check a skill picked by description, and an installed hook blocking a `.env` write, with a control write. If
none answers, record that and stop this step: it blocks nothing.

Test: probe output OK, and a dated row in the ADR.

## Step 8: Codex real-model check `[inline: live check measures Codex]`

Files: `docs/setup/codex.md`, `docs/decisions/codex-target-2026-10.md`.

Codex has only been probed against a mock model. Try DeepSeek as a custom provider from an isolated `CODEX_HOME`, one call
first. If it answers, check a skill picked by description. If Codex refuses the API, record the error and stop this step:
it blocks nothing.

Test: a dated row in the ADR with the result or the error.

## Step 9: Fix the stale brief `[inline: docs judgment]`

Files: `docs/ideas/cursor-target.md`, `docs/ideas/README.md`, `CHANGELOG.md`.

`cursor-target.md` still says no Cursor target exists. Replace its evidence with a pointer to `docs/plan-cursor-target.md` and
what's left (F and G), and add a status to its row in the README. Add the CHANGELOG lines for steps 1 to 5.

Test: `npx prettier --check docs/ideas/cursor-target.md docs/ideas/README.md CHANGELOG.md`.
