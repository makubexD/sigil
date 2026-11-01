# Plan: ADR Phase 6, the Cursor target (roadmap)

Source: [distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) § 6, Phase 6: "Cursor adapter
(`.cursor/rules/*.mdc`, agents, commands, hooks, MCP; Cursor plugin — the one format that carries rules)", and the brief
[cursor-target](ideas/cursor-target.md).

This is a phase-level roadmap, not a step plan. Each phase is one branch and one PR, and gets a step-level
`docs/plan-cursor-target-<phase>.md` when it starts. A phase that opens with a spike ends the spike in a written
go/no-go, and a recorded no-go counts as done.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase: `workflow-report .`,
`/agent-skills:review`, a `CHANGELOG.md` entry, the ADR note updated, and the step plan deleted after merge.

## Summary

Cursor is the friendliest target so far: every kind has a documented file, MCP is JSON, and hooks exit `2` to deny,
as sigil's hooks already do. Four findings shape the order:

1. **Cursor also reads other tools' folders.** It loads skills from `.agents/skills/`, `.claude/skills/` and
   `.codex/skills/`, agents from `.claude/agents/` and `.codex/agents/`, and (per the docs) Claude Code hooks from
   `.claude/settings.json`. A project with `claude-code` and `cursor` installed would load each skill twice unless the
   target knows about it. That is the main design question (Decision 1), not the file formats. Phase A: a name clash
   lists the `.cursor` skill once; whether `.claude/settings.json` hooks also run was not settled (A5).
2. **Rules map cleanly, without a new field.** `.mdc` frontmatter has `description`, `globs` and `alwaysApply`. An
   unscoped rule (`appliesTo: ["**/*"]`) becomes `alwaysApply: true`, matching Claude's path-less rule; a scoped one
   becomes `globs` plus `alwaysApply: false`. `severity` stays unmapped, as on every target. That retires the brief's
   riskiest assumption on paper; Phase A confirms it live.
3. **Agents may be possible, unlike Codex.** All 39 catalog agents set `tools: [Read, Grep, Glob]`. A Cursor subagent
   has no tool list, but `readonly: true` blocks edits and shell. Phase A found it runs the subagent in Ask mode, which
   refused both shell calls tried (even `ls -la`) and Write, while Glob works: close to the authored list. Whether that
   is enough is an owner call (Phase E).
4. **Commands are being folded into skills.** Cursor 2.4+ ships `/migrate-to-skills` for slash commands, so `prompt`
   follows Codex: `none` (Decision 3).

## Decisions

Confirmed by the owner on 2026-11-01.

1. **Skills go to `.cursor/skills/` (Cursor's native folder), and `add` refuses a `cursor` install that would
   double-load.** Cursor reads
   `.agents/skills/` too, so sharing Codex's files (`sharesSkillFilesWith`) is the other option. It is rejected because
   it would block `cursor` and `codex` in one project for no gain. Probe A3 checks what Cursor does with two skills of the
   same name. If it dedupes by name, the refusal becomes a warning. **A3: it does (`.cursor` wins), so `add` warns.**
2. **Rule mode:** `appliesTo` equal to `["**/*"]` (the schema default) → `alwaysApply: true`; anything else →
   `globs: <comma-joined>` + `alwaysApply: false` + `description`. Never gated on `language`. The `Apply Intelligently`
   mode (description only) is not used: no catalog field asks for it.
3. **`prompt: none`**, with the migration doc as the reason, like Codex.
4. **No `AGENTS.md`** (changed in Phase B, see
   [the decision record](decisions/cursor-target-2026-11.md#phase-b-two-changes-to-the-roadmap)): with native rules,
   every repo-wide rule is already an `alwaysApply` `.mdc` file, and an `AGENTS.md` would load each one twice.
5. **Agents ship with `readonly: true`** (owner, 2026-11-01): acceptable for `tools: [Read, Grep, Glob]`, provided the
   mapping is implemented in `tool-restriction.ts` with tests that refuse any list holding a write tool (Phase E).
6. **The plugin channel stays a spike** (Phase F), not an adapter task.

## What is true today (checked 2026-11-01)

### Brief evidence

| Brief says                                           | Today                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.ts:19-20` registers only Claude and Copilot   | **Stale.** Four targets: `claude-code`, `copilot`, `agents-standard`, `codex`. No `cursor`. |
| Rules would exercise the `plugin` channel in new way | True. No target has a `plugin` row with `rule: native`.                                     |
| Extension recipe at `index.ts:3-7`                   | Still there, still too short: Codex also needed hook ops, MCP ops and a lexicon.            |

### Cursor facts the phases rely on

Sources: [rules](https://cursor.com/docs/context/rules), [skills](https://cursor.com/docs/context/skills),
[subagents](https://cursor.com/docs/context/subagents), [hooks](https://cursor.com/docs/agent/hooks),
[third-party hooks](https://cursor.com/docs/reference/third-party-hooks), [MCP](https://cursor.com/docs/context/mcp),
[plugins reference](https://cursor.com/docs/reference/plugins), [CLI](https://cursor.com/docs/cli/overview).

- **Rules:** `.cursor/rules/**/*.mdc` only; a `.md` file there is ignored. Frontmatter `description`, `globs`,
  `alwaysApply`. Docs advise under 500 lines (a `KindEmitSpec.limits` candidate, advisory).
- **Skills:** `.cursor/skills/<name>/SKILL.md` (or `.agents/skills/`); `name` must match the folder. Optional `paths`
  (list or comma string) and `disable-model-invocation`. `scripts/`, `references/`, `assets/` load.
- **Subagents:** `.cursor/agents/*.md`, fields `name`, `description`, `model` (`inherit` or an id), `readonly`,
  `is_background`. No tool list. `.cursor/` wins over `.claude/` and `.codex/` on a name clash.
- **Hooks:** `.cursor/hooks.json` (project) and `~/.cursor/hooks.json` (user), `{"version": 1, "hooks": {...}}`, camelCase
  events (`preToolUse`, `beforeShellExecution`, `afterFileEdit`, …), one `command` string, optional `matcher` and
  `timeout`. Exit `2` denies; any other non-zero exit fails open. On Windows the desktop app runs hooks through
  PowerShell. Project hooks run only in a trusted workspace.
- **Claude hooks:** Cursor also runs hooks from `.claude/settings.json` / `.claude/settings.local.json`, mapping tool
  names (`Bash`→`Shell`, `Edit`→`Write`; `Glob` unsupported).
- **MCP:** `.cursor/mcp.json` / `~/.cursor/mcp.json`, `mcpServers` object, `${env:NAME}` interpolation in `command`,
  `args`, `env`, `url`, `headers`. JSON, so the Phase-D file-format seam needs no new format.
- **Plugins:** `.cursor-plugin/plugin.json` (`name` required, kebab-case) with `rules`, `agents`, `skills`, `commands`,
  `hooks` (`hooks/hooks.json`), `mcpServers` (`mcp.json`); folder discovery when a field is absent. Multi-plugin repos use
  `.cursor-plugin/marketplace.json` (`name`, `owner`, `plugins`). The Agent Plugins standard (`plugin.json` at the root)
  also loads, but only skills and MCP.
- **CLI:** `curl https://cursor.com/install -fsS | bash`, then `agent` (interactive) or `agent -p` (print mode). It needs a
  Cursor sign-in, which Codex's probes didn't.

### sigil facts the phases rely on

- `protect-config` (`catalog/shared/hooks/protect-config.hook.md`) is `PreToolUse`, matcher `Edit|Write`, `node -e …`,
  reads `tool_input.file_path ?? tool_input.path`, exits `2`. Cursor's `Write` input field names are not documented:
  Phase A must capture a real payload, or the hook may fail open on Cursor as it would have on Codex.
- Codex's `hook-ops.ts` already turns `command` + `args` into one line (`posixCommandLine`, `nodeEvalCommandLine`). Move
  them to a shared module rather than copy them.
- `env-reference.ts` takes one `EnvSyntax` per file format: Cursor adds `${env:NAME}`.
- 65 catalog rules, 6 of them unscoped; 2 prompts; 3 hooks; 39 agents, all `tools: [Read, Grep, Glob]`.

## Phases

| Phase | Ships                                                | Gate                           |
| ----- | ---------------------------------------------------- | ------------------------------ |
| A     | Probe results and a decision record, no code         | Owner signs in to Cursor's CLI |
| B     | `--target cursor`: rules (`.mdc`) and skills         | A1-A3                          |
| C     | Hooks in `.cursor/hooks.json`                        | A4-A5                          |
| D     | MCP in `.cursor/mcp.json`                            | A6                             |
| E     | Agents in `.cursor/agents/` with `readonly: true`    | Decided: go (Decision 5); A7   |
| F     | Cursor plugin channel (`.cursor-plugin/`)            | Research spike, A8             |
| G     | Live check in Cursor, the ADR updated, the brief cut | B-D merged                     |

Order: A → B, then C, D (independent of each other), then E and F, which only depend on B. G closes.

### Phase A: live probe

The CLI is installed (`cursor-agent` 2026.10.22-27dcf5f, `~/.local/bin/agent`, 2026-11-01). The owner signs in once
with `agent login` on Cursor's free plan (limited agent requests; keep the probe to a few short `agent -p` runs), then
scripted runs in throwaway repos. OpenCode or Codex can't stand in: the probe tests Cursor's own loader. Every answer goes
into `docs/decisions/cursor-target-2026-11.md`.

- **A1.** An `.mdc` rule with `alwaysApply: true` loads in a print-mode session; one with `globs` loads only when a
  matching file is in context; a file with both `globs` and `description` behaves like the glob row.
- **A2.** A `.cursor/skills/<name>/SKILL.md` skill is listed and picked from its description; a reference file loads.
- **A3.** The same skill name in `.cursor/skills/` and `.claude/skills/`: one listing or two?
- **A4.** The raw `preToolUse` stdin for a `Write` to `.env` (field names), and that exit `2` from the hook denies it.
- **A5.** Does a `.claude/settings.json` hook also run in Cursor, and does it run twice next to the same `.cursor` hook?
- **A6.** A `.cursor/mcp.json` stdio server with `${env:NAME}` in `env` starts and gets the value.
- **A7.** A `readonly: true` subagent can't write a file or run `touch`, and what it still can do (shell reads, web).
- **A8.** A local `.cursor-plugin/` marketplace installs (if the CLI can install plugins at all), and a plugin rule loads.

If sign-in isn't possible, A1-A3 and A7-A8 become docs-only and Phase G carries the live risk.

**Done 2026-11-01**: results and what they change are in
[cursor-target-2026-11.md](decisions/cursor-target-2026-11.md). A1's `globs` case, A5 and A8 stayed open (A8 docs-only).

### Phase B: the target, with rules and skills

New `src/targets/cursor/` (capabilities, lexicon, doc refs, `KindEmitSpec`s for `rule` and `skill`), registered in
`index.ts`. `rule` → `.cursor/rules/<id-slug>.mdc` per Decision 2, the third `appliesTo` emitter kept in agreement with
Claude's and Copilot's (a shared test over the 65 rules). `skill` → `.cursor/skills/<name>/` with references. Decision 1's
double-load check in `add`, a warning since A3. No home-scope `cursor` skill install offered over sigil's Claude plugin:
Cursor already loads Claude Code's plugin skills (A3). No `AGENTS.md` (Decision 4). `prompt`, `agent`,
`workflow`, `settings`: `none` with reasons. Capability table, `capabilities.md`, `sync --check` (coverage, unemitted fields, term leaks) green.

**Done 2026-11-01** in #153 (step plan [plan-cursor-target-b.md](plan-cursor-target-b.md)): `.mdc` rules and
`.cursor/skills/`, no `AGENTS.md`, and `readerWins` overlap notes in `add` and `status`. Setup page:
[setup/cursor.md](setup/cursor.md).

### Phase C: hooks in `.cursor/hooks.json`

Hook ops mapping Claude event names to Cursor's (`PreToolUse` → `preToolUse`, …), refusing undocumented events like
Codex does, writing `version: 1`, joining `command` + `args` with the shared helpers. Home scope `~/.cursor/hooks.json`
with `ensureHomeBackup`. A RED test over A4's captured payload proves `protect-config` denies a `.env` write on Cursor;
A4 found `tool_input.file_path`, so the parser needs no change. A4 also found the edit's hook call named `Read`: capture
an allowed edit's calls before choosing the matcher that `Edit|Write` maps to. A5 was inconclusive (its matcher matched
no call): rerun it with a matcher-less `.claude` hook and document whether hooks run twice.

**Done 2026-11-01** in #155 (step plan [plan-cursor-target-c.md](plan-cursor-target-c.md)): hooks in
`.cursor/hooks.json` and `~/.cursor/hooks.json` with the home backup, unrenderable hooks skipped with a reason, the
`hook-target-render` sync rule, and a live CLI block of a sigil-installed hook. A5's rerun: the Cursor CLI never runs
`.claude/settings.json` hooks, so nothing runs twice. Setup: [setup/cursor.md](setup/cursor.md).

### Phase D: MCP in `.cursor/mcp.json`

MCP ops through the existing JSON writer, `${env:NAME}` as Cursor's `EnvSyntax` (expanded, A6), project and home scope.
The setup note says a project server needs approval, and print mode also needs `--force` to call it.

**Done 2026-11-01** in #157 (step plan [plan-cursor-target-d.md](plan-cursor-target-d.md)): servers in
`.cursor/mcp.json` and `~/.cursor/mcp.json` with the home backup, rendered from data (`McpDialect`) through a
`ConfigKindTable` that Codex also adopted, and `config-target-render` replacing `hook-target-render`. `shared/ado` ships
to Cursor. Probes: Cursor never reads `.mcp.json`, `${env:NAME}` expands in `args`, and an unknown `type` drops the
whole file. A sigil-installed `filesystem` server ran live in the CLI. Setup: [setup/cursor.md](setup/cursor.md).

### Phase E: agents

Go (Decision 5), recorded in the ADR. `tool-restriction.ts` learns that a read-only tool list maps to `readonly: true` on
Cursor and refuses any list with a write tool, plus the agent `KindEmitSpec`. Tests: every catalog agent renders with
`readonly: true`; a list with `Write`, `Edit` or `Bash` is refused; an absent `tools` is refused (it would mean all
tools). The ADR records what `readonly` still allows (A7).

### Phase F: Cursor plugin channel

Spike: is the plugin format stable enough to emit, and can sigil's packs become `.cursor-plugin/marketplace.json`
entries? A go adds `plugin` capability rows (the first `rule: native` on that channel) and a `dist/cursor/` build; a
no-go records why and points users at `sigil add --target cursor`. First check whether sigil's Claude marketplace plugin
already works in Cursor: A3 and A8 showed Cursor loading Claude Code's installed plugins, while a `--plugin-dir` rule
did not load.

### Phase G: close-out

Live check in Cursor (the brief's success criterion: rules and skills load, including a `globs` rule attaching once the
agent reads a matching file, which A1 left open), ADR § 3 and § 6 updated, the brief and its
`docs/ideas/README.md` row deleted, the Cursor version recorded, `npm run ci:local` green, then delete these plan files.

## Out of scope

Codex and Gemini, a Cursor `settings` kind, Cursor Tab, team or enterprise distribution (dashboard hooks, team
marketplaces), Cloud Agents, and the `Apply Intelligently` rule mode.
