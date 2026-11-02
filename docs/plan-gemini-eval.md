# Plan: Google CLI target evaluation (Antigravity CLI, with Gemini CLI as legacy)

Brief: [docs/ideas/gemini-cli-target.md](ideas/gemini-cli-target.md). The result is a decision, not code: a
go/no-go ADR in `docs/decisions/google-cli-target-2026-11.md` and, on a go, a phased roadmap
`docs/plan-antigravity-target.md`. Every step is `[inline]`: the work is research, reading sigil's code against it,
probing the CLI's own loader, and a judgment call. None of it is mechanical, and a probe of model behavior must run on
the Google CLI, not on the worker.

The [Cursor evaluation](decisions/cursor-target-2026-11.md) (Phase A of `docs/plan-cursor-target.md`) is the model.
The questions come from the probe list, and the answers go into one decision record.

## Which CLI (re-scoped 2026-11-02)

Google's official announcement, [Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
(Google Developers Blog), says:

- On 2026-06-18, Gemini CLI stopped serving Google AI Pro, Ultra and free Code Assist for individuals accounts.
- Antigravity CLI is the successor. It keeps Agent Skills, Hooks, Subagents and Extensions (now Antigravity
  plugins), but not every Gemini CLI feature yet.
- Gemini CLI stays available through paid Gemini API and Enterprise API keys.

Observed here: Gemini CLI 0.66.0 refused a Google-account sign-in with that message. A **free** AI Studio key still
answered (`gemini -m gemini-flash-latest`), even though the post names paid keys only.

So the **primary candidate is Antigravity CLI**, the tool Google maintains for individuals. **Gemini CLI is legacy.**
It is evaluated only for what it shares with Antigravity (the `.gemini` layout, `GEMINI.md`, extensions → plugins),
and for whether a single target could serve both. The target id (`antigravity`, `gemini`, or one id for both) is
decided in step 4, not assumed. Older facts: the ADR snapshot
([distribution-channels-2026-09 § 3](decisions/distribution-channels-2026-09.md)) has a "Gemini extension" column
from before the transition, and step 4 corrects it.

## Ground rules (every step, and the roadmap a go produces)

1. **The catalog stays provider-neutral.** A provider difference is resolved in the layer that parses or emits it,
   never in `catalog/` source, the zod schema, or `load` / `validate` / `resolve`:
   - paths and frontmatter → a `KindEmitSpec` in `src/targets/<provider>/spec/<kind>.ts`;
   - tool names and model hints → a `ToolDialect` and a tier table;
   - body terms (context file name, command argument syntax, folder names) → a `ProviderLexicon` with
     `{sigil:<term>}` tokens;
   - env references → an `EnvSyntax`; MCP entries → an `McpDialect`; config kinds → a `ConfigKindTable`;
   - hook events and matchers → the target's translation. The neutral catalog form is the input, never Claude's names
     copied through;
   - which kinds ship → `src/targets/<provider>/capabilities.ts` only.

   A difference no existing layer can carry is a finding. The fix is a new neutral concept, decided in its own phase
   the way Phase N added the neutral tool vocabulary for Cursor. It is never a provider field or a provider literal in
   a body.

2. **Official sources only.** Every capability claim cites Google's own docs: antigravity.google for Antigravity
   CLI, geminicli.com or `docs/` in `google-gemini/gemini-cli` at a named tag for Gemini CLI, or the Google
   Developers Blog. When the docs and the shipped binary disagree, the binary is checked. Blog posts and third-party
   issues can raise a question but never answer one. Anything the docs don't cover is recorded as "undocumented",
   never assumed, and step 3's live probe decides it.
3. **The best practices Google documents are carried over as data:** size or listing limits go on
   `KindEmitSpec.limits`, and the recommended scopes and trust and approval rules go in the setup docs. The same
   holds for anything sigil's existing targets already follow: `.sigil.bak` backups for home files, merging into
   user-owned config, and never overwriting it.

## Steps

### 1. Docs pass: sigil kind vs. Antigravity CLI mechanism `[inline: research and judgment]`

Read Google's official Antigravity CLI docs, including the migration guide from Gemini CLI. Draft the ADR with one row
for each sigil kind (`skill`, `agent`, `prompt`, `rule`, `hook`, `mcp`, `settings`) on two channels: the project
scaffold and the plugin. Each row gets the file path, the format, the scopes (project and user), a docs link, and a
Gemini CLI column that says "same", "changed" or "dropped". Answer:

- D0. Install, version, and auth for an individual. What is the official install route and the current version?
  Does a free account work, and in which auth modes (Google sign-in, API key)? Is a non-interactive mode like
  `gemini -p` available for scripted probes?
- D1. Context files: what does Antigravity read (`GEMINI.md`, `AGENTS.md`, configurable names), and does it load them
  hierarchically? This is the brief's "almost free" question.
- D2. Skills: what is the native skills folder? Does it also read `.agents/skills/`, the folder `codex` and
  `agents-standard` share (`Target.sharesSkillFilesWith`), or `.gemini/skills/`?
- D3. Subagents: what is the format and its status? Is there a tool list, a read-only flag, and model fields?
- D4. Commands or prompts: did the `commands/*.toml` form survive, and what argument syntax replaces `$ARGUMENTS`?
- D5. Hooks: the events, the stdin fields, the deny exit code, and where they live.
- D6. MCP: which file and key, the env-reference syntax, and the trust or approval rules.
- D7. Settings: which keys are user-owned config that sigil could merge, if any.
- D8. Plugins: the manifest, project-scoped or user-only install, whether a plugin can ship rules or context, and
  what `agy plugin import gemini` converts.
- D9. Legacy scope: who can still use Gemini CLI, and is it still maintained (releases, the deprecation page)? Does
  sigil output for one CLI load in the other?

Test: `npx prettier --check docs/decisions/google-cli-target-2026-11.md`. Every row has an official docs link that
resolves today.

### 2. Reuse map against sigil's code `[inline: architecture judgment]`

For each row from step 1, name the sigil piece it would use and note any gap, with `file:line` citations. That covers
the `AGENTS.md` aggregate (Copilot `build-helpers.ts`, the Codex target), `McpDialect` and `EnvSyntax`, the
`ConfigKindTable`, Cursor's hook event and tool-name translation, the `ToolDialect` for agent tools, and
`KindEmitSpec` limits. If commands are still TOML, answer the brief's TOML question: a command is a whole file sigil
writes, so it may need a TOML _writer_ but not Codex's splice merge (`src/config-merge/toml-file.ts`). Put a
capability row draft in the ADR for each kind and channel: `native`, `via` or `none`.

Then make a **neutrality table**: list every Antigravity difference found in steps 1–2 with the layer from ground
rule 1 that absorbs it. Any row with no layer goes into the decision as a needed neutral concept, with its cost. Known
debt to check first: catalog hook matchers still use Claude's tool names (a follow-up left from Phase N). An
Antigravity hook is the third consumer of them, which may be the point to make matchers neutral.

Test: each citation points to a line that exists (`sed -n <line>p <file>`), then `npm run validate`. The
neutrality table has no row that needs a change to the catalog or schema without a new neutral concept named for it.

### 3. Live probe in Antigravity CLI `[inline: probes the CLI's own loader and model behavior]`

Gate: the owner installs Antigravity CLI through the official route from D0 and authenticates once in the mode D0
names. A key, if one is used, goes in the command's environment only, never in a file or a worker spec. If auth or
the free tier refuses, these probes become docs-only, and the ADR records the live risk as open, as Cursor's Phase A
did. Keep each probe to one or two short non-interactive runs in a throwaway repo under the scratchpad, on the
cheapest model the free tier serves. The free tier refuses the default model (seen on Gemini CLI 2026-11-02, where
only `gemini-flash-latest` answered). Each probe records its expected and observed results in the ADR, with the CLI
version:

- P1. The context file from D1: an instruction in it is followed. Expected: followed. Then `AGENTS.md` alone, with no
  settings. The result decides whether the existing `AGENTS.md` output already covers rules.
- P2. A skill in the native folder from D2, plus `.agents/skills/`: is the skill listed and picked from its
  description? If both folders hold the same name, does it list once or twice?
- P3. The command or prompt form from D4 runs, and its argument is substituted.
- P4. A hook from D5 denies a write to `.env`. Record the raw stdin field names.
- P5. A stdio MCP server from D6 with an env reference starts and receives the value.
- P6. Does Antigravity read anything sigil already writes for another target (`.claude/`, `.agents/skills/`,
  `AGENTS.md`, `.gemini/`) with no settings? This sets how much a target would add.
- P7 (legacy, optional): one P1 run on Gemini CLI with the free key (`-m gemini-flash-latest`, with
  `GEMINI_CLI_TRUST_WORKSPACE=true` in the throwaway dir), to check D9's "loads in both".

Test: each probe's transcript summary is in the ADR with the CLI version.

### 4. Decision `[inline: judgment]`

Write the go/no-go in the ADR, covering demand, the maintenance cost per catalog change (conformance plus live
probes), how much P1 and P6 already deliver with no target, and the target id and scope: Antigravity only, or one
target that serves both. Correct the Gemini column in `distribution-channels-2026-09.md` § 3, renaming it for
Antigravity from steps 1 and 3, and add or decline an entry in § 6.

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
  `docs/decisions/target-neutrality-regression-2026-11.md`: what passes, each violation with `file:line`, and a fix
  list for each one. Fixes are follow-up work, not part of this plan.

Test: `npx prettier --check` on the changed docs, then `npm run validate`. Every audit finding has a citation.

### 6. Close-out `[inline: depends on step 4]`

- **Go:** write the roadmap `docs/plan-antigravity-target.md` with phases, not steps: capability rows, conformance
  implications, and which probes gate which phase. The roadmap repeats the ground rules, and any neutral concept from
  step 2 becomes its own phase ahead of the phases that need it. Replace the brief with
  `docs/ideas/antigravity-cli-target.md` pointing at the roadmap, and update its `docs/ideas/README.md` row to
  `planned`.
- **No-go:** move the still-true facts into the ADR, delete `docs/ideas/gemini-cli-target.md`, and remove its row
  from `docs/ideas/README.md`.
- Either way, add a CHANGELOG `Unreleased` → `Documentation` line only if user-facing docs changed. Then run
  `npm run ci:local`, which must be green.

Test: `npm run ci:local`.
