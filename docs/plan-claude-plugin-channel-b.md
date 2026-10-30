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

1. **Plugin prompts use the plain basename** (revised 2026-10-30): `shared/explain-diff` → `/essentials:explain-diff`,
   `csharp/cs-deploy` → `/<pack>:cs-deploy`. `csharp/deploy` was the original example, but it fails `sync --check`, and
   keeping the language in a valid id stutters (`/dotnet-tooling:csharp-cs-deploy`). The basename is not unique on its
   own, so the collision guard in step 8 is part of this decision.
   `sigil add` keeps `shared-explain-diff`, because a scaffolded skill has no namespace.
2. **`essentials` carries only `/essentials:explain-diff` in a plugin until npm publish** (revised 2026-10-30), and that
   stays true after Phase C, where the MCP server and hooks get their own plugins. `author-artifact` needs the `sigil`
   CLI and a catalog, which a no-clone marketplace user lacks, so it stays out of the plugin and in the pack for
   `sigil add`. The description says what each route delivers, the way `deepseek-worker` already does, so no new
   plugin-only description field.
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

## Follow-ups from the PR #127 review (added 2026-10-30)

Steps 1-7 are done and PR #127 is open. The review requested changes, so these steps land on the same branch. Step 16
replaces step 7's close-out.

### What was checked

- No pack in `packs.yaml` lists an id twice, and across the 14 packs the 100 plugin member files have no path collision
  today. That holds for skills, agents, prompts and shared agents, so the guard starts green on the real catalog.
- `getPackArtifacts` keeps a repeated id, so a pack listing one twice reaches `writeMemberFiles` twice with the same
  artifact. The guard compares artifact ids, not just paths, so that stays legal.
- `getPackArtifacts` has one caller, the plugin build, so filtering there cannot change `sigil add`.
- `PackSchema` is not strict, so zod drops an unknown key silently. `pluginExclude` has no effect until step 10 adds it.
- `mk-exec` refuses a dirty tree, so each step below holds its tests and its code in one commit. The worker runs the
  tests first and reports that they fail as listed; review repeats that with `git stash` on the code files if in doubt.

### Decision 4: `pluginExclude` on the pack

`author-artifact` must stay in `essentials` for `sigil add` but leave its plugin, so that needs a new optional field:
`pluginExclude: [<id>, …]`. It belongs on the pack, because whether a plugin can deliver something is a packaging fact,
and a pack-level field adds nothing to artifact frontmatter or the emit specs. An id it names must also be in that
pack's `artifacts:`, so a typo fails `parsePacksConfig` rather than shipping the artifact. A `languages:` pack has no
explicit list, so the field needs `artifacts:`.

### Step 8 `[worker:medium]`: collision guard

Files: `src/targets/claude-code/plugin-assemble.ts`, `test/targets/plugin-prompts.test.ts`.

Tests first. Add a `packOf(name, artifacts)` helper (copy `test/targets/claude-code.test.ts:288`) and
`withPrompt(resolved, id)`, which clones the resolved `shared/explain-diff`, sets `id` and `frontmatter.id` to `id`, and
returns `{ ...resolved, artifacts: [...resolved.artifacts, clone], byId: new Map(resolved.byId).set(id, clone) }`.

| #   | Case                       | Input                                                                                            | Expected                                                                     | Before code |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| 11  | prompt collides with skill | `withPrompt(resolved, 'shared/cs-generate-tests')`, pack lists it and `csharp/cs-generate-tests` | `compile` rejects with a `SigilError` naming the pack, the path and both ids | fails       |
| 12  | same id listed twice       | pack lists `shared/explain-diff` twice                                                           | `compile` resolves, and `plugins/<pack>/skills/explain-diff/SKILL.md` exists | passes      |

Code: in `writeMemberFiles`, keep a `Map<string, string>` from output path to artifact id. For each artifact, compute
`spec.outputPath(artifact, ctx)` before `emitFile`. If the map holds that path under a different id, throw
`new SigilError(...)` from `../../errors`: `plugin '<pack>': <id> and <other id> both write <path>`. Do not touch
`emitFile`: scaffold can legally re-emit a shared dependency. Update the function's doc comment.

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-prompts.test.js`, then
`npx eslint` on the changed files. Expected: 11 fails on its assertion before the code; all pass after, including the
existing cases that compile the real `packs.yaml`.

### Step 9 `[worker:medium]`: plain basename for plugin prompts

Files: `src/targets/claude-code/spec/prompt.ts`, `test/targets/plugin-prompts.test.ts`.

Tests first, using step 8's helpers.

| #   | Case                  | Input                                                              | Expected                                                                  | Before code |
| --- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------- |
| 14  | language prompt path  | `withPrompt(resolved, 'csharp/cs-deploy')`, a pack listing only it | `plugins/<pack>/skills/cs-deploy/SKILL.md` exists, with `name: cs-deploy` | fails       |
| 15  | no stutter            | same                                                               | no compiled key contains `csharp-cs-deploy`                               | fails       |
| 16  | basenames collide     | `csharp/cs-deploy` and `shared/cs-deploy`, one pack listing both   | `compile` rejects with the step 8 error                                   | fails       |
| 17  | scaffold keeps its id | `target.scaffold('csharp/cs-deploy', …)` on the same catalog       | `.claude/skills/csharp-cs-deploy/SKILL.md`                                | passes      |

Code: `pluginSlugOf` returns `basenameOfId(id)` (`src/paths.ts`), and `slugOf` stays as it is. In the module header
(lines 7-10) and the `pluginSlugOf` comment, replace the `csharp/deploy` example and the claim that the name stays
unique: the plugin name is the id's last segment, the pack namespace does the rest, and two members with one name fail
`writeMemberFiles`. In the `slugOf` comment, keep the warning about `basenameOfId` and scope it to the scaffold, which
has no namespace and no guard.

Test: same command as step 8. Expected: 14-16 fail on their assertions before the code; all pass after.

### Step 10 `[worker:medium]`: the `pluginExclude` field

Files: `src/packs-config.ts`, `src/types.ts`, `src/targets/claude-code/plugin-build.ts`, `test/packs-config.test.ts`,
`test/targets/plugin-prompts.test.ts`.

Tests first.

| #   | File                     | Case                     | Input                                                               | Expected                                              | Before code |
| --- | ------------------------ | ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------- | ----------- |
| 18  | `packs-config.test.ts`   | field parses             | a pack with `artifacts: [a/b, a/c]`, `pluginExclude: [a/c]`         | parsed pack has `pluginExclude: ['a/c']`              | fails       |
| 19  | `packs-config.test.ts`   | a typo is refused        | `artifacts: [a/b]`, `pluginExclude: [a/z]`                          | throws `SigilError` matching `/pluginExclude/`        | fails       |
| 20  | `packs-config.test.ts`   | needs an explicit list   | `languages: [csharp]`, `pluginExclude: [a/z]`                       | throws `SigilError` matching `/pluginExclude/`        | fails       |
| 21  | `plugin-prompts.test.ts` | excluded from the plugin | pack with both prompts, `pluginExclude: ['shared/author-artifact']` | only `explain-diff` is under `plugins/<pack>/skills/` | fails       |
| 22  | `plugin-prompts.test.ts` | an all-excluded pack     | pack of `shared/author-artifact`, excluding it                      | no `plugins/<pack>/` keys, and no marketplace entry   | fails       |

Code:

- `PackSchema`: `pluginExclude: z.array(z.string()).optional()`, plus a `.refine` that every id is in `artifacts`, with
  `path: ['pluginExclude']` and a message naming the rule. The refine goes on the object, so it can read both fields.
- `Pack` in `src/types.ts`: `pluginExclude?: string[]`, with a comment: ids in `artifacts` left out of the Claude plugin
  and still installed by `sigil add`.
- `getPackArtifacts`: filter the explicit-list branch by `pack.pluginExclude`. `hasPluginMembers` reads that same list,
  so a fully excluded pack gets no plugin.

Test: `npm run build && npm run build:test && node --test test-compiled/packs-config.test.js test-compiled/targets/plugin-prompts.test.js`.
Expected: 18-22 fail on their assertions before the code; all pass after. `packs.yaml` is untouched, so the snapshot
does not move.

### Step 11 `[worker:medium]`: `essentials` ships only `explain-diff`

Files: `packs.yaml`, `test/targets/plugin-prompts.test.ts`, `test/targets/claude-code.test.ts`, plus the generated
`test/fixtures/output-snapshot/build.json`.

Tests first, in `plugin-prompts.test.ts`:

| #   | Case                      | Expected                                                                                                       | Before code |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | prompts land (changed)    | `EXPLAIN_DIFF` is in the output and `AUTHOR_ARTIFACT` is not; rename to "should land only explain-diff"        | fails       |
| 6   | only the prompt (changed) | the `essentials` keys are exactly `plugin.json` and `EXPLAIN_DIFF`                                             | fails       |
| 23  | `sigil add` keeps it      | `target.scaffold('shared/author-artifact', …)` writes `.claude/skills/shared-author-artifact/SKILL.md`         | passes      |
| 24  | description leads with it | `plugin.json`'s `description` starts with `Explain a diff`, and the first sentence names no MCP server or hook | fails       |

Code:

- `packs.yaml`, `essentials`: add `pluginExclude: [shared/author-artifact]` with a comment that it needs the `sigil` CLI
  and returns at npm publish, and replace the description with:

  ```yaml
  description: >
    Explain a diff for any audience, in any programming language.
    With sigil add, also installs the Filesystem MCP, config-file protection,
    and a command that authors new catalog artifacts.
    Dev-tool permissions are per language: each starter pack carries its own.
  ```

- `packs.yaml` header comment: one line on `pluginExclude`.
- `claude-code.test.ts:360`: the message becomes `essentials is listed — its plugin carries explain-diff`.
- Run `npm run snapshot:update`.

`test/wizard/add.test.ts` and `test/select/selection.test.ts` keep `shared/author-artifact` in their pack and must pass
unchanged.

Test: `npm run build && npm run build:test && node --test test-compiled/targets/plugin-prompts.test.js test-compiled/targets/claude-code.test.js test-compiled/targets/output-snapshot.test.js test-compiled/select/selection.test.js test-compiled/wizard/add.test.js && node dist-cli/cli.js sync --check`.
Expected: all pass, and the snapshot diff touches only `plugins/essentials/` and `.claude-plugin/marketplace.json`, plus
the registry if it records descriptions.

### Step 12 `[worker:medium]`: user docs

Files: `README.md`, `docs/setup/claude-code.md`, `docs/guides/consuming.md`.

- `README.md:87`: `Plugins carry skills and agents.` becomes `Plugins carry skills, agents, workflows and prompts.`
- Both `essentials` sentences (`claude-code.md:34-36`, `consuming.md:505-506`) become: `` `essentials` has a plugin that
carries only `/essentials:explain-diff`. Its MCP server and hooks still need `sigil add`, and so does `author-artifact`,
which runs the `sigil` CLI against a catalog. ``

Test: `npx prettier --check README.md docs/setup docs/guides`, then `grep -rn "essentials:author-artifact" README.md docs/setup docs/guides docs/reference`,
which must print nothing.

### Step 13 `[worker:medium]`: reference docs

Files: `docs/reference/spec.md`, `docs/guides/authoring.md`.

- `spec.md:195`: `with `shared/` dropped from the name` becomes `named by the id's last segment (`shared/explain-diff`→`explain-diff`, `csharp/cs-deploy`→`cs-deploy`). Two members of a pack with one name fail the build.`
- `spec.md:408`: add `pluginExclude` to the `packs.yaml` row's description.
- `authoring.md`, after the paragraph following the Step 5 `packs.yaml` example, add: `` `pluginExclude: [<id>]` keeps
a listed artifact out of the Claude plugin, while `sigil add` still installs it. Every id must also be in `artifacts:`.
Use it for an artifact a plugin user could not run. ``

Test: `npx prettier --check docs/reference docs/guides`, then `npm run build:test && node --test test-compiled/cli-flags.test.js`.

### Step 14 `[worker:medium]`: changelog and ADRs

Files: `CHANGELOG.md`, `docs/decisions/publish-claude-marketplace-2026-10.md`,
`docs/decisions/distribution-channels-2026-09.md`.

- `CHANGELOG.md`, `[Unreleased]`, `### Added`: the entry becomes: the Claude marketplace has an `essentials` plugin
  carrying `/essentials:explain-diff`. Prompts are now packaged into plugins, named by the id's last segment, and a
  name collision inside a plugin fails the build. Add: a pack's `pluginExclude` keeps an artifact out of its plugin.
- Publish ADR line 74, `carrying only its two commands` becomes `carrying only `/essentials:explain-diff``, then add:
`author-artifact`stays out until npm publish, because it needs the`sigil` CLI.
- Distribution ADR line 212: the same change.

Test: `npx prettier --check docs CHANGELOG.md`.

### Step 15 `[worker:medium]`: roadmap and npm brief

Files: `docs/plan-claude-plugin-channel.md`, `docs/ideas/npm-first-publish.md`.

- Roadmap, Phase B: `explain-diff and author-artifact become plugin skills` becomes `prompts become plugin skills`, and
  `holding only its two prompts` becomes `holding only `explain-diff``, adding that `author-artifact` waits for npm publish.
- npm brief, `## Success criteria`: add a bullet: after publish, remove `pluginExclude: [shared/author-artifact]` from `essentials`
  in `packs.yaml`, put `/essentials:author-artifact` back in its description and the docs, and update the output snapshot.

Test: `npx prettier --check docs`.

### Step 16 `[inline: close-out]`

`npm run ci:local`, `workflow-report .`, `/agent-skills:review`. Rerun step 6's probe on `dist/claude/plugins/essentials`.
Update the PR #127 body, dropping "Open before merge", then push. Then stop for the owner: merge on green CI and delete
this plan after merge.

Out of scope, each for its own commit or PR: unquoted diffs in `explain-diff`, `provider-limits` skipping plugin prompts,
and `author-artifact`'s doubled title and "to the sigil" typo.
