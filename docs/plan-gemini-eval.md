# Plan: Gemini CLI target evaluation

Brief: [docs/ideas/gemini-cli-target.md](ideas/gemini-cli-target.md). The result is a decision, not code: a
go/no-go ADR in `docs/decisions/gemini-target-2026-11.md` and, on a go, a phased roadmap `docs/plan-gemini-target.md`.
Every step is `[inline]`: the work is research, reading sigil's code against it, probing Gemini's own loader, and a
judgment call. None of it is mechanical, and a probe of model behavior must run on Gemini, not on the worker.

The [Cursor evaluation](decisions/cursor-target-2026-11.md) (Phase A of `docs/plan-cursor-target.md`) is the model.
The questions come from the probe list, and the answers go into one decision record.

Starting facts (2026-11-01): `@google/gemini-cli` is at 0.66.0 on npm and isn't installed here. The ADR snapshot
([distribution-channels-2026-09 § 3](decisions/distribution-channels-2026-09.md)) has a Gemini extension column that
hasn't been checked since September.

## Ground rules (every step, and the roadmap a go produces)

1. **The catalog stays provider-neutral.** A Gemini difference is resolved in the layer that parses or emits it, never
   in `catalog/` source, the zod schema, or `load` / `validate` / `resolve`:
   - paths and frontmatter → a `KindEmitSpec` in `src/targets/gemini/spec/<kind>.ts`;
   - tool names and model hints → a `ToolDialect` and a tier table;
   - body terms (`GEMINI.md`, the command argument syntax, folder names) → a `ProviderLexicon` with `{sigil:<term>}`
     tokens;
   - env references → an `EnvSyntax`; MCP entries → an `McpDialect`; config kinds → a `ConfigKindTable`;
   - hook events and matchers → the target's translation. The neutral catalog form is the input, never Claude's names
     copied through;
   - which kinds ship → `src/targets/gemini/capabilities.ts` only.
     A difference no existing layer can carry is a finding. The fix is a new neutral concept, decided in its own
     phase the way Phase N added the neutral tool vocabulary for Cursor. It is never a `gemini:` field or a
     Gemini literal in a body.
2. **Official sources only.** Every capability claim cites Google's own Gemini CLI docs (geminicli.com, or `docs/` in
   `google-gemini/gemini-cli` at a named release tag), and checks the docs against the 0.66.0 source when they
   disagree. Blog posts and third-party guides can point to a question but never answer one. When the docs say
   nothing, that is recorded as "undocumented". It is never assumed, and the live probe in step 3 decides it.
3. **The best practices Gemini documents are carried over as data:** size or listing limits go on
   `KindEmitSpec.limits`, and the recommended scopes and trust and approval rules go in the setup docs. The same
   holds for anything sigil's existing targets already follow: `.sigil.bak` backups for home files, merging into
   user-owned config, and never overwriting it.

## Steps

### 1. Docs pass: sigil kind vs. Gemini mechanism `[inline: research and judgment]`

Read the current Gemini CLI docs (geminicli.com and the `google-gemini/gemini-cli` repo `docs/`) and draft the ADR
with one row for each sigil kind (`skill`, `agent`, `prompt`, `rule`, `hook`, `mcp`, `settings`) on two channels,
project-scaffold (`.gemini/…`) and extension (`gemini-extension.json`). Each row gets the file path, the format, the
scopes (project and user), and a docs link. Answer:

- D1. Context files: does `GEMINI.md` load hierarchically, and can the `context.fileName` setting list `AGENTS.md`?
  This is the brief's "almost free" question.
- D2. Skills: is there a native skills folder, and does Gemini also read `.agents/skills/`? That folder is the one
  `codex` and `agents-standard` share (`Target.sharesSkillFilesWith`).
- D3. Agents/subagents: is the format stable or preview? Does it have a tool list, a read-only flag, and model fields?
- D4. Commands: what is the `commands/*.toml` shape (`prompt`, `description`), and what argument syntax replaces
  `$ARGUMENTS`?
- D5. Hooks: events, stdin fields, the deny exit code, and where they live (`settings.json`?).
- D6. MCP: `mcpServers` in `.gemini/settings.json`, the env-reference syntax, and the trust or approval rules.
- D7. Settings: which keys are user-owned config that sigil could merge, if any.
- D8. Extensions: project-scoped install, or user only? Can an extension ship rules or context?
- D9. Support status: on 2026-11-01 the Google-account sign-in in 0.66.0 failed with "This client is no longer
  supported for Gemini Code Assist for individuals… migrate to the Antigravity suite of products". Find out from
  Google's official docs which auth routes are still supported (Gemini API key, Vertex AI, Code Assist Standard or
  Enterprise), and whether the CLI itself is still maintained. This weighs on the decision in step 4.

Test: `npx prettier --check docs/decisions/gemini-target-2026-11.md`. Every row has a docs link that resolves today.

### 2. Reuse map against sigil's code `[inline: architecture judgment]`

For each row from step 1, name the sigil piece it would use and note any gap, with `file:line` citations. That covers
the `AGENTS.md` aggregate (Copilot `build-helpers.ts`, the Codex target), `McpDialect` and `EnvSyntax`, the
`ConfigKindTable`, Cursor's hook event and tool-name translation, the `ToolDialect` for agent tools, and
`KindEmitSpec` limits. Answer the brief's TOML question too. A command is a whole file sigil writes, so it may need a
TOML _writer_ but not Codex's splice merge (`src/config-merge/toml-file.ts`). Check this against how Codex writes
TOML today. Put a capability row draft in the ADR for each kind and channel: `native`, `via` or `none`.

Then make a **neutrality table**: list every Gemini difference found in steps 1–2 with the layer from ground rule 1
that absorbs it. Any row with no layer goes into the decision as a needed neutral concept, with its cost. Known
debt to check first: catalog hook matchers still use Claude's tool names (a follow-up left from Phase N). A Gemini
hook is the third consumer of them, which may be the point to make matchers neutral.

Test: each citation points to a line that exists (`sed -n <line>p <file>`), then `npm run validate`. The
neutrality table has no row that needs a change to the catalog or schema without a new neutral concept named
for it.

### 3. Live probe in Gemini CLI `[inline: probes Gemini's own loader and model behavior]`

Gate: `@google/gemini-cli@0.66.0` is installed. The Google-account sign-in was refused (D9), so the owner
authenticates with a Gemini API key: they create it at aistudio.google.com, export `GEMINI_API_KEY` in their own
shell profile, and pick "Use Gemini API key" in `! gemini`. The key is never pasted into the session, a file, or a
worker spec. If the free API tier refuses too, these probes become docs-only, and the ADR records the live risk as
open, as Cursor's Phase A did.
Keep each probe to one or two short `gemini -p` runs in a throwaway repo under the scratchpad. Each probe records its
expected and observed results in the ADR:

- P1. `AGENTS.md` set as `context.fileName` in `.gemini/settings.json`: an instruction in it is followed.
  Expected: followed. Then the same without the setting: expected, not followed.
- P2. A skill in the native folder from D2, plus `.agents/skills/`: the skill is listed and picked from its
  description. If both folders hold the same name, does it list once or twice?
- P3. `.gemini/commands/hello.toml` runs as `/hello`, and the argument from D4 is substituted.
- P4. A hook from D5 denies a write to `.env`. Record the raw stdin field names.
- P5. A stdio MCP server in `.gemini/settings.json` with an env reference starts and receives the value.
- P6. Does Gemini read anything sigil already writes for another target (`.claude/`, `.agents/skills/`, `AGENTS.md`)
  without any settings? This sets how much a target would add.

Test: each probe's transcript summary is in the ADR with the Gemini CLI version.

### 4. Decision `[inline: judgment]`

Write the go/no-go in the ADR, covering demand, the maintenance cost per catalog change (conformance plus live
probes), and how much P1 and P6 already deliver with no target. Correct the Gemini column in
`distribution-channels-2026-09.md` § 3 from steps 1 and 3, and add or decline a Gemini entry in § 6.

Test: `npm run validate`, then prettier on both decision files.

### 5. Make the ground rules permanent, and run them as a regression over every target `[inline: review judgment]`

- Copy the ground rules into `docs/reference/architecture.md` § Extension model as **Rules for every target**. Then
  the next target (and any review) reads them from the repo, not from this plan. Link to that section from the
  invariants in `CLAUDE.md`, with one line.
- Audit each shipped target (`claude-code`, `copilot`, `codex`, `agents-standard`, `cursor`) against the rules. Look
  for a provider literal in catalog source or a body, a provider branch in `load` / `validate` / `resolve`, kind
  support declared anywhere other than `capabilities.ts`, a claim with no official-docs citation (`docs:` on
  `KindEmitSpec`, `aggregateDocs`), a documented limit that isn't on `KindEmitSpec.limits`, and Claude names copied
  through (the hook matchers). Write the findings in a new decision record,
  `docs/decisions/target-neutrality-regression-2026-11.md`: what passes, each violation with `file:line`, and
  a fix list for each one. Fixes are follow-up work, not part of this plan.

Test: `npx prettier --check` on the changed docs, then `npm run validate`. Every audit finding has a citation.

### 6. Close-out `[inline: depends on step 4]`

- **Go:** write the roadmap `docs/plan-gemini-target.md` with phases, not steps: capability rows, conformance
  implications, and which probes gate which phase. The roadmap repeats the ground rules, and any neutral concept from
  step 2 becomes its own phase ahead of the phases that need it. Rewrite the brief to point at it, and set its row in
  `docs/ideas/README.md` to `planned`.
- **No-go:** move the still-true facts into the ADR, delete `docs/ideas/gemini-cli-target.md`, and remove its row
  from `docs/ideas/README.md`.
- Either way, add a CHANGELOG `Unreleased` → `Documentation` line only if user-facing docs changed. Then run
  `npm run ci:local`, which must be green.

Test: `npm run ci:local`.
