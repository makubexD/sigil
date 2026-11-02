# Plan: Antigravity target, Phase B (skills and rules)

Phase B of [plan-antigravity-target.md](plan-antigravity-target.md). Evidence:
[antigravity-target-2026-11.md](decisions/antigravity-target-2026-11.md) (probe ids P1, P2, U5, A1, and B1 below). The
phase follows [Rules for every target](reference/architecture.md#rules-for-every-target). Branch
`feat/antigravity-target-b`, one PR.

Model: the Cursor target's Phase B ([plan-cursor-target-b.md](plan-cursor-target-b.md)). Antigravity differs in
three places. Its skills go to `.agents/skills/`, the same files `codex` and `agents-standard` write, so `add` refuses a
second owner. Its rule files take a `trigger` key, not `alwaysApply`. And a scoped rule is skipped, because no
`trigger: glob` rule attached in any probe (B1).

## Decisions (settled from the probes and the roadmap)

1. **Scoped rules are skipped, with their reason (B1).** On `agy` 1.4.12 a `trigger: glob` rule with
   `globs: "src/**/*.ts"` never reached the model. It failed after a read of `src/app.ts`, in a second turn of the same
   conversation (`--continue`), and after an `edit_file` of `src/app.ts`, in that run and in its next turn. The same
   file with `trigger: always_on` returned its codeword. The roadmap's two fallbacks were "skip with the reason" and
   "inline into the skills that use it". Phase B does both: skills inline their rules already
   (`codingGuidelinesSection`), and a scoped rule picked on its own is skipped. `trigger: model_decision` is not a
   fallback. It lets the model decide from the description, which no probe checked and which isn't what `appliesTo`
   means.
2. **The skip is a new neutral spec field, not a rule-only branch.** `KindEmitSpec.skipReason` (step 2) gives a reason a
   spec can't carry one artifact. `add`, the wizard, `build` and a skill's dependency closure already honour
   `toolSkipReason` for agents, and the new field goes through the same places. The rule spec still renders the
   documented `trigger: glob` form, so once a later `agy` attaches glob rules the only change is deleting
   `skipReason`.
3. **No `AGENTS.md`, on `add` or `build` (amends the roadmap's "repo-wide rules in `AGENTS.md`").** This is the same
   reasoning as Cursor's Decision 4. A repo-wide rule becomes a `trigger: always_on` file in `.agents/rules/`, which
   Antigravity loads (P1, B1 control run). Antigravity also reads a root `AGENTS.md`, so writing both would load each
   rule twice. Per-file rules are also tracked by the manifest, and an `AGENTS.md` written by `add` wouldn't be (A1).
   The setup page warns against also copying `agents-standard`'s built `AGENTS.md`.
4. **The 24,000-byte file limit is a `bytes` unit**, since `SpecLimit` has only `chars` and `lines` (step 3). It's an
   `error`, because Antigravity truncates the file past it. The 20,000-token budget covers every always-on rule at
   once, so it stays in the setup page, as the roadmap says.
5. **Overlaps.** Copilot and Cursor read `.agents/skills/`, so `antigravity` joins their `alsoLoads` lists (Cursor's
   copy still wins). `antigravity`, `codex` and `agents-standard` each list the other two in `sharesSkillFilesWith`.
   Antigravity loads nothing written for Claude (P6), so it gets no `alsoLoads` of its own.

## Step 1 `[inline: records a probe of Antigravity's own loader]`: B1 in the ADR

The probe ran while this plan was written, on 2026-11-02 with `agy` 1.4.12, on Linux, signed in, using
`agy --model gemini-3.8-flash-low --output-format stream-json`. It ran in a fresh `git init` repo under the scratchpad
with `src/app.ts` and `.agents/rules/ts-style.md` (`trigger: glob`, `description`, `globs: "src/**/*.ts"`, codeword
DELTA-58). Add a `### Phase B` subsection after `### Phase A` in the ADR's probe log, with one row, B1:

- Run 1: `-p "Read src/app.ts and summarize it in one line."`, then `--continue -p` asking for a rule's review
  codeword. The model read the file, and the second turn found none (it tried `run_command`, which was denied).
- Run 2: `--continue -p` with "Without using any tools, answer only from your context". Result: `NONE`.
- Run 3: with `--settings` allowing the edit tools, `-p` asking for an `edit_file` of `src/app.ts` (two `read_file`
  and two `edit_file` calls; the line was added), then the codeword. Result: `NONE`, and also `NONE` in a
  `--continue` turn.
- Control: the same file with `trigger: always_on` returned `DELTA-58`.

In the ADR's `## Decision`, change the scoped-rules wording from "wait for a multi-turn glob probe" to: B1 found no
attach after a read, an edit or a later turn, so Phase B skips scoped rules.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.

## Step 2 `[worker:medium]`: `KindEmitSpec.skipReason`

Files: `src/targets/spec-types.ts`, `src/targets/tool-restriction.ts`, `src/targets/emit-files.ts`, new
`test/targets/spec-skip-reason.test.ts`.

- `spec-types.ts`, on `KindEmitSpec`: add
  `readonly skipReason?: (frontmatter: Record<string, unknown>) => string | undefined;`, with a doc comment: "A reason
  this provider can't use the artifact as written (a probe showed it ignores the file), or undefined to write it.
  `add` and the wizard skip it with this reason, `build` and a skill's dependency closure leave it out, and a direct
  `scaffoldArtifact` call throws. `renderArtifact` still renders it, so conformance checks see the documented form."
- `tool-restriction.ts`: add and export
  `specSkipReason(spec: KindEmitSpec, artifact: { frontmatter: Record<string, unknown> }): string | undefined`, which
  returns `spec.skipReason?.(artifact.frontmatter) ?? toolSkipReason(spec, artifact)`. `wholeFileSkipReason`
  returns `specSkipReason(spec, artifact)` instead of `toolSkipReason(spec, artifact)`.
- `emit-files.ts`: `emitFile` and `installableDeps` call `specSkipReason` where they call `toolSkipReason` now.
  `scaffoldArtifact`, after `assertRestrictionCarried(spec, artifact)`: if `spec.skipReason?.(artifact.frontmatter)`
  returns a reason, throw `new SigilError(`${artifact.id}: ${reason}`)` (import it as `emit.ts` does). Update the
  comment above `emitFile`'s check to cover both reasons.
- Don't change `renderArtifact` or `assertRestrictionCarried`.

Test cases in `test/targets/spec-skip-reason.test.ts`. Build a spec as `{ ...CURSOR_RULE_SPEC, skipReason: fm =>
fm.appliesTo ? 'scoped' : undefined }` and a fake target `{ emitSpecs: [thatSpec] }`. Use catalog rules from
`loadResolvedCatalog()`: `shared/cli-rules` (has `appliesTo`) and `shared/clean-code`. Use the skill `shared/cli`,
which uses `shared/cli-rules`.

| Case                                                                                                                     | Expected                                            |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `wholeFileSkipReason(fake, cli-rules)`                                                                                   | `'scoped'`                                          |
| `wholeFileSkipReason(fake, clean-code)`                                                                                  | `undefined`                                         |
| `emitFile(spec, cli-rules, {}, files)`                                                                                   | `files` stays empty                                 |
| `emitFile(spec, clean-code, {}, files)`                                                                                  | one `.cursor/rules/` file                           |
| `scaffoldArtifact({ specs: [spec], artifact: cli-rules, … })`                                                            | throws, message contains `shared/cli-rules: scoped` |
| `scaffoldArtifact` of `shared/cli` with specs `[thatSpec, a copy of CODEX_SKILL_SPEC with no `codingGuidelinesSection`]` | writes the skill and no `.cursor/rules/` file       |
| `renderArtifact(spec, cli-rules, {})`                                                                                    | returns a string containing `globs:` (no throw)     |

Test: `npm run build && npm test`.

## Step 3 `[worker:medium]`: a `bytes` limit unit

Files: `src/targets/spec-types.ts`, `src/commands/sync/conformance/rules/provider-limits.ts`, the existing
provider-limits test (find it with `grep -rln "provider-limits" test`).

- `SpecLimit.unit`: `'chars' | 'lines' | 'bytes'`, and its doc comment says `bytes` is the UTF-8 length.
- `provider-limits.ts:64`: measure `bytes` with `Buffer.byteLength(text, 'utf8')`, and keep `lines` and `chars` as
  they are.
- Test cases: a spec limit of `{ field: 'body', max: 10, unit: 'bytes' }` on a body of `'ééééé'` (10 bytes) has no
  finding, and on `'éééééé'` (12 bytes, 6 chars) it has one finding whose detail says `12 bytes`.

Test: `npm run build && npm test`.

## Step 4 `[worker:medium]`: the target folder, with skills

Files: new `src/targets/antigravity/{capabilities,doc-refs,lexicon,metadata,index}.ts`,
`src/targets/antigravity/spec/{index,skill}.ts`, `src/targets/index.ts`, new `test/targets/antigravity.test.ts`,
generated `docs/reference/capabilities.md` and `test/fixtures/output-snapshot/build.json`.

Copy `src/targets/agents-standard/` and rename `AGENTS_STANDARD` to `ANTIGRAVITY`, with `name = 'antigravity'` and
`displayName = 'Antigravity'`. Register it after `CursorTarget`, and export it wherever the others are exported.

- **Doc refs**, `verifiedOn: '2026-11-01'` (the ADR's docs pass):
  - `ANTIGRAVITY_SKILLS_DOC` (`https://antigravity.google/docs/skills#cli-skill-locations`, covers: "project skills in
    .agents/skills/<name>/SKILL.md, the Agent Skills layout").
  - `ANTIGRAVITY_RULES_DOC` (`https://antigravity.google/docs/rules#where-rules-are-stored`, covers: "AGENTS.md and
    .agents/rules/\*.md with a trigger (always_on, model_decision, glob, manual); each file is truncated at 24,000
    bytes").
  - `ANTIGRAVITY_WORKFLOWS_DOC` (`https://antigravity.google/docs/migration/workflows-to-skills`, covers: "workflows
    stopped working on 2026-10-19; a skill is the slash command").
- **Lexicon:** `conventions-file` `AGENTS.md`, `rules-dir` `.agents/rules/` (both `ANTIGRAVITY_RULES_DOC`),
  `skills-dir` `.agents/skills/`, and `arguments` `the request you were given` (both `ANTIGRAVITY_SKILLS_DOC`).
- **Skill spec:** `AGENTS_STANDARD_SKILL_SPEC` with `lexicon: ANTIGRAVITY_LEXICON` and
  `docs: [ANTIGRAVITY_SKILLS_DOC]`. Everything else is the same: path, frontmatter, tool dialect (import
  `AGENTS_STANDARD_TOOL_DIALECT`, don't copy it), body sections including `codingGuidelinesSection`, forbidden keys
  and limits.
- **Capabilities** (scaffold only, no plugin channel). `skill` is native. `rule` is none, reason "not built yet" (step
  5 makes it native). `agent`, `mcp` and `hook` are none, reason "not built yet (roadmap Phase D / C / E)". `prompt` is
  none, reason "Antigravity has no prompt files: workflows stopped working and a skill is the slash command", citing
  `ANTIGRAVITY_WORKFLOWS_DOC`. `workflow` is none, with the same reason and doc. `settings` is none, reason "the CLI
  owns its settings file". `template` is `TEMPLATE_NOT_EMITTED`.
- **Target:** `installHint = 'writes to .agents/'`.
  `afterInstallHint = 'Antigravity picks up .agents/skills/ and .agents/rules/ in its next session.'`
  `sharesSkillFilesWith = ['agents-standard', 'codex']`, and no `aggregateDocs`. `compile` emits every artifact
  that has a scaffold spec (the loop already there) and writes **no `AGENTS.md`**. The module comment says why, in
  Decision 3's words.
- **Metadata:** `initDirs: ['.agents/skills', '.agents/rules']`, `projectMarkers: ['.agents/rules']`, and vocabulary
  for `skill` (hint "Agent Skills in .agents/skills/") and `rule` (hint "rules in .agents/rules/").
- Run `npm run build` (it regenerates `capabilities.md`) and `npm run snapshot:update`, and commit both outputs.

Test cases in `test/targets/antigravity.test.ts`, modelled on `test/targets/cursor.test.ts`:

| Case                                                                        | Expected                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scaffold` of `typescript/ts-generate-tests`                                | The same file map as `agents-standard`'s scaffold of it, byte for byte                 |
| `scaffold` of `shared/cli`                                                  | No `.agents/rules/` file; `SKILL.md` has `## Coding guidelines to apply`               |
| `resolveSelection` of an agent, a prompt, a hook and an mcp for antigravity | Each goes to `skipped[]` with its reason from the capability table                     |
| `compile` on the catalog                                                    | Writes `.agents/skills/`; no `AGENTS.md`, no `.claude/`, `.github/` or `.cursor/` file |
| `getTarget('antigravity')`                                                  | Returns the target; `getAllTargets()` lists it after `cursor`                          |

Test: `npm run build && npm run validate && npm run -s sigil -- sync --check`, then `npm test`.

## Step 5 `[worker:medium]`: rules in `.agents/rules/`

Files: new `src/targets/antigravity/spec/rule.ts`, `src/targets/antigravity/spec/index.ts`,
`src/targets/antigravity/capabilities.ts`, `test/targets/antigravity.test.ts`,
`test/targets/rule-globs-agreement.test.ts`, generated `docs/reference/capabilities.md` and
`test/fixtures/output-snapshot/build.json`.

- `spec/rule.ts`, modelled on `src/targets/cursor/spec/rule.ts`:
  - `outputPath`: `.agents/rules/${artifact.id.replace(/\//g, '-')}.md`. `pathPattern`: `/\.agents\/rules\/[^/]*\.md$/`.
  - Frontmatter, in this order. First, `trigger` (from `appliesTo`, `required: true`, `alwaysEmit: true`): writes
    `trigger: always_on` when `appliesToEveryFile(appliesTo)`, else `trigger: glob`. Then `description`, Cursor's
    whitespace-collapsing `yamlScalar` mapping. Then `globs` (from `appliesTo`, `required: false`): Cursor's
    `globsMapping` unchanged (quoted comma-joined list, or nothing for a repo-wide rule).
  - `skipReason: fm => appliesToEveryFile(fm.appliesTo as readonly string[] | undefined) ? undefined : '<reason>'`,
    with the reason `Antigravity does not attach trigger: glob rules yet (ADR probe B1); the skills that use this rule
carry it inline`.
  - Body: the `# <title>` heading. `forbiddenKeys: ['name', 'applyTo', 'paths', 'agent', 'alwaysApply']`.
    `lexicon: ANTIGRAVITY_LEXICON`, `bodyForbids: [UNTRANSLATED_TOKEN_FORBID]`, `docs: [ANTIGRAVITY_RULES_DOC]`.
  - `limits`: `{ field: 'body', max: 24000, unit: 'bytes', severity: 'error', doc: ANTIGRAVITY_RULES_DOC }`.
- Add it to `ANTIGRAVITY_EMIT_SPECS`. `rule` becomes `{ mode: 'native' }`, and the capabilities module comment says
  scoped rules are skipped per artifact (`skipReason`).
- `rule-globs-agreement.test.ts`: add a fourth `it`, "should agree with Claude on every rule Antigravity writes". For
  each catalog rule, `scaffold` through `getTarget('antigravity')` must write `.agents/rules/<slug>.md` with
  `trigger: always_on` and no `globs` when Claude's glob list is `['**']` (or every glob in `REPO_WIDE_GLOBS`).
  Otherwise `scaffold` throws (step 2), and `renderArtifact(ANTIGRAVITY_RULE_SPEC, rule, {})` has `trigger: glob` and
  a `globs` string that splits on `,` to Claude's list. Assert at least one rule of each kind was checked. Update the
  file's top comment to name Antigravity.

Test cases added to `test/targets/antigravity.test.ts`:

| Case                                                     | Expected                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `scaffold` of `shared/clean-code`                        | `.agents/rules/shared-clean-code.md` with `trigger: always_on`, a `description`, no `globs` |
| `resolveSelection` of `shared/cli-rules` for antigravity | goes to `skipped[]` with the B1 reason                                                      |
| `compile` on the catalog                                 | one `.agents/rules/` file per repo-wide rule and none for `shared/cli-rules`                |
| `scaffold` of `shared/cli`                               | still writes no `.agents/rules/` file (the rule is inlined)                                 |

Test: `npm run build && npm run validate && npm run -s sigil -- sync --check`, then `npm test`.

## Step 6 `[worker:medium]`: shared skill files and overlap notes

Files: `src/targets/codex/index.ts`, `src/targets/agents-standard/index.ts`, `src/targets/copilot/index.ts`,
`src/targets/cursor/index.ts`, plus the overlap and sharing tests (`test/commands/add-overlaps.test.ts`,
`test/commands/status-overlaps.test.ts`, and the test that checks `sharesSkillFilesWith`; find it with
`grep -rln "sharesSkillFilesWith\|writes the same files" test`).

- `codex`: `sharesSkillFilesWith = ['agents-standard', 'antigravity']`. `agents-standard`:
  `['codex', 'antigravity']`. Update both module comments, which name two targets.
- `copilot/index.ts:109`: add `'antigravity'` to the `.agents/skills` `alsoLoads` targets.
  `cursor/index.ts:88`: add `'antigravity'` to the `readerWins` entry.

Test cases:

| Case                                                                      | Expected                                                   |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `add shared/cli --target codex` in a project, then `--target antigravity` | the second `add` throws "codex already installed skills …" |
| `add shared/cli --target antigravity`, then `--target agents-standard`    | throws "antigravity already installed skills …"            |
| `status` with `shared/cli` installed for `antigravity` and `copilot`      | the overlap note names Copilot loading it twice            |
| `status` with `shared/cli` installed for `antigravity` and `cursor`       | the `readerWins` note: Cursor's own copy is used           |

Test: `npm run build && npm test`.

## Step 7 `[inline: user-facing copy]`: docs

- `docs/setup/antigravity.md`: retitle it `# Antigravity: install rules and skills`. Lead with
  `sigil add --target antigravity`: skills go to `.agents/skills/` and repo-wide rules to `.agents/rules/` as
  `always_on`, and scoped rules are skipped with the B1 reason but still reach the skills that use them. The
  `agents-standard` route becomes a short "Without the target" note, and the page warns not to also copy that target's built
  `AGENTS.md` (Decision 3). Keep the approvals, limits (the 20,000-token budget, 24,000 bytes per file) and "What was
  tested" sections, and add B1.
- `README.md`: an Antigravity `<details>` block after Cursor's (line 130) and a bullet after line 197, in the same
  shape. Link the setup page.
- `docs/index.md`: change the Antigravity row to "Install Sigil rules and skills for Antigravity".
- `CHANGELOG.md` `Unreleased`: under `### Added`, "`--target antigravity`: skills in `.agents/skills/` and repo-wide
  rules in `.agents/rules/`; scoped rules are skipped until Antigravity attaches glob rules." Under `### Changed`,
  "`KindEmitSpec.skipReason` and a `bytes` limit unit for targets."
- `docs/reference/architecture.md`: if its emit-spec section lists the `KindEmitSpec` fields, add `skipReason` with
  one line.

Test: `npx prettier --check docs/setup/antigravity.md README.md docs/index.md CHANGELOG.md docs/reference/architecture.md`;
every claim on the setup page cites antigravity.google or an ADR probe id.

## Step 8 `[inline: review of the phase]`: close-out

- `docs/plan-antigravity-target.md`: mark Phase B done with the date, and change its text to match Decisions 1 and 3
  (no `AGENTS.md`, scoped rules skipped after B1). The kind table's rule row becomes `native (.agents/rules/,
always_on only)`.
- Live check: in a scratchpad repo, `sigil add shared/clean-code shared/cli --target antigravity`, then one
  `agy -p` run asking for a codeword appended to the installed rule and skill. Both must come back. Add the result to
  the B1 row.
- `npm run ci:local` must be green.

Test: `npm run ci:local`.
