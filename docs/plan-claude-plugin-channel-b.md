# Plan: prompts as plugin skills (Phase B of `plan-claude-plugin-channel.md`)

Branch: `feat/plugin-prompts-as-skills`. One PR.

## What was checked (2026-10-30)

- The catalog has two prompts, `shared/explain-diff` and `shared/author-artifact`. Both are in `essentials` and no other
  pack, and `*-tooling` packs select by language, so only `essentials` changes.
- `CLAUDE_PROMPT_SPEC.outputPath` ignores `packName` and always writes `.claude/skills/…`, so flipping the capability
  row alone would write prompts outside the plugin folder. `CLAUDE_WORKFLOW_SPEC` already handles `packName`; the
  catalog has no workflows, so that path is unused, but it is correct.
- A plugin skill's command is `/<plugin>:<name>`, so the slug's `shared-` prefix would give
  `/essentials:shared-explain-diff`.
- `{{name}}` becomes `$name` through `bodyTransform`, and `disable-model-invocation: true` keeps prompts user-invoked.
  Both carry over if the plugin variant spreads the scaffold spec.
- `checkOutputContract` matches the first pattern, so `CLAUDE_PLUGIN_SKILL_SPEC` validates plugin prompts, as it would
  plugin workflows. Its keys agree. The prompt spec's `{{` body check is not enforced that way, so step 1 asserts it.

## Decisions

1. **Plugin prompts drop only the `shared/` prefix:** `shared/explain-diff` → `/essentials:explain-diff`, and a language
   prompt keeps its language: `csharp/deploy` → `csharp-deploy`. That stays unique, and the plugin prefix does the rest.
   `sigil add` keeps `shared-explain-diff`, because a scaffolded skill has no namespace.
2. **`essentials` carries only its two prompts in a plugin**, and that stays true after Phase C, where the MCP server and
   hooks get their own plugins. Its description says so in `packs.yaml`, the way `deepseek-worker` already does, so no
   new plugin-only description field.
3. **Variants, as in Phase A:** `CLAUDE_PROMPT_SPEC` keeps its name and becomes `variant: 'scaffold'`, and
   `CLAUDE_PLUGIN_PROMPT_SPEC` spreads it. `spec/workflow.ts` is left alone.

## Steps

### Step 1 `[worker:medium]`: RED tests

File: `test/targets/plugin-prompts.test.ts` (new). Compile with `new ClaudeCodeTarget().compile(resolved, { version, packs })`,
using the bundled catalog and the real packs (`loadBundledCatalog` from `test/helpers/catalog`, `parsePacksConfig` or
whatever `test/targets/claude-code.test.ts` uses for its `compilePacks` helper; copy that approach).

| #   | Case                       | Expected                                                                                                                                                         | Before step 3 |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | prompts land in the plugin | `plugins/essentials/skills/explain-diff/SKILL.md` and `plugins/essentials/skills/author-artifact/SKILL.md` exist                                                 | fails         |
| 2   | the name loses `shared-`   | explain-diff's frontmatter has `name: explain-diff`                                                                                                              | fails         |
| 3   | user-invoked, with args    | same file has `disable-model-invocation: true`, an `argument-hint:` line, and `arguments:` listing `diff` and `audience`                                         | fails         |
| 4   | placeholders translated    | same file's body contains `$diff` and no `{{`                                                                                                                    | fails         |
| 5   | nothing leaks outside      | no compiled key starts with `.claude/`, and none contains `shared-explain-diff`                                                                                  | passes        |
| 6   | only the prompts ship      | the keys under `plugins/essentials/` are exactly `.claude-plugin/plugin.json` and those two `SKILL.md` files                                                     | fails         |
| 7   | the marketplace lists it   | `.claude-plugin/marketplace.json` has a plugin named `essentials`                                                                                                | fails         |
| 8   | no other plugin changes    | no key under any other `plugins/<name>/` contains `explain-diff` or `author-artifact`                                                                            | passes        |
| 9   | scaffold names unchanged   | `target.scaffold('shared/explain-diff', resolved, { projectDir: '/fake' })` gives `.claude/skills/shared-explain-diff/SKILL.md` with `name: shared-explain-diff` | passes        |
| 10  | each channel has a spec    | `specFor(CLAUDE_EMIT_SPECS, 'prompt', 'plugin')?.variant` is `'plugin'`; with `'scaffold'` it is `'scaffold'`                                                    | fails         |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-prompts.test.js`.
Expected: 1-4, 6, 7, 10 fail on their assertions, not on setup; 5, 8, 9 pass. Commit the tests with step 3.

### Step 2 `[worker:medium]`: the plugin prompt spec

Files: `src/targets/claude-code/spec/prompt.ts`, `src/targets/claude-code/spec/index.ts`.

- Add `pluginSlugOf(id)`: drop a leading `shared/`, then replace `/` with `-`.
- `CLAUDE_PROMPT_SPEC` gains `variant: 'scaffold'`.
- `CLAUDE_PLUGIN_PROMPT_SPEC` spreads it, with `variant: 'plugin'`, a name mapping using `pluginSlugOf`, the other
  frontmatter mappings unchanged, `outputPath` returning `plugins/${ctx.packName}/skills/${pluginSlugOf(artifact.id)}/SKILL.md`,
  and `pathPattern: /plugins\/[^/]+\/skills\/.*\/SKILL\.md$/`.
- List it before `CLAUDE_PROMPT_SPEC` in `CLAUDE_EMIT_SPECS`, after the skill specs.
- Extend the header comment and its contract routing note to cover the plugin variant.

Nothing emits it yet, because the capability row is still `none`. Test: same command. Expected: only case 10 turns
green. Then `npx eslint` on both files.

### Step 3 `[worker:medium]`: turn it on

Files: `src/targets/claude-code/capabilities.ts`, `src/targets/claude-code/plugin-assemble.ts`, `packs.yaml`,
`test/targets/claude-code.test.ts`, `test/targets/capabilities.test.ts`, plus the generated
`docs/reference/capabilities.md` and `test/fixtures/output-snapshot/build.json`.

- `capabilities.ts`: `prompt: { mode: 'native' }` on the plugin channel.
- `plugin-assemble.ts`: add `'prompt'` to `WRITABLE_PLUGIN_KINDS`, read `members('prompt')` in `buildPlugin`, and pass
  those to `writeMemberFiles` after workflows. Update the comments that list what plugins carry, including
  `hasPluginMembers`.
- `packs.yaml`, `essentials` description: append
  `The Claude plugin carries only the two commands; the MCP server and hooks install with sigil add.`
- `claude-code.test.ts:359`: the assertion flips to `essentials` being listed, with a message saying its plugin carries
  the two prompts.
- `capabilities.test.ts`: add `prompt` to the plugin expectations at lines 54-63, and update the header comment.
- Run `npm run build` (regenerates `capabilities.md`), then `npm run snapshot:update`.

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-prompts.test.js test-compiled/targets/claude-code.test.js test-compiled/targets/capabilities.test.js test-compiled/targets/output-contract.test.js test-compiled/targets/emit-files.test.js test-compiled/targets/output-snapshot.test.js && node dist-cli/cli.js sync --check`.
Expected: all pass, and `sync --check` reports no errors. The snapshot diff may only touch `plugins/essentials/` and
`.claude-plugin/marketplace.json`, plus the registry if it records descriptions.

### Step 4 `[worker:medium]`: user docs

Files: `docs/setup/claude-code.md`, `docs/guides/consuming.md`, `docs/reference/spec.md`.

- Both "A pack whose artifacts are all MCP servers, hooks or prompts…" paragraphs become: a pack of only MCP servers or
  hooks has no plugin yet; `essentials` has a plugin that carries only its two commands, `/essentials:explain-diff` and
  `/essentials:author-artifact`, so its MCP server and hooks still need `sigil add`.
- Both "What a plugin carries" paragraphs add prompts, and drop them from the "not packaged" list.
- `consuming.md`: add `essentials` to the pack list above that paragraph.
- `spec.md`: the Claude plugin column for `prompt`, and the `### prompt` section, say a plugin prompt is
  `plugins/<pack>/skills/<name>/SKILL.md`, invoked as `/<pack>:<name>`, with `shared/` dropped from the name.

Test: `npx prettier --check docs`, then `npm run build:test && node --test test-compiled/cli-flags.test.js`.

### Step 5 `[worker:medium]`: record it

Files: `CHANGELOG.md`, `docs/decisions/publish-claude-marketplace-2026-10.md`,
`docs/decisions/distribution-channels-2026-09.md`, `docs/plan-claude-plugin-channel.md`.

- `CHANGELOG.md`, `[Unreleased]`, `### Added`: the Claude marketplace has an `essentials` plugin carrying
  `/essentials:explain-diff` and `/essentials:author-artifact`. Prompts are now packaged into plugins.
- Publish ADR, § Empty plugins: `prompt` joins the kinds a plugin carries, and `essentials` returned as a plugin after
  v0.2.1 once it had something to carry. Keep the v0.2.0/v0.2.1 history.
- Distribution ADR, the note after the roadmap table: prompts as skills done on the merge date.
- Roadmap: mark Phase B done.

Test: `npx prettier --check docs CHANGELOG.md`.

### Step 6 `[inline: probe]`: it works in real Claude Code

This measures Claude Code's behaviour, so it stays with the main session. After `npm run catalog:build`, from a scratch
folder:

1. `claude plugin validate` on `dist/claude/plugins/essentials`.
2. `claude -p '/essentials:explain-diff "<a short diff>" reviewer' --plugin-dir <abs>/dist/claude/plugins/essentials`:
   the skill runs, and both arguments reach it.
3. Ask a plain question that matches its description: the model must not load the skill by itself.

### Step 7 `[inline: close-out]`

`npm run ci:local`, `workflow-report .`, `/agent-skills:review`. Then stop for the owner: PR, merge on green CI, delete
this plan after merge. The owner's clean-machine check covers `/plugin install essentials@sigil` after the next release.
