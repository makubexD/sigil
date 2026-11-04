# Plan: OpenCode target, Phase D (the target)

Part of the [roadmap](plan-opencode-target.md). This adds `src/targets/opencode/`, scaffold channel only: skills, agents,
prompts, and rules inlined plus `AGENTS.md` on a build. The reasons are in the
[reuse map](decisions/opencode-target-2026-11.md#reuse-map), the [capability rows](decisions/opencode-target-2026-11.md#capability-rows-draft)
and the [probe log](decisions/opencode-target-2026-11.md#probe-log). MCP is Phase E, so `mcp` is `none` here and there is
no `ConfigKindTable` and no `configKinds` yet.

No `catalog/` or zod schema change, and no new symbol in `src/index.ts`. Each code step is RED first. Every OpenCode claim
cites the docs through a `DocRef`. Live runs follow D0: `env -i`, a scratch `HOME`, never `~/.config/opencode/`, and never
an Anthropic or Claude connection.

Decided in this plan:

- **`name` isn't written on an agent.** The file name is the agent name, and an unknown key goes to the model API (D3).
- **No `.opencode/skills/`.** Skills go to `.agents/skills/` and are byte-identical to Codex's, so all four share one lexicon
  value set and `add` refuses a second owner.
- **Agent files carry no `model`** (no provider-free id, D3), and `disallowedTools` stays unmapped, so `restrictionOutcome`
  fails closed on an agent that authors one.
- **The object-form `read` is OpenCode's own default rules**, read from `opencode debug agent build` on 1.19.4: `*` allow,
  `*.env` ask, `*.env.*` ask, `*.env.example` allow, in that order.
- **`add --target opencode` next to `.claude/skills/` (the roadmap's open question): yes, a note, through `alsoLoads`.** That is
  the existing path for this case, and it prints only for a skill installed for both, which is the collision P7 found. A
  `.claude/skills/` folder holding other skills causes no clash, so a folder check would warn with nothing wrong. The note's
  "load twice" wording is false here (one entry, winner not fixed), so step 9 adds a third wording.
- **`rules-dir` is `AGENTS.md`**, as on Codex: OpenCode has no rules folder that a rule file lands in.
- **`bodyForbids` covers `` !`cmd` `` and `@file` but not `$1`.** It is measured on rendered output, where `$1` is correct.

## Step 1: Does a real diff survive quoting? `[inline: live probe of OpenCode, and its result decides step 7]`

`docs/decisions/opencode-target-2026-11.md`, and step 7 of this plan.

The roadmap's question. Run on V1 (`opencode-ai` 1.19.4) and V2 (`@opencode/cli` 2.2.5, setup in the V2 run section,
`POST /api/session/{id}/command`), with a template holding `DIFF[$1] AUDIENCE[$2]`. V2 needs no model reply. V1 does: if no
free model answers, record that and let V2 decide.

| Case | First argument                                                | Pass                      |
| ---- | ------------------------------------------------------------- | ------------------------- |
| 1    | Double-quoted, holding `'`                                    | Whole text in `$1`        |
| 2    | Single-quoted, holding `"`                                    | Whole text in `$1`        |
| 3    | Holding both `'` and `"`, in either quote                     | Whole text in `$1`        |
| 4    | Three lines, quoted                                           | Newlines survive in `$1`  |
| 5    | A real `git diff` of a TypeScript file, holding both of those | Whole text in `$1`        |
| 6    | No second argument                                            | `$2` empty, nothing fails |

Result, 2026-11-04: case 3 and case 5 failed on both lines, with no error, so the prompt doesn't ship. See the
[quoting run](decisions/opencode-target-2026-11.md#quoting-run).

Decision rule: **case 5 passes on both lines, or the prompt doesn't ship.** A real diff is the prompt's whole input, so a
prompt that works only on a diff with no quotes isn't usable. On a fail, step 7 keeps its `skipReason` line, and the prompt
count on this target is 1 of 2. On a pass, delete that line and its cases from step 7, and step 12 documents the quoting.
Add a row per case to the ADR's probe log, then commit the ADR and this plan together.

## Step 2: Positional placeholders `[worker:medium]`

`src/targets/prompt-args.ts`, `test/targets/prompt-args.test.ts` (extend it if it exists).

Add `toPositionalPlaceholders(body: string, args: readonly PromptArg[] | undefined): string`, built on
`substitutePlaceholders`. `{{name}}` becomes `$<1-based position in args>`. A name not in `args` stays as literal text,
because refusing it would lose `author-artifact`, whose one hit is a doc example. Update the module header's list of forms.

| Case | Body               | `args`    | Expected     |
| ---- | ------------------ | --------- | ------------ |
| 1    | `A {{x}} B {{y}}`  | `x`, `y`  | `A $1 B $2`  |
| 2    | `{{y}} then {{x}}` | `x`, `y`  | `$2 then $1` |
| 3    | `{{x}} and {{x}}`  | `x`       | `$1 and $1`  |
| 4    | `{{ x }}`          | `x`       | `$1`         |
| 5    | `{{other}}`        | `x`       | `{{other}}`  |
| 6    | `{{other}}`        | undefined | `{{other}}`  |
| 7    | `{{a-b}}`          | `a-b`     | `$1`         |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/prompt-args.test.js`.

## Step 3: Citations and lexicon `[worker:medium]`

`src/targets/opencode/doc-refs.ts`, `src/targets/opencode/lexicon.ts`, `test/targets/opencode-lexicon.test.ts`.

`doc-refs.ts`, each `verifiedOn: '2026-11-04'`, following `src/targets/cursor/doc-refs.ts`:

| Constant                | URL                                     | Covers                                                                    |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `OPENCODE_SKILLS_DOC`   | `https://opencode.ai/docs/skills/`      | Also reads `.agents/skills/` and `.claude/skills/`; `name`, `description` |
| `OPENCODE_AGENTS_DOC`   | `https://opencode.ai/docs/agents/`      | `.opencode/agents/*.md`, `mode`, `permission`, extra keys reach the model |
| `OPENCODE_PERMS_DOC`    | `https://opencode.ai/docs/permissions/` | Ordered rules, last match wins, object form, `.env` defaults              |
| `OPENCODE_COMMANDS_DOC` | `https://opencode.ai/docs/commands/`    | `.opencode/commands/*.md`, `$1`, `` !`cmd` ``, `@file`                    |
| `OPENCODE_RULES_DOC`    | `https://opencode.ai/docs/rules/`       | Root `AGENTS.md`, no path scoping                                         |
| `OPENCODE_PLUGINS_DOC`  | `https://opencode.ai/docs/plugins/`     | Hooks are code modules, not a declarative file                            |

`lexicon.ts`: `conventions-file` and `rules-dir` are `AGENTS.md` (`OPENCODE_RULES_DOC`), `skills-dir` is `.agents/skills/` and
`arguments` is `the request you were given` (`OPENCODE_SKILLS_DOC`). No `forbidElsewhere`.

| Case | Assert                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | Every `LEXICON_TERMS` key has a value                                                   |
| 2    | Each value equals `CODEX_LEXICON`'s, since the skill files are shared                   |
| 3    | Every `DocRef` URL starts with `https://opencode.ai/docs/` and has a valid `verifiedOn` |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-lexicon.test.js`.

## Step 4: Tool dialect and the permission block `[worker:medium]`

`src/targets/opencode/tool-dialect.ts`, `test/targets/opencode-tool-dialect.test.ts`.

`OPENCODE_AGENT_TOOL_DIALECT` is a `names` dialect: `read` is `read`, `list`; `search` is `grep`, `glob`; `edit` is `edit`;
`shell` is `bash`; `web` is `webfetch`, `websearch`; `agent` is `task`; `todo` is `todowrite`.

`opencodePermissionBlock(authored: readonly string[]): string` renders through `renderTools`. It writes `permission:`, then
`'*': deny`, then each name as `  <name>: allow`, in dialect order, except `read`, which writes the four-rule object. A name
not matching `/^[a-z]+$/` (a provider pattern) goes through `yamlScalar()`. The header cites D3 and P4: rules are ordered,
the last match wins, and `read: allow` as a shorthand returned a `.env` value.

Case 1's exact output:

```yaml
permission:
  '*': deny
  read:
    '*': allow
    '*.env': ask
    '*.env.*': ask
    '*.env.example': allow
  list: allow
  grep: allow
  glob: allow
  bash: allow
```

| Case | Authored                                                   | Expected                                              |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 1    | `read`, `search`, `shell`                                  | The block above, compared as a whole string           |
| 2    | `search` only                                              | `'*': deny`, `grep`, `glob`, and no `read:` line      |
| 3    | Each of the seven neutral tools alone                      | Its keys from the table                               |
| 4    | `Read`, `Bash` (legacy)                                    | Same as `read`, `shell`                               |
| 5    | `Bash(git log:*)`                                          | `  "Bash(git log:*)": allow`                          |
| 6    | The block from case 1 through `js-yaml`'s `load`           | `read['*.env']` is `ask`, and key order is as written |
| 7    | `renderTools(OPENCODE_AGENT_TOOL_DIALECT, ...)`, all seven | `exact: true`                                         |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-tool-dialect.test.js`.

## Step 5: Capabilities and metadata `[worker:medium]`

`src/targets/opencode/capabilities.ts`, `src/targets/opencode/metadata.ts`, `src/targets/opencode/aggregate-docs.ts`.

`OPENCODE_CAPABILITIES`, scaffold only, with `plugin` left undefined:

| Kind       | Row                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `skill`    | `native`                                                                                                        |
| `agent`    | `native`                                                                                                        |
| `prompt`   | `native`                                                                                                        |
| `rule`     | `via`, `as: 'inline'`, docs `OPENCODE_SKILLS_DOC`                                                               |
| `workflow` | `none`, `OpenCode has no workflow file`                                                                         |
| `hook`     | `none`, `OpenCode hooks are generated code on a plugin API OpenCode 2 doesn't run`, docs `OPENCODE_PLUGINS_DOC` |
| `mcp`      | `none`, `the OpenCode MCP entry isn't built yet`                                                                |
| `settings` | `none`, `this kind's schema is Claude Code's own vocabulary`                                                    |
| `template` | `TEMPLATE_NOT_EMITTED`                                                                                          |

`metadata.ts`: `OPENCODE_INIT_DIRS` is `.agents/skills`, `.opencode/agents`, `.opencode/commands`. `OPENCODE_PROJECT_MARKERS` is
`.opencode`. `OPENCODE_VOCABULARY` has a `skill` entry with the hint `Agent Skills in .agents/skills/`.
`aggregate-docs.ts`: `OPENCODE_AGGREGATE_DOCS` cites `OPENCODE_RULES_DOC` for `opencode AGENTS.md aggregate`.

Nothing imports these until step 8, so the check is the compiler and lint.

Test: `npm run build && npx eslint src/targets/opencode`.

## Step 6: Skill and agent specs `[worker:medium]`

`src/targets/opencode/spec/skill.ts`, `src/targets/opencode/spec/agent.ts`, `test/targets/opencode-agent.test.ts`.

**Skill:** a copy of `CODEX_SKILL_SPEC` with `OPENCODE_LEXICON` and `OPENCODE_SKILLS_DOC`, same path, pattern, sections, limits and
`forbiddenKeys`. The header says why the path isn't `.opencode/skills/`: D2's completion-order hazard for two copies of one name.

**Agent:** `outputPath` is `.opencode/agents/<name>.md`, `pathPattern` is `/\.opencode\/agents\/[^/]+\.md$/`. Mappings, in order:
`description` (required, `yamlScalar()`), `mode` (`from: 'id'`, `required: true`, `alwaysEmit: true`, always `mode: subagent`),
`permission` (`from: 'tools'`, `when` a non-empty list, `opencodePermissionBlock`). `toolDialect` is
`OPENCODE_AGENT_TOOL_DIALECT`. The body is the title and Boundary section, as `CURSOR_AGENT_SPEC` writes it. `forbiddenKeys`:
`name`, `tools`, `model`, `applyTo`, `paths`. The docs are `OPENCODE_AGENTS_DOC`, `OPENCODE_PERMS_DOC`.

| Case | Input                                 | Expected                                                                    |
| ---- | ------------------------------------- | --------------------------------------------------------------------------- |
| 1    | `name: x`, `tools: [read, shell]`     | Path `.opencode/agents/x.md`; keys `description`, `mode`, `permission` only |
| 2    | Same                                  | No `name:`, `tools:` or `model:` key in the frontmatter                     |
| 3    | Description holding a colon           | Parses, and the value is intact                                             |
| 4    | No `tools`                            | No `permission` key, and `mode: subagent` stays                             |
| 5    | `disallowedTools: [shell]`            | `restrictionOutcome` is `skip`                                              |
| 6    | `claude: { model: x }`, `model: deep` | No `model` key in the output                                                |
| 7    | `checkOutputContract` on case 1       | No violation                                                                |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-agent.test.js`.

## Step 7: Prompt spec `[worker:medium]`

`src/targets/opencode/spec/prompt.ts`, `src/targets/opencode/spec/index.ts`, `test/targets/opencode-prompt.test.ts`.

`outputPath` is `.opencode/commands/<id with / as ->.md`, the slug rule of the Claude scaffold, so `shared/explain-diff` is
`shared-explain-diff.md`. `pathPattern` is `/\.opencode\/commands\/[^/]+\.md$/`. One mapping: `description` (required,
`yamlScalar()`). `bodyTransform: (body, artifact) => toPositionalPlaceholders(body, artifact.frontmatter.args)`. `forbiddenKeys`:
`name`, `args`, `arguments`, `argument-hint`, `disable-model-invocation`. `docs`: `OPENCODE_COMMANDS_DOC`.

`bodyForbids`: `UNTRANSLATED_TOKEN_FORBID`, plus these two, each with the reason that the text would run or expand on OpenCode:

- ``/!`[^`]+`/``, shell output in a template.
- ``/(?<![\w`])@[\w.~/-]/``, a file reference, not after a word character or a backtick.

`skipReason`, from step 1: a prompt with two or more `args` returns `OpenCode splits arguments on spaces and quotes, so only the
last one can hold free text`. The spec's header states step 1's result.

`spec/index.ts` exports `OPENCODE_EMIT_SPECS` with the agent, prompt and skill specs.

| Case | Input                                             | Expected                                            |
| ---- | ------------------------------------------------- | --------------------------------------------------- |
| 1    | One-arg prompt, id `shared/x`, body `Do {{a}}`    | Path `.opencode/commands/shared-x.md`, body `Do $1` |
| 2    | Prompt with no `args`, body holding `{{example}}` | Body keeps `{{example}}`                            |
| 3    | Description holding a colon                       | Parses, and the value is intact                     |
| 4    | Output of case 1                                  | Only `description` in the frontmatter               |
| 5    | Body holding `` !`ls` ``                          | Contract violation naming the reason                |
| 6    | Body holding `see @src/a.ts`                      | Contract violation naming the reason                |
| 7    | Body holding `` `@angular/core` `` or `a@b.co`    | No violation                                        |
| 8    | Two-arg prompt                                    | `skipReason` set, and `specSkipReason` returns it   |
| 9    | One-arg prompt                                    | `skipReason` is undefined                           |
| 10   | Both catalog prompts, rendered                    | No forbid hit                                       |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode-prompt.test.js`.

## Step 8: The target and its registration `[worker:medium]`

`src/targets/opencode/index.ts`, `src/targets/index.ts`, `docs/reference/capabilities.md` (regenerated), the tests that list every
target.

`OpenCodeTarget implements Target`, on the model of `AgentsStandardTarget`: `name = 'opencode'`, `displayName = 'OpenCode'`,
`installHint = 'writes to .agents/skills/ and .opencode/'`, `afterInstallHint` saying OpenCode picks them up in its next session,
`sharesSkillFilesWith = ['agents-standard', 'codex', 'antigravity']`, the data from steps 3 to 7, `compile` and `scaffold` as in
`AgentsStandardTarget`, so `compile` writes `AGENTS.md` through `renderRulesDocument` and `isRepoWideRule`. Register it last, and
add it to the export list in `src/targets/index.ts`. `src/index.ts` doesn't change.

`npm run build` regenerates the capability doc. Then run the whole suite and add `opencode` only where a test lists every registered
target. Changing any other expectation is out of scope: stop and report it. Conformance tests that list hook or config targets
shouldn't change, because `hook` and `mcp` are `none`.

Test: `npm run build && npm test`.

## Step 9: Peers and the overlap note `[worker:medium]`

`src/targets/agents-standard/index.ts`, `src/targets/codex/index.ts`, `src/targets/antigravity/index.ts`,
`src/targets/copilot/index.ts`, `src/targets/cursor/index.ts`, `src/targets/opencode/index.ts`, `src/types.ts`,
`src/commands/status-overlaps.ts`, `test/commands/status-overlaps.test.ts`, `test/commands/add-overlaps.test.ts`.

This is one concern across many one-line edits, so it stays one step.

- Add `opencode` to `sharesSkillFilesWith` on the three peers, and update each header comment that says "one of the three" to four.
- Add `opencode` to the `.agents/skills/` list in Copilot's and Cursor's `alsoLoads`.
- `src/types.ts`: `alsoLoads` gains `readonly unfixedWinner?: boolean`, documented as "one entry reaches the tool, and which copy
  isn't fixed".
- `OpenCodeTarget.alsoLoads`: `{ kind: 'skill', targets: ['claude'], doc: OPENCODE_SKILLS_DOC, unfixedWinner: true }`.
- `noteFor` adds that wording: `${readerName} also reads ${otherName}'s ${kind}s and shows one copy of each, and which one isn't
fixed: ${ids}. Keep one of the two installs (${url}).` The other two wordings stay byte-identical.

| Case | Setup                                                     | Expected                                       |
| ---- | --------------------------------------------------------- | ---------------------------------------------- |
| 1    | Skill installed for `codex`, then `add --target opencode` | Refused, as for the other peers                |
| 2    | Each peer in turn, then `opencode`, and the reverse       | Refused every time                             |
| 3    | One skill for `claude` and `opencode`                     | `status` prints the new note, not "load twice" |
| 4    | `add --target opencode` of a skill already on `claude`    | `add` prints the same note                     |
| 5    | Different skills on `claude` and `opencode`               | No note                                        |
| 6    | Same skill on `opencode` and `copilot`                    | Copilot's "load twice" note names OpenCode     |
| 7    | Same skill on `opencode` and `cursor`                     | Cursor's `readerWins` note names OpenCode      |

Test: `npm run build && npm run build:test && node --test test-compiled/commands/status-overlaps.test.js test-compiled/commands/add-overlaps.test.js`.

## Step 10: The whole catalog `[worker:medium]`

`test/targets/opencode.test.ts`.

The tests that catch a wrong count or a leak, run against the real catalog. The counts come from the ADR's table on 2026-11-03,
so compare them with the catalog when a test fails, and report a difference rather than editing the number to fit.

| Case | Assert                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 1    | `compile` writes 45 skills, 39 agents and step 1's prompt count                                       |
| 2    | `compile` writes a root `AGENTS.md` holding only repo-wide rules, and no `.opencode/skills/` path     |
| 3    | Every skill file is byte-identical to Codex's                                                         |
| 4    | Every agent's outcome is `exact`, and its frontmatter has exactly `description`, `mode`, `permission` |
| 5    | Every agent listing `read` has the `*.env: ask` rule after `*: allow`                                 |
| 6    | No file has a `{sigil:` token                                                                         |
| 7    | Every file passes `checkOutputContract` with the foreign forbids                                      |
| 8    | `scaffold` of a rule gives the `via` result `agents-standard` gives                                   |
| 9    | `hook`, `settings`, `workflow`, `mcp` ids are skipped by `add`, each with its reason                  |
| 10   | `supportsKind(target, 'agent', 'plugin')` is false, and `capabilities.plugin` is undefined            |

Test: `npm run build && npm run build:test && node --test test-compiled/targets/opencode.test.js`.

Then, once: `npm run sigil -- sync --check` must report no new finding for `opencode`.

## Step 11: Real output in real OpenCode `[inline: live probe on V1 and V2]`

`docs/decisions/opencode-target-2026-11.md`.

Build with the local CLI, then repeat P2, P3 and P4 on sigil's output, not on hand-written fixtures. Use `sigil add --target opencode`
for one skill, one agent and `shared/author-artifact` in a throwaway repo, then a full `sigil build --target opencode` in a second.

| Case | Check                                                                                        | Pass                                                 |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | V1 `debug skill`; V2 `/api/skill`, both builds                                               | Every skill listed                                   |
| 2    | V1 `agent list`; V2 `/api/agent`                                                             | 39 on the full build, all `subagent`                 |
| 3    | V1 `debug agent <name>`; V2 `/api/agent`, on a catalog agent                                 | `* deny` first, `*.env` `ask` after `read` `*` allow |
| 4    | V2 `/api/command`; V1 command list                                                           | Commands load under the slug                         |
| 5    | V2 command endpoint, a one-word argument on a prompt with `args`, or a fixture if none ships | `$1` substituted                                     |
| 6    | One model-backed try on V1: the agent asked to read `.env`                                   | No value. If no free model answers, record that      |

A catalog agent that doesn't load is a stop. Add one row per case to the ADR's probe log, and name what still rests on hand-written
fixtures. Model-backed checks on V2 stay in Phase F.

## Step 12: Docs and close-out text `[inline: user-facing copy]`

`docs/setup/opencode.md`, `README.md`, `docs/index.md`, `docs/guides/consuming.md` if it lists targets, `CHANGELOG.md`,
`docs/plan-opencode-target.md`, `docs/decisions/opencode-target-2026-11.md`.

- Rewrite `docs/setup/opencode.md` around `sigil add --target opencode`, following `docs/setup/cursor.md`: what it writes, what it
  skips and why, and one owner for `.agents/skills/`.
- Keep the `.env` section, sharper: agents can run `cat .env` when they list `shell`, which all 39 do, and no hook stands behind it.
- Say that agent restrictions are proven on OpenCode 1 only, not yet on OpenCode 2. Step 1's result goes here too.
- Say that a catalog agent's allow-list also denies MCP tools and the `skill` tool (D3), and that agents carry no model and use the
  caller's.
- Keep the Claude section and name the new note. MCP is "not yet".
- `README.md:238` and `docs/index.md:16` stop saying there's no target; add the target to the tables at `docs/index.md:79`.
- `CHANGELOG.md`, under `[Unreleased]`: `### Added`, the target and what it delivers.
- Roadmap Phase D gets a "Done on" line, with any correction to the "39 agents, 2 prompts" figures. The ADR's stage 4 notes what
  shipped.

Test: `npx prettier --check docs README.md CHANGELOG.md`.
