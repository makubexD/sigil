# Plan: Cursor target, Phase B (rules and skills)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase B. Probe results:
[cursor-target-2026-11.md](decisions/cursor-target-2026-11.md). Branch `feat/cursor-target`, one PR.

Model: the Codex target (`src/targets/codex/`), which Phase B of that roadmap built the same way. Cursor differs in
three places: rules are native (`.mdc` files, not inlined only), skills go to Cursor's own `.cursor/skills/`, and
Cursor also reads other tools' skill folders, which `add` and `status` report.

## Two changes to the roadmap's Phase B text

Both are open to the owner's edit before this plan is committed.

1. **No `AGENTS.md` on `build` (amends Decision 4).** Decision 4 was written before rules were native. With native
   rules, every repo-wide rule becomes an `alwaysApply: true` `.mdc` file, and Cursor also reads a root `AGENTS.md`,
   so writing both would load each repo-wide rule twice. `compile` writes skills and `.mdc` rules, the same files `add`
   writes. Step 5 records the change in the ADR.
2. **The `add` note isn't always a "loads twice" note.** A3 showed Cursor's own `.cursor/skills/` copy wins over
   `.claude/skills/`, so the Claude copy goes unused in Cursor rather than loading twice. The existing overlap note
   (`status-overlaps.ts`) only says "load twice". Step 4 adds a second wording for a reader whose copy wins.

## Step 1 `[inline: probe measures Cursor's own loader]`: globs and `.agents/skills`

Two `agent -p --trust --output-format stream-json` runs in fresh scratchpad repos (`mkrepo.sh`, as in Phase A), never
in this repo. Record the prompts, `agent --version` and the output in a new `### Phase B probes` subsection of the ADR's
probe log, and update the A1 row of its results table.

- **Run 1, globs on a read.** `.cursor/rules/quoted.mdc` (`globs: "**/*.ts"`, `alwaysApply: false`, codeword BRAVO),
  `unquoted.mdc` (`globs: **/*.ts`, ECHO), `joined.mdc` (`globs: "docs/**/*.md,**/*.ts"`, KILO), each with a
  `description`, plus `src/app.ts`. Prompt: `Read src/app.ts, then list every codeword your rules give you; answer
with the words only.` The stream must show the read.
- **Run 2, `.agents` against `.cursor`.** `.cursor/skills/probe-skill/` (answer `ECHO-42`) and
  `.agents/skills/probe-skill/` (same name and description, answer `GOLF-3`). Prompt: `What is the probe checksum?
Then list the skills you can use with the path of each SKILL.md.`

What each result changes:

| Result                                      | Change                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Run 1: BRAVO and KILO attach                | None: step 3 writes a quoted, comma-joined `globs`                        |
| Run 1: only ECHO attaches                   | Amend step 3 to write `globs` unquoted (see step 3's note)                |
| Run 1: nothing attaches after the read      | None in step 3; the setup page says scoped rules are unproven in the CLI  |
| Run 2: `ECHO-42`, `probe-skill` listed once | Step 4: `readerWins` also for `agents-standard` and `codex`               |
| Run 2: listed twice, or `GOLF-3`            | Step 4: `agents-standard` and `codex` keep the existing "load twice" note |

Amend steps 3 and 4 in this file with the outcome before step 2 starts.

Test: both runs recorded; this plan amended.

## Step 2 `[worker:medium]`: the target folder, with skills

Files: new `src/targets/cursor/{capabilities,doc-refs,lexicon,metadata,index}.ts`, `src/targets/cursor/spec/{index,skill}.ts`,
`src/targets/index.ts`, `src/targets/agents-standard/{doc-refs,lexicon}.ts`, `src/targets/agents-standard/spec/skill.ts`,
new `test/targets/cursor.test.ts`, generated `docs/reference/capabilities.md`, `test/fixtures/output-snapshot/build.json`.

Copy `src/targets/codex/` without its hook, MCP, config and aggregate-docs files, and rename `CODEX` to `CURSOR`,
with `name = 'cursor'` and `displayName = 'Cursor'`. Register it after `CodexTarget` and export it.

- **Skill spec:** the Codex spec with `outputPath` `.cursor/skills/<name>/SKILL.md` and `pathPattern`
  `/\.cursor\/skills\/.*\/SKILL\.md$/`. Same frontmatter mappings, body sections (including `codingGuidelinesSection`,
  so a skill's rules are inlined and `add` doesn't also write them as `.mdc`), forbidden keys and limits.
  `docs: [CURSOR_SKILLS_DOC]`.
- **Doc refs**, `verifiedOn: '2026-11-01'`: move `CURSOR_SKILLS_DOC` from `agents-standard/doc-refs.ts` into
  `cursor/doc-refs.ts` unchanged, and import it from there in `agents-standard`. Add `CURSOR_RULES_DOC`
  (`https://cursor.com/docs/context/rules`), `CURSOR_SUBAGENTS_DOC` (`https://cursor.com/docs/context/subagents`),
  `CURSOR_COMMANDS_DOC` (`https://cursor.com/docs/context/commands`), `CURSOR_HOOKS_DOC`
  (`https://cursor.com/docs/agent/hooks`) and `CURSOR_MCP_DOC` (`https://cursor.com/docs/context/mcp`), each with a
  one-line `covers`.
- **Lexicon:** `conventions-file` `AGENTS.md` (`CURSOR_RULES_DOC`), `rules-dir` `.cursor/rules/` (`CURSOR_RULES_DOC`),
  `skills-dir` `.cursor/skills/` (`CURSOR_SKILLS_DOC`), `arguments` `the request you were given` (`CURSOR_SKILLS_DOC`).
- **Capabilities** (scaffold only, no plugin channel): `skill` native; `rule` none, reason "not built yet" (step 3
  makes it native); `agent` none, reason "not built yet: a Cursor subagent has no tool list, so a read-only one needs
  `readonly: true`", citing `CURSOR_SUBAGENTS_DOC`; `prompt` none, reason "Cursor is folding commands into skills
  (/migrate-to-skills)", citing `CURSOR_COMMANDS_DOC`; `workflow` none, "Cursor has no workflow file"; `hook` none,
  "not built yet", citing `CURSOR_HOOKS_DOC`; `mcp` none, "not built yet", citing `CURSOR_MCP_DOC`; `settings` none,
  "this kind's schema is Claude Code's own vocabulary"; `template` `TEMPLATE_NOT_EMITTED`.
- **Target:** `installHint = 'writes to .cursor/'`; `afterInstallHint` = "Cursor picks up .cursor/skills/ and
  .cursor/rules/ in its next chat." No `configScopes`, no `scaffoldConfig`, no `sharesSkillFilesWith`, no
  `aggregateDocs`. `compile` emits every artifact that has a scaffold spec (the Codex loop) and **no `AGENTS.md`**.
- **Metadata:** `initDirs: ['.cursor/skills', '.cursor/rules']`, `projectMarkers: ['.cursor']`, vocabulary for
  `skill` (hint "Agent Skills in .cursor/skills/").
- Run `npm run build` (regenerates `capabilities.md`) and `npm run snapshot:update`, and commit both outputs.

Test cases in `test/targets/cursor.test.ts`, modelled on `test/targets/codex.test.ts`:

| Case                                                           | Expected                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scaffold` of `typescript/ts-generate-tests`                   | Same relative file list under `.cursor/skills/` as Codex's under `.agents/skills/`     |
| Same scaffold, `SKILL.md` frontmatter                          | Same keys and values as Codex's `SKILL.md`                                             |
| `scaffold` of `shared/cli`                                     | No `.cursor/rules/` file; `SKILL.md` has `## Coding guidelines to apply`               |
| `resolveSelection` of an agent, a prompt and a hook for cursor | Each goes to `skipped[]` with its reason from the capability table                     |
| `compile` on the catalog                                       | Writes `.cursor/skills/`; no `AGENTS.md`, no `.agents/`, `.claude/` or `.github/` file |
| `getTarget('cursor')`                                          | Returns the target; `getAllTargets()` lists it after `codex`                           |

Test: `npm run build && npm run validate && npm run sigil -- sync --check`, then `npm test`.

## Step 3 `[worker:medium]`: rules as `.mdc`

Files: `src/targets/shared/repo-wide-rules.ts`, new `src/targets/cursor/spec/rule.ts`, `src/targets/cursor/spec/index.ts`,
`src/targets/cursor/capabilities.ts`, `test/targets/cursor.test.ts`, new `test/targets/rule-globs-agreement.test.ts`,
generated `docs/reference/capabilities.md` and `test/fixtures/output-snapshot/build.json`.

- `repo-wide-rules.ts`: export `appliesToEveryFile(globs: readonly string[] | undefined): boolean` (true when absent,
  empty, or every glob is `**` or `**/*`). `isRepoWideRule` keeps its language check and calls it for the globs part.
  The new helper must not look at `language`.
- `spec/rule.ts`, modelled on `copilot/spec/rule.ts`:
  - `outputPath`: `.cursor/rules/${artifact.id.replace(/\//g, '-')}.mdc`; `pathPattern` `/\.cursor\/rules\/.*\.mdc$/`.
  - Frontmatter, in this order: `description` (required, Copilot's whitespace-collapsing `yamlScalar` mapping); then one
    `appliesTo` mapping (`to: 'globs'`, `required: false`, `alwaysEmit: true`) whose `serialize` returns
    `alwaysApply: true` when `appliesToEveryFile(appliesTo)`, else
    `globs: ${yamlScalar(appliesTo.join(','))}\nalwaysApply: false`.
  - Body: the `# <title>` heading, as Claude's rule spec does.
  - `forbiddenKeys: ['name', 'applyTo', 'paths', 'agent']`; `lexicon: CURSOR_LEXICON`; `bodyForbids:
[UNTRANSLATED_TOKEN_FORBID]`; `docs: [CURSOR_RULES_DOC]`; `limits`: body 500 lines, severity `warning`,
    `CURSOR_RULES_DOC` (Cursor's "keep rules under 500 lines").
- Add it to `CURSOR_EMIT_SPECS`; `rule` becomes `{ mode: 'native' }`.
- If step 1 amended this step to unquoted globs: write `globs: ${appliesTo.join(',')}` without `yamlScalar`, and say
  in the spec's header why (Cursor's parser, step 1's run). The output contract's frontmatter parse then fails on a glob
  starting with `*`, so the spec needs a stated contract exception; stop and ask before adding one.

Test cases, `test/targets/cursor.test.ts`:

| Case                                        | Expected                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `scaffold` of `shared/git` (`**/*`)         | `.cursor/rules/shared-git.mdc` with `description`, `alwaysApply: true`, no `globs` |
| `scaffold` of `typescript/ts-async`         | `globs: "**/*.ts,**/*.tsx"`, `alwaysApply: false`, `description`                   |
| `scaffold` of `typescript/ts-git`           | Scoped (`alwaysApply: false`) although it has a `language`: four globs joined      |
| A test rule with `appliesTo: ["**"]`        | `alwaysApply: true`                                                                |
| A rule whose description holds `: ` and `"` | Frontmatter parses back (`parseFrontmatter`) with the description unchanged        |
| `compile` on the catalog                    | One `.mdc` per catalog rule; still no `AGENTS.md`                                  |

Test cases, `test/targets/rule-globs-agreement.test.ts`, over every rule in the real catalog (assert the count equals
the catalog's rule count, so a skipped rule fails):

| Case                                      | Expected                                  |
| ----------------------------------------- | ----------------------------------------- |
| Claude `paths:` list vs Copilot `applyTo` | Same glob list (Copilot's split on `,`)   |
| Cursor `alwaysApply: true`                | Claude's list is all `**` / `**/*`        |
| Cursor `alwaysApply: false`               | `globs` split on `,` equals Claude's list |

Test: RED first (the two new test files fail before `spec/rule.ts` exists), then `npm run build && npm run sigil --
sync --check && npm test`.

## Step 4 `[worker:medium]`: Cursor's overlaps, and `readerWins`

Files: `src/types.ts`, `src/commands/status-overlaps.ts`, `src/targets/cursor/index.ts`,
`test/commands/status-overlaps.test.ts`.

- `Target.alsoLoads` entries gain optional `readerWins?: boolean`: the reader's own copy is used on a name clash, so
  the other target's copy goes unused there. Document it on the field.
- `overlapNotes`: with `readerWins`, the note reads `<Reader> also reads <Other>'s <kind>s and uses its own copy on a
name clash, so <Other>'s copy of these goes unused there: <ids> (<doc url>).` Without it, the note is unchanged.
- Cursor declares, citing `CURSOR_SKILLS_DOC`: `{ kind: 'skill', targets: ['claude'], readerWins: true }` and
  `{ kind: 'skill', targets: ['agents-standard', 'codex'] }` (or `readerWins: true` on that one too, per step 1's
  run 2).
- Export `duplicateLoadsFor(entries, targets, targetName, ids)`: the `duplicateLoads` notes where `targetName` is the
  reader or the other target and at least one listed id is in `ids`. `duplicateLoads` stays as it is.

Test cases, `test/commands/status-overlaps.test.ts`:

| Case                                                                       | Expected                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| Skill `x` installed for `cursor` and `claude`                              | One note, the `readerWins` wording, naming `x` |
| Skill `x` installed for `cursor` and `codex`                               | One note, the wording step 1 chose             |
| Skill `x` for `cursor` only                                                | No note                                        |
| Existing Copilot cases                                                     | Unchanged                                      |
| `duplicateLoadsFor(…, 'claude', ['x'])` with `x` for `cursor` and `claude` | The Cursor note (Claude is the other target)   |
| `duplicateLoadsFor(…, 'cursor', ['y'])` with only `x` shared               | No note                                        |

Test: `npm test`.

## Step 5 `[worker:medium]`: `add` prints the overlap notes

Files: `src/commands/add/index.ts` (or `render.ts`, wherever the saved manifest is in reach after the install),
`test/commands/add-overlaps.test.ts` (new, modelled on the closest existing `add` command test).

After a real install (not `--dry-run`) that wrote at least one skill, print each `duplicateLoadsFor(manifest.entries,
getAllTargets(), plan.targetName, <ids just installed>)` note as `  ℹ  <note>`, after the "Next:" line. The install
itself is unchanged and the exit code stays 0.

| Case                                                          | Expected                                              |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `add` a skill for `claude`, then the same skill for `cursor`  | The second `add` prints the `readerWins` note; exit 0 |
| `add` a skill for `cursor` in an empty project                | No note                                               |
| `add --dry-run` of the same skill for `cursor` after `claude` | No note                                               |
| `add` a skill for `claude` after the same skill for `cursor`  | The note, printed by the `claude` install             |

Test: `npm test`.

## Step 6 `[inline: user-facing copy]`: docs and the decision record

`docs/setup/cursor.md` (new, shaped like `docs/setup/codex.md`), the README target list and Quick Start `<details>`,
`docs/reference/spec.md`, `docs/guides/operations.md`, `docs/guides/authoring.md`, `docs/index.md`, `CHANGELOG.md`,
regenerated `docs/reference/cli-flags.md`, and `CLAUDE.md`: the `appliesTo` invariant names the Cursor rule spec as a
fourth emitter that must agree, and points at `rule-globs-agreement.test.ts`.

The setup page covers: rules as `.mdc` with the two modes and step 1's globs result; skills carry their rules inline;
what is skipped and why (agents until Phase E, prompts, hooks and MCP until Phases C and D); that Cursor also reads
`.claude/skills/`, `.agents/skills/` and Claude Code's installed plugins, so a user of sigil's Claude plugin already gets
its skills in Cursor (A3) and the notes `add` and `status` print; and that `build` writes no `AGENTS.md`, with the
reason.

ADR (`cursor-target-2026-11.md`): a short section recording the Decision 4 change and step 4's wording. Roadmap: mark
Phase B done with the PR number, and change Decision 4's text to point at the ADR.

Test: `npm run ci:local`; then `sigil add --target cursor` of `shared/cli` and `shared/git` into a scratch repo, and
check the files by eye. The live load check stays in Phase G.
