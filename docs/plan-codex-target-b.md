# Plan: Codex target, Phase B (skills and `AGENTS.md`)

Roadmap: [plan-codex-target](plan-codex-target.md). Probe results:
[codex-target-2026-10](decisions/codex-target-2026-10.md).

## Step 1 `[worker:medium]`: the target folder

Files: new `src/targets/codex/{capabilities,doc-refs,lexicon,metadata,index}.ts`, `spec/{index,skill}.ts`, and
`src/targets/index.ts`.

Copy `src/targets/agents-standard/` and rename `AGENTS_STANDARD` to `CODEX`, with `name = 'codex'`,
`displayName = 'OpenAI Codex'`. Keep every lexicon value and the skill spec's frontmatter, body, forbidden keys and limits
identical, so the two targets render byte-identical skills. Register it after `AgentsStandardTarget` and export it.

- `doc-refs.ts`, `verifiedOn: '2026-10-31'`: `CODEX_SKILLS_DOC` (`https://learn.chatgpt.com/docs/build-skills`),
  `CODEX_AGENTS_MD_DOC` (`https://learn.chatgpt.com/docs/agent-configuration/agents-md`), `CODEX_SUBAGENTS_DOC`
  (`https://learn.chatgpt.com/docs/agent-configuration/subagents`), `CODEX_CUSTOM_PROMPTS_DOC`
  (`https://learn.chatgpt.com/docs/custom-prompts`).
- The spec's and lexicon's `docs` use these, and `aggregateDocs` cites `CODEX_AGENTS_MD_DOC`.
- `skill` native; `rule` via inline, citing `CODEX_SKILLS_DOC`; `agent` none, reason "a Codex agent file can't restrict
  tools, so a catalog agent would gain every tool", citing `CODEX_SUBAGENTS_DOC`; `prompt` none, reason "Codex custom
  prompts are deprecated in favor of skills", citing `CODEX_CUSTOM_PROMPTS_DOC`; `workflow` none, "Codex has no
  workflow file"; `mcp` none, "not built yet: needs a TOML writer"; `hook` none, "not built yet"; `settings` none,
  "this kind's schema is Claude Code's own vocabulary"; `template` `TEMPLATE_NOT_EMITTED`.
- Hints: `installHint = 'writes to .agents/skills/'`; `afterInstallHint` says Codex picks up skills in its next session,
  and that `agents-standard` writes the same files.
- `projectMarkers: ['.codex']`, `initDirs: ['.agents/skills']`. Don't declare `alsoLoads`: the path Codex shares with
  `agents-standard` is the same file, so nothing loads twice.

Test: `npm run build && npm run validate`, then `npm run sigil -- sync --check`. `npm test` will fail only on generated
docs and hand-listed targets, which step 3 fixes.

## Step 2 `[worker:medium]`: two targets, one path

Files: `src/manifest/mutate-remove.ts`, `src/cli-helpers.ts`, `src/targets/copilot/index.ts`, new
`test/targets/codex.test.ts`.

- `removeEntries`: keep a path that any remaining entry owns, whatever its target.
- `partitionFiles`: a file that exists with identical content goes to `toWrite`, not `conflicting`.
- Copilot `alsoLoads`: add `'codex'` to the skill row.

Test cases, in `test/targets/codex.test.ts`, modelled on `test/targets/agents-standard.test.ts`:

| Case                                                                  | Expected                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `scaffold` of `typescript/ts-generate-tests`                          | Same bytes as `agents-standard`, for every file             |
| `add` for `agents-standard`, then `add` of the same skill for `codex` | No conflict; both have manifest entries                     |
| Then uninstall the `agents-standard` entry                            | `SKILL.md` stays on disk                                    |
| Then uninstall the `codex` entry                                      | `SKILL.md` is gone                                          |
| `add` over a file with different content                              | Still a conflict; file unchanged                            |
| `resolveSelection` of an agent for `codex`                            | Goes to `skipped[]` with the subagent reason                |
| `compile` on the catalog                                              | Writes `AGENTS.md` and `.agents/skills/`; no `.codex/` file |

Test: `npm test`. RED before the source change on the path cases.

## Step 3 `[inline: user-facing copy]`: docs and generated files

`docs/setup/codex.md`, README target list and Quick Start `<details>`, `docs/reference/spec.md`, `docs/guides/operations.md`,
`docs/guides/authoring.md`, `docs/index.md`, the `CLAUDE.md` conflict-handling invariant, `CHANGELOG.md`, generated
`capabilities.md` and `cli-flags.md`, and any test that hand-lists targets.

The setup page covers trust (an untrusted project drops `AGENTS.md` and project config, not skills), the skill listing
budget, that agents and prompts are skipped and why, and that no real model was tested.

Test: `npm run ci:local`, then the mock probe with a real catalog skill installed by `sigil add --target codex`.
