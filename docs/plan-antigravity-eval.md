# Plan: Antigravity CLI target evaluation

Brief: [docs/ideas/antigravity-cli-target.md](ideas/antigravity-cli-target.md). The result is a decision, not code: a
go/no-go ADR in `docs/decisions/antigravity-target-2026-11.md` and, on a go, a phased roadmap
`docs/plan-antigravity-target.md`. Every step is `[inline]`: the work is research, reading sigil's code against it,
probing Antigravity's own loader, and a judgment call. None of it is mechanical, and a probe of model behavior must
run on Antigravity, not on the worker.

The [Cursor evaluation](decisions/cursor-target-2026-11.md) (Phase A of `docs/plan-cursor-target.md`) is the model.
The questions come from the probe list, and the answers go into one decision record.

## Why Antigravity, not Gemini CLI (decided 2026-11-02)

Google's official announcement, [Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
(Google Developers Blog), says:

- On 2026-06-18, Gemini CLI stopped serving Google AI Pro, Ultra and free Code Assist for individuals accounts, and
  now serves only paid API and Enterprise keys.
- Antigravity CLI (`agy`) is the successor. It keeps Agent Skills, Hooks, Subagents and Extensions (now Antigravity
  plugins), but not every Gemini CLI feature yet.

Gemini CLI 0.66.0 refused the owner's Google-account sign-in with the migration message. The owner chose Antigravity
as the tool sigil will use. Antigravity CLI 1.4.12 is installed (`~/.local/bin/agy`, the
[official installer](https://antigravity.google/docs/getting-started)), signed in with the owner's Google account,
and tested by the owner. Gemini CLI is out of scope and is uninstalled in step 1. Antigravity keeps its state under
`~/.gemini/antigravity-cli/`, and its docs and files may still use `.gemini` / `GEMINI.md` names inherited from
Gemini CLI. Those names are facts to record, not a reason to target Gemini CLI.

## Ground rules (every step, and the roadmap a go produces)

1. **The catalog stays provider-neutral.** A provider difference is resolved in the layer that parses or emits it,
   never in `catalog/` source, the zod schema, or `load` / `validate` / `resolve`:
   - paths and frontmatter → a `KindEmitSpec` in `src/targets/antigravity/spec/<kind>.ts`;
   - tool names and model hints → a `ToolDialect` and a tier table;
   - body terms (context file name, command argument syntax, folder names) → a `ProviderLexicon` with
     `{sigil:<term>}` tokens;
   - env references → an `EnvSyntax`; MCP entries → an `McpDialect`; config kinds → a `ConfigKindTable`;
   - hook events and matchers → the target's translation. The neutral catalog form is the input, never Claude's names
     copied through;
   - which kinds ship → `src/targets/antigravity/capabilities.ts` only.

   A difference no existing layer can carry is a finding. The fix is a new neutral concept, decided in its own phase
   the way Phase N added the neutral tool vocabulary for Cursor. It is never a provider field or a provider literal in
   a body.

2. **Official sources only.** Every capability claim cites Google's own docs (antigravity.google, or the Google
   Developers Blog). Where the docs and the shipped `agy` binary disagree, the binary decides. Blog posts and
   third-party issues can raise a question but never answer one. Anything the docs don't cover is recorded as
   "undocumented", never assumed, and step 4's live probe decides it.
3. **The best practices Google documents are carried over as data:** size or listing limits go on
   `KindEmitSpec.limits`, and the recommended scopes and trust and approval rules go in the setup docs. The same
   holds for anything sigil's existing targets already follow: `.sigil.bak` backups for home files, merging into
   user-owned config, and never overwriting it.

## Steps

## Step 1: Uninstall Gemini CLI `[inline: tiny shell step, owner-approved 2026-11-02]`

Run `npm uninstall -g @google/gemini-cli` in an nvm shell. **Keep `~/.gemini/`.** Antigravity uses
`~/.gemini/antigravity-cli/`, and which of the other files there (`google_accounts.json`, `settings.json`,
`trustedFolders.json`, `projects.json`) Antigravity also reads is a D0 question. Nothing in `~/.gemini/` is deleted
until step 2 answers it. After that, only files the docs or `agy` show to be Gemini-CLI-only may go, and only with a
one-line note.

Test: `command -v gemini` prints nothing, `npm ls -g @google/gemini-cli` shows it isn't installed, and
`agy --version` still prints 1.4.12 or later.

## Step 2: Docs pass: sigil kind vs. Antigravity mechanism `[inline: research and judgment]`

Read Google's official Antigravity CLI docs, including the Gemini CLI migration guide for what was renamed. Draft
the ADR with one row for each sigil kind (`skill`, `agent`, `prompt`, `rule`, `hook`, `mcp`, `settings`) on two
channels, the project scaffold and the plugin. Each row gets the file path, the format, the scopes (project and user),
and a docs link. Answer:

- D0. Install, version, auth and the update channel. Is there a non-interactive mode for scripted probes, and which
  files under `~/.gemini/` does `agy` read? That answer closes step 1.
- D1. Context files: what does Antigravity read (`GEMINI.md`, `AGENTS.md`, configurable names), and does it load them
  hierarchically? This is the brief's "almost free" question.
- D2. Skills: what is the native skills folder? Does it also read `.agents/skills/`, the folder `codex` and
  `agents-standard` share (`Target.sharesSkillFilesWith`)?
- D3. Subagents: what is the format and its status? Is there a tool list, a read-only flag, and model fields?
- D4. Commands or prompts: what is the form (TOML or Markdown), and what argument syntax replaces `$ARGUMENTS`?
- D5. Hooks: the events, the stdin fields, the deny exit code, and where they live.
- D6. MCP: which file and key, the env-reference syntax, and the trust or approval rules.
- D7. Settings: which keys are user-owned config that sigil could merge, if any.
- D8. Plugins: the manifest, project-scoped or user-only install, whether a plugin can ship rules or context, and
  how the marketplace works.

Test: `npx prettier --check docs/decisions/antigravity-target-2026-11.md`. Every row has an official docs link that
resolves today.

## Step 3: Reuse map against sigil's code `[inline: architecture judgment]`

For each row from step 2, name the sigil piece it would use and note any gap, with `file:line` citations. That covers
the `AGENTS.md` aggregate (Copilot `build-helpers.ts`, the Codex target), `McpDialect` and `EnvSyntax`, the
`ConfigKindTable`, Cursor's hook event and tool-name translation, the `ToolDialect` for agent tools, and
`KindEmitSpec` limits. If commands are TOML, answer the brief's TOML question: a command is a whole file sigil
writes, so it may need a TOML _writer_ but not Codex's splice merge (`src/config-merge/toml-file.ts`). Put a
capability row draft in the ADR for each kind and channel: `native`, `via` or `none`.

Then make a **neutrality table**: list every Antigravity difference found in steps 2–3 with the layer from ground
rule 1 that absorbs it. Any row with no layer goes into the decision as a needed neutral concept, with its cost. Known
debt to check first: catalog hook matchers still use Claude's tool names (a follow-up left from Phase N). An
Antigravity hook is the third consumer of them, which may be the point to make matchers neutral.

Test: each citation points to a line that exists (`sed -n <line>p <file>`), then `npm run validate`. The
neutrality table has no row that needs a change to the catalog or schema without a new neutral concept named for it.

## Step 4: Live probe in Antigravity CLI `[inline: probes Antigravity's own loader and model behavior]`

Gate: met. `agy` 1.4.12 is installed and signed in. Keep each probe to one or two short non-interactive runs (the
mode from D0) in a throwaway repo under the scratchpad, on the cheapest model the account serves. Any key stays in
the command's environment, never in a file or a worker spec. Each probe records its expected and observed results in
the ADR, with the `agy` version:

- P1. The context file from D1: an instruction in it is followed. Expected: followed. Then `AGENTS.md` alone, with no
  settings. The result decides whether the existing `AGENTS.md` output already covers rules.
- P2. A skill in the native folder from D2, plus `.agents/skills/`: is the skill listed and picked from its
  description? If both folders hold the same name, does it list once or twice?
- P3. The command or prompt form from D4 runs, and its argument is substituted.
- P4. A hook from D5 denies a write to `.env`. Record the raw stdin field names.
- P5. A stdio MCP server from D6 with an env reference starts and receives the value.
- P6. Does Antigravity read anything sigil already writes for another target (`.claude/`, `.agents/skills/`,
  `AGENTS.md`) with no settings? This sets how much a target would add.

Test: each probe's transcript summary is in the ADR with the `agy` version.

## Step 5: Decision `[inline: judgment]`

Write the go/no-go in the ADR, covering demand, the maintenance cost per catalog change (conformance plus live
probes), how much P1 and P6 already deliver with no target, and the target id (`antigravity` unless the docs name a
better one). In `distribution-channels-2026-09.md` § 3, replace the "Gemini extension" column with an
"Antigravity plugin" column built from steps 2 and 4, with a dated note that Gemini CLI was retired for individuals,
and add or decline an Antigravity entry in § 6.

Test: `npm run validate`, then prettier on both decision files.

## Step 6: Owner decisions: remove Gemini CLI's files, run the plugin import probe `[inline: shell steps and a probe of Antigravity's own loader, owner-approved 2026-11-01]`

Both decisions are the owner's, from 2026-11-01, after step 5.

- **Delete the nine Gemini-CLI-only entries** at the top of `~/.gemini/` that the D0 trace showed `agy` never opens:
  `google_accounts.json`, `trustedFolders.json`, `projects.json`, `state.json`, `state.json.bak`, `settings.json`,
  `installation_id`, `history/`, `tmp/`. Delete only these, by name. Nothing else in `~/.gemini/` (`antigravity-cli/`,
  `config/`, `antigravity-ide/`, any `AGENTS.md` / `GEMINI.md` / `skills/`) is touched. Then run one short `agy -p` and
  check that it still signs in and answers. In the ADR's D0, replace "They were left in place" with a dated line saying
  they were removed.
- **Run U7.** Build with `npm run catalog:build`, then import one sigil plugin that carries skills, rules inlined into
  them, and a hook, by path, not the bare `agy plugin import claude`. The bare form would import every plugin in
  `~/.claude/plugins/`, not only sigil's. Use `agy plugin import <dist/claude/plugins/essentials>` and import
  `dist/claude/plugins/hook-protect-config` the same way. Record what `agy plugin list --json` shows (skills, rules,
  agents, hooks, MCP) and run `agy plugin validate --strict` on the imported folder. Run one `agy -p` in a scratchpad
  repo asking for an imported skill by name, and check whether the imported hook denies a `.env` write (it should not,
  given the stdin finding). Write the results as a U7 row in the ADR's probe log. Then `agy plugin uninstall` each
  imported plugin and confirm `~/.gemini/config/plugins/` is back to its earlier contents.

Test: `ls ~/.gemini` shows none of the nine; `agy -p "Reply ok"` exits 0; the U7 row is in the ADR with the `agy`
version; `agy plugin list` shows no sigil plugin; `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.

## Step 7: Make the ground rules permanent, and run them as a regression over every target `[inline: review judgment]`

- Copy the ground rules into `docs/reference/architecture.md` § Extension model as **Rules for every target**. Then
  the next target (and any review) reads them from the repo, not from this plan. Link to that section from the
  invariants in `CLAUDE.md`, with one line.
- Audit each shipped target (`claude-code`, `copilot`, `codex`, `agents-standard`, `cursor`) against the rules. Look
  for a provider literal in catalog source or a body, a provider branch in `load` / `validate` / `resolve`, kind
  support declared anywhere other than `capabilities.ts`, a claim with no official-docs citation (`docs:` on
  `KindEmitSpec`, `aggregateDocs`), a documented limit that isn't on `KindEmitSpec.limits`, and Claude names copied
  through (the hook matchers). Write the findings in a new decision record,
  `docs/decisions/target-neutrality-regression-2026-11.md`: what passes, each violation with `file:line`, and a fix
  list for each one. Fixes are follow-up work, not part of this plan.

Test: `npx prettier --check` on the changed docs, then `npm run validate`. Every audit finding has a citation.

## Step 8: Close-out `[inline: depends on steps 5 and 6]`

- **Go:** write the roadmap `docs/plan-antigravity-target.md` with phases, not steps: capability rows, conformance
  implications, and which probes gate which phase (the plugin phase uses step 6's U7 result). The roadmap repeats the ground rules, and any neutral concept from
  step 3 becomes its own phase ahead of the phases that need it. Point the brief at it and set its
  `docs/ideas/README.md` row to `planned`.
- **No-go:** move the still-true facts into the ADR, delete `docs/ideas/antigravity-cli-target.md`, remove its row
  from `docs/ideas/README.md`, and update `docs/index.md` S7.
- Either way, add a CHANGELOG `Unreleased` → `Documentation` line only if user-facing docs changed. Then run
  `npm run ci:local`, which must be green.

Test: `npm run ci:local`.
