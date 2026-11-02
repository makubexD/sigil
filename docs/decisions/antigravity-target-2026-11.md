# Antigravity CLI target (2026-11)

Status: **go, staged** (decided 2026-11-01). Docs pass, reuse map and live probes done against Antigravity CLI
`1.4.12`, Linux. The steps are in [plan-antigravity-eval.md](../plan-antigravity-eval.md); the brief is
[antigravity-cli-target.md](../ideas/antigravity-cli-target.md).

## How the docs pass ran

Every claim below cites a page on `antigravity.google/docs`, read on 2026-11-01 as the Markdown each page publishes at
`<page>.md`. The page list came from the URLs compiled into the `agy` binary and from
[llms.txt](https://antigravity.google/llms.txt). Where a page and the binary could be compared without a model call,
the binary was checked: `strace` of `agy mcp list`, `agy plugin list`, `agy agents`, and one `agy -p` run on
`gemini-3.8-flash-low` in an empty `git init` repo under the scratchpad (D0). Everything else marked
**undocumented** or **conflict** goes to the step 4 probes; nothing here is assumed.

Antigravity is one agent with three surfaces (App, CLI, IDE) sharing one customization layout. This record is about the
CLI. Where a page says the App or IDE differs, the CLI row is the one used.

## Kind table

Workspace paths are relative to each folder from the one `agy` starts in up to the repository root (the folder holding
`.git`). Antigravity reads each level, never subfolders below the start folder
([Customization discovery](https://antigravity.google/docs/customization-discovery#workspace-folders-and-parent-directories)).
User paths are under `~/.gemini/config/` unless noted, shared with the Antigravity App. Plugin paths are relative to
the plugin root.

| sigil kind | Channel  | Path                                                                                                                                                    | Format                                                                                                                                                            | Scopes                                         | Docs                                                                                                                                        |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| skill      | scaffold | `.agents/skills/<name>/SKILL.md`; user `~/.gemini/config/skills/<name>/SKILL.md` (CLI also `~/.gemini/antigravity-cli/skills/`, `~/.gemini/skills/`)    | Agent Skills `SKILL.md`: `name` (optional, defaults to folder), `description` (required); `scripts/`, `references/` etc. beside it                                | project, user                                  | [Agent skills](https://antigravity.google/docs/skills#cli-skill-locations)                                                                  |
| skill      | plugin   | `skills/<name>/SKILL.md` (plus extra dirs listed in `plugin.json` `skills`)                                                                             | Same, but `name` required and must match the folder (1–64 chars), `description` 1–1,024 chars, optional `disable-model-invocation`                                | wherever the plugin is installed               | [Build plugins](https://antigravity.google/docs/build-plugins#agent-skills)                                                                 |
| agent      | scaffold | `.agents/agents/<name>.md` or `.agents/agents/<name>/agent.md`; user `~/.gemini/config/agents/`                                                         | Markdown + YAML: `name`, `description`, `tools`, `model`, `mainAgent`, `subagent`, `commandExecutionPolicy`, `mcpServers`, `skills`                               | project, user                                  | [Custom subagents](https://antigravity.google/docs/subagents#agent-location-and-discovery)                                                  |
| agent      | plugin   | `agents/<name>.md` or `agents/<name>/agent.md`                                                                                                          | Same, plus `inheritMcp` / `inheritCustomizations`                                                                                                                 | wherever the plugin is installed               | [Build plugins](https://antigravity.google/docs/build-plugins#subagents)                                                                    |
| prompt     | scaffold | none. Workflows (`.agents/workflows/<name>.md`) stopped working on 2026-10-19; a skill is the slash command (`/<skill-name>`)                           | n/a                                                                                                                                                               | n/a                                            | [Migrate from workflows to skills](https://antigravity.google/docs/migration/workflows-to-skills)                                           |
| prompt     | plugin   | none. `commands/` folders and `workflows/` files in a plugin are not loaded (`agy plugin validate` warns)                                               | n/a                                                                                                                                                               | n/a                                            | [Build plugins](https://antigravity.google/docs/build-plugins#supported-components), [changelog](https://antigravity.google/docs/changelog) |
| rule       | scaffold | `AGENTS.md` / `GEMINI.md` (also under `.agents/`), and `.agents/rules/*.md` (one level deep); user `~/.gemini/AGENTS.md`, `~/.gemini/config/rules/*.md` | `AGENTS.md` / `GEMINI.md`: plain Markdown, always on. `rules/*.md`: YAML `trigger` (`always_on`, `model_decision`, `glob`, `manual`), `description`, `globs`      | project (cumulative up to the repo root), user | [Rules](https://antigravity.google/docs/rules#where-rules-are-stored)                                                                       |
| rule       | plugin   | `rules/AGENTS.md` (or `rules/GEMINI.md`), `rules/<name>.md`                                                                                             | Same as scaffold                                                                                                                                                  | wherever the plugin is installed               | [Build plugins](https://antigravity.google/docs/build-plugins#rules)                                                                        |
| hook       | scaffold | `.agents/hooks.json`; user `~/.gemini/config/hooks.json`                                                                                                | JSON: hook name → `{ enabled?, <Event>: [...] }`; tool events wrap handlers in `{ matcher, hooks: [{ type, command, timeout }] }`                                 | project, user                                  | [Hooks](https://antigravity.google/docs/hooks#schema-and-file-format)                                                                       |
| hook       | plugin   | `hooks.json` at the plugin root (`hooks/hooks.json` is not read)                                                                                        | Same; commands run with the plugin root as `cwd`                                                                                                                  | wherever the plugin is installed               | [Build plugins](https://antigravity.google/docs/build-plugins#lifecycle-hooks)                                                              |
| mcp        | scaffold | `.agents/mcp_config.json`; user `~/.gemini/config/mcp_config.json`                                                                                      | JSON `mcpServers.<key>`: `command` + `args` + `env` + `cwd`, or `serverUrl` (or `url`) + `headers`; `disabled`, `enabledTools`, `disabledTools`, `timeoutSeconds` | project, user                                  | [MCP](https://antigravity.google/docs/mcp#mcp-configuration-structure)                                                                      |
| mcp        | plugin   | `mcp_config.json` at the plugin root; keys become `<plugin>_<key>`                                                                                      | Same, plus `variables` and `${VAR}`, `${PLUGIN_ROOT}`, `${PLUGIN_DATA}` expansion                                                                                 | wherever the plugin is installed               | [Build plugins](https://antigravity.google/docs/build-plugins#mcp-servers)                                                                  |
| settings   | scaffold | `~/.gemini/antigravity-cli/settings.json` only; no documented workspace file                                                                            | JSON, rewritten by the CLI at every start                                                                                                                         | user                                           | [Settings](https://antigravity.google/docs/settings#setting-up-preferences)                                                                 |
| settings   | plugin   | none: the manifest schema has no settings field                                                                                                         | n/a                                                                                                                                                               | n/a                                            | [Build plugins](https://antigravity.google/docs/build-plugins#full-json-schema)                                                             |

## Answers

### D0. Install, auth, updates, scripted runs, and `~/.gemini/`

- **Install and version.** The official installer puts `agy` in `~/.local/bin/` (here `1.4.12`)
  ([Get started](https://antigravity.google/docs/getting-started)). It updates itself in the background, with a 15-minute
  check marker and a lock under `~/.gemini/antigravity-cli/updater/`; `agy update` updates on demand
  ([Troubleshooting](https://antigravity.google/docs/cli/troubleshooting#resolve-self-updater-locks-and-failures)). There
  is no documented channel choice, so a probe's version must be recorded with each result.
- **Auth.** A Google account sign-in, kept in the OS keyring. For CI there are two documented routes: a Gemini API key
  (`"modelProvider": "gemini"` in `settings.json` plus `GEMINI_API_KEY` in the environment, never a `.env` file), or
  Application Default Credentials ([Authenticate](https://antigravity.google/docs/install#local-silent-keyring-sign-in)).
- **Scripted probes.** Yes: `agy -p "<prompt>"` with `--output-format json` or `stream-json`, `--model`, `--effort`,
  `--agent`, and `--print-timeout` (default five minutes). A tool that needs approval is soft-denied in print mode: the
  run goes on and exits `0`, with a note on stderr. Workspace file reads and writes are auto-allowed, and shell commands
  and MCP tools need a `permissions.allow` rule or `--dangerously-skip-permissions`
  ([Headless mode](https://antigravity.google/docs/cli/headless#permissions-in-headless-mode)). The models this account
  serves include `gemini-3.8-flash-low` (`agy models`).
- **Which `~/.gemini/` files `agy` reads.** The docs name `~/.gemini/AGENTS.md`, `~/.gemini/GEMINI.md`,
  `~/.gemini/skills/`, everything under `~/.gemini/config/`, and `~/.gemini/antigravity-cli/`
  ([Customization discovery](https://antigravity.google/docs/customization-discovery#where-antigravity-looks)). The
  traced print run opened those, plus `~/.gemini/config/global_workflows`. **It never opened** `google_accounts.json`,
  `trustedFolders.json`, `projects.json`, `state.json`, `state.json.bak`, `settings.json`, `installation_id`, `history/`
  or `tmp/` at the top of `~/.gemini/`, which are Gemini CLI's. The migration guide confirms that Gemini CLI kept MCP
  servers in `~/.gemini/settings.json` and that Antigravity does not
  ([Migrating from Gemini CLI](https://antigravity.google/docs/cli/gcli-migration#mcp-config-formatting-changes)). That
  closes step 1: those nine are Gemini-CLI-only and safe to remove. On 2026-11-01 the owner had them removed, by name
  and nothing else; `agy -p "Reply ok"` still signed in and answered afterwards.

### D1. Context files

Antigravity reads `AGENTS.md` and `GEMINI.md`, both with no settings needed, plus `.agents/AGENTS.md` and
`.agents/GEMINI.md`. It loads them **upward**: in the start folder and in every parent up to the repository root, and
the rules add up instead of replacing each other. It does **not** load a nested `AGENTS.md` below the start folder,
even when the agent works there ([Rules](https://antigravity.google/docs/rules#directory-scoped-rules)). No setting
renames the file. User-level files are `~/.gemini/AGENTS.md`, `~/.gemini/GEMINI.md` and the same two under
`~/.gemini/config/` ([Rules](https://antigravity.google/docs/rules#global-rules)). Each rule file is truncated at
24,000 bytes, and all always-on and global rules share a 20,000-token budget, past which the largest are demoted to a
path-and-description pointer ([Rules](https://antigravity.google/docs/rules#size-limits-and-token-budgets)).

So the brief's "almost free" question is answered **yes, on the docs**: the root `AGENTS.md` that sigil already writes
for Copilot and Codex is read as-is. Antigravity also has per-file rules sigil can map: `.agents/rules/<id>.md` with
`trigger: glob` and a comma-separated `globs` string for a scoped rule, `trigger: always_on` for a repo-wide one. The
docs warn that a missing or camelCase `trigger` silently drops the rule. P1 checks both.

### D2. Skills

The native project folder is **`.agents/skills/`**, the same folder `codex` and `agents-standard` write
(`Target.sharesSkillFilesWith`). The migration guide says so in as many words: Gemini CLI's `.gemini/skills/` became
`.agents/skills/` ([Migrating from Gemini CLI](https://antigravity.google/docs/cli/gcli-migration#updated-skills-paths)).
The scan is one level deep, and parent folders up to the repo root are read too. Each skill also becomes a slash
command `/<name>` in the CLI ([Agent skills](https://antigravity.google/docs/skills#slash-command-conversion)).

When two skills share a name, one wins: the repo's personal folder, then the workspace, then `~/.gemini/config/`, then
built-ins. In the CLI, `~/.gemini/antigravity-cli/skills/` and `~/.gemini/skills/` beat all of them, and manifest
`exclude` lists don't hide them. Plugin skills are named `<plugin>:<skill>`, so they never collide
([Customization discovery](https://antigravity.google/docs/customization-discovery#which-customization-wins)). The
same name in two workspace levels (repo root and a subfolder) is undocumented; P2 covers the collision case.

### D3. Subagents

Custom agents are Markdown with YAML frontmatter, documented as a normal feature (no preview label)
([Custom subagents](https://antigravity.google/docs/subagents#custom-subagents)):

- **Tool list:** `tools`, an allowlist of Antigravity tool names (`view_file`, `grep_search`, `find_by_name`,
  `run_command`, `write_to_file`, `replace_file_content`, …; the full list is on
  [Hooks](https://antigravity.google/docs/hooks#supported-tools)). A misspelt name may hang the subagent (a known
  issue the page names).
- **Read-only:** no flag. Leaving file-edit and shell tools out of `tools` makes a read-only reviewer
  ([Build plugins](https://antigravity.google/docs/build-plugins#subagents)). The `define_subagent` tool has
  `enable_write_tools`, but that is a runtime argument, not frontmatter. There is no `disallowedTools`.
- **Model:** `model` is a tier, not a model id: `inherit`, `flash`, `pro` on the subagents page, plus `flash_lite` on the
  plugins page. sigil's `fast | balanced | deep` would map to a tier table.
- Others: `mainAgent` and `subagent` (both default `true`), `commandExecutionPolicy` (default `sandbox`), `mcpServers`,
  `skills` (skill paths).

**Conflict:** the default for an absent `tools` is `[]` on the subagents page and "All tools" on the plugins page. This
matters for sigil's invariant that an unmapped read-only list must never grant write access. P-probe in step 4.
(Answered: `[]` holds; a subagent without an edit tool wrote nothing (U3, D1 run 9). The tool names in the docs load
and work, except `multi_replace_file_content`; the binary's `read_file` / `write_file` / `edit_file` are a second,
parallel set (D1). Phase D writes the documented names, one per tool, and the full list for an agent with no `tools`;
see [plan-antigravity-target-d.md](../plan-antigravity-target-d.md).)

### D4. Commands and prompts

There is no command or prompt file any more. Workflows (`.agents/workflows/*.md`, 12,000-character limit) were the
form, and they **stopped working on 2026-10-19**; the replacement is a skill, which the CLI exposes as `/<skill-name>`
([Migrate from workflows to skills](https://antigravity.google/docs/migration/workflows-to-skills)). Gemini CLI's TOML
commands are converted to skills by `agy plugin import gemini`
([Migrating from Gemini CLI](https://antigravity.google/docs/cli/gcli-migration#converting-extensions-to-plugins)), and
a plugin's `commands/` folder is not loaded. A plugin skill can set `disable-model-invocation: true` to run only from
its slash command ([Build plugins](https://antigravity.google/docs/build-plugins#agent-skills)).

So the brief's TOML question is moot: no TOML writer is needed. **Undocumented:** how text typed after `/<skill-name>`
reaches the skill, and whether any placeholder replaces `$ARGUMENTS`. P3 decides it. Until then a sigil `prompt` has no
native home on this target.

### D5. Hooks

Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`. Only the two tool
events take a `matcher`, a regular expression over Antigravity's tool names (`run_command`, `write_to_file`,
`replace_file_content`, `browser_.*`, MCP tools as `mcp:.*`). Files: `.agents/hooks.json`,
`~/.gemini/config/hooks.json`, or a plugin's root `hooks.json`; hooks in `settings.json` are not loaded
([Hooks](https://antigravity.google/docs/hooks)).

- **stdin** (camelCase JSON): every event gets `conversationId`, `workspacePaths`, `transcriptPath`,
  `artifactDirectoryPath`, `modelName`. `PreToolUse` adds `toolCall.name`, `toolCall.args` and `stepIdx`. A write's
  path is in `toolCall.args.TargetFile` (`write_to_file`, `replace_file_content`, `multi_replace_file_content`), a shell
  command in `toolCall.args.CommandLine`.
- **Deny:** exit `0` with `{"decision": "deny", "reason": "..."}` on stdout. Other decisions are `allow`, `auto_approve`,
  `ask`, `force_ask` and `deny_unless_prior_grant`, and `overwrite` rewrites the arguments. **A non-zero exit is logged
  and ignored (fails open)**, says the plugins page
  ([Build plugins](https://antigravity.google/docs/build-plugins#lifecycle-hooks)). That would be the opposite of
  Claude's and Cursor's exit-2 deny. **The binary disagrees:** in P4 and again in E1 (`agy 1.4.12`), exit 2 from a
  `PreToolUse` hook denied the write and the model saw the reason. A `Stop` hook's exit 2 does not keep the loop going.
- Handler fields: `type` (only `command`), `command`, `timeout` (seconds, default 30).

**Conflict:** a `Stop` hook blocks with `decision: "continue"` on the hooks page and `decision: "block"` on the plugins
page. P4 found that exit 2 denies on `1.4.12` (see the probe log).

### D6. MCP

Files: `.agents/mcp_config.json` (workspace) and `~/.gemini/config/mcp_config.json` (user), both an `mcpServers` map; a
plugin's root `mcp_config.json` is namespaced `<plugin>_<key>`. A stdio entry is `command` + `args` + `env` + `cwd`;
a remote one is `serverUrl` (or `url`) with `headers`, Streamable HTTP only, so legacy SSE and `httpUrl` are rejected
([MCP](https://antigravity.google/docs/mcp#mcp-configuration-structure)). When the user file and the workspace file
use the same key, whichever server is already running keeps it
([Settings](https://antigravity.google/docs/settings#other-configuration-files)).

- **Env references:** in a plugin, `${NAME}` expands from a declared `mcpServers.<key>.variables` entry (in `command`,
  `args`, `env`, `url`, `headers`, `oauth`), and `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` expand in `args`, `cwd` and `env`
  ([Build plugins](https://antigravity.google/docs/build-plugins#plugin-path-variables)). **For the workspace and user
  files no env syntax is documented**: whether `${NAME}` there reads the process environment is a P5 question
  (answered: it doesn't, but the server inherits `agy`'s environment; P5, C1). A plugin
  that declares `variables` installs disabled until the user fills them in.
- **Trust and approval:** an unconfigured MCP tool runs in Ask mode. Approval is a permission rule, `mcp(server/tool)`,
  `mcp(server/*)` or `mcp(*)` ([MCP](https://antigravity.google/docs/mcp#mcp-permissions-and-access-control)). In print
  mode an Ask is soft-denied, so P5 needs an allow rule.

### D7. Settings

The CLI's settings are user-only, in `~/.gemini/antigravity-cli/settings.json`. **The CLI owns that file:** it saves
only non-default keys, rewrites the file in its own format at every start, and sets mode `0600`. It keeps unknown keys
([Settings](https://antigravity.google/docs/settings#how-the-cli-reads-and-saves-settingsjson)). The one key that is
user-owned config sigil could merge is `permissions` (`allow` / `ask` / `deny` arrays of `action(target)` strings)
([Settings](https://antigravity.google/docs/settings#permissions)). The `/permissions` panel also has **Project** and
**Shared** scopes, but no page says which file holds them
([/permissions](https://antigravity.google/docs/cli/commands/permissions)). A repo-root `.gemini/config.json` exists, for
`personal_customization_dir` only
([Customization discovery](https://antigravity.google/docs/customization-discovery#personal-folders-in-a-shared-repository)).

So `settings` is a weak fit: one user-scoped file the tool rewrites at start, which order-preserving `serialize()` can't
protect. A first version would leave it `none`.

### D8. Plugins

- **Manifest:** `plugin.json` at the plugin root, or `.antigravity-plugin/plugin.json`, which wins over the root file and
  is meant for repositories that also ship `.claude-plugin/plugin.json` or `.cursor-plugin/plugin.json`. Only `name`
  is required (kebab-case); the Marketplace also needs `displayName`, `description`, `version`, `logo` and `author`.
  The schema is published and closed (`additionalProperties: false`)
  ([Build plugins](https://antigravity.google/docs/build-plugins#manifest-file-pluginjson)).
- **Components:** skills, agents, rules (`rules/AGENTS.md` always on, `rules/<name>.md` with a trigger), `hooks.json`
  and `mcp_config.json`. **A plugin can ship rules and context**, unlike a Claude plugin. It cannot ship commands or
  settings ([Build plugins](https://antigravity.google/docs/build-plugins#supported-components)).
- **Install scope:** both. `agy plugin install <name> | <GitHub URL> | <path>` installs into the user profile
  (`~/.gemini/config/plugins/<plugin>/`, read-only, replaced on update). A folder placed in `.agents/plugins/<plugin>/`
  is a workspace plugin ([Plugins](https://antigravity.google/docs/plugins#manual-plugin-installation)).
  `agy plugin validate --strict` checks a plugin before release.
- **Marketplace:** one official marketplace, `antigravity-plugins-official`, which `install` defaults to. Getting
  listed is a partner intake form; there is no documented way to add a third-party marketplace, so sigil's route
  would be a GitHub URL ([Marketplace](https://antigravity.google/docs/marketplace),
  [Build plugins](https://antigravity.google/docs/build-plugins#publish-to-the-antigravity-marketplace)).
- **Claude import:** `agy plugin import claude` converts plugins from `~/.claude/plugins/`
  ([Plugins](https://antigravity.google/docs/plugins#cli-shell-subcommands-agy-plugin)). It is not a channel for
  sigil's `dist/claude/` plugins: imported skills were not offered to the model, the agent was skipped for a string
  `tools`, and the hook could not load (U7). A plugin sigil builds in Antigravity's own shape delivers skill, rule,
  agent, hook and MCP server, installed or as a workspace folder (F1), so the plugin channel gets its own builder.

## Open for step 4

| #   | Question                                                                     | Source                      |
| --- | ---------------------------------------------------------------------------- | --------------------------- |
| U1  | How do `/<skill> text` arguments reach the skill; is there a placeholder?    | undocumented (D4, P3)       |
| U2  | Does `${NAME}` expand from the environment in a workspace `mcp_config.json`? | undocumented (D6, P5)       |
| U3  | Default for an absent agent `tools`: none or all?                            | conflict (D3)               |
| U4  | Does a non-zero hook exit fail open; what is `Stop`'s blocking decision?     | conflict and claim (D5, P4) |
| U5  | Same skill name at two workspace levels: one listing or two?                 | undocumented (D2, P2)       |
| U6  | Which file holds the Project and Shared permission scopes?                   | undocumented (D7)           |
| U7  | What does `agy plugin import claude` make of a sigil plugin?                 | undocumented (D8)           |

## Reuse map

Step 3, 2026-11-01. Each row names the sigil piece an `antigravity` target would use for one kind table row, with what
it still lacks.

| Row                | sigil piece                                                                                                                                                                                                                                                                                                                                              | Gap                                                                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| skill, scaffold    | A skill `KindEmitSpec` writing `.agents/skills/<name>/SKILL.md`, like Codex's (`src/targets/codex/spec/skill.ts:38` limits). The folder is shared, so `sharesSkillFilesWith` (`src/types.ts:499`) names `codex` and `agents-standard`, as those two already name each other (`src/targets/codex/index.ts:68`, `src/targets/agents-standard/index.ts:46`) | A three-way share: `add` must refuse the second and third owner of one file (`src/cli-helpers.ts:183`). No new layer                                                                                                                                                                        |
| skill, plugin      | Same spec under `skills/`; `AGENT_SKILLS_LIMITS` (`src/targets/agent-skills-limits.ts:15`) for the 64 / 1,024 limits                                                                                                                                                                                                                                     | `name` must equal the folder name in a plugin (sigil ids already are kebab-case, so a check, not a change)                                                                                                                                                                                  |
| agent, both        | An agent spec with a `names` `ToolDialect` (`src/targets/tool-dialect.ts:32`, Cursor's at `src/targets/cursor/tool-dialect.ts:21`) and a tier table like `CLAUDE_MODEL_TIERS` (`src/targets/claude-code/spec/agent.ts:50`). `restrictionOutcome` (`src/targets/tool-restriction.ts:80`) handles lists the dialect can't carry                            | No `disallowedTools`: an agent with one is `nearest` or `skip`. **U3** decides what an agent with no `tools` gets; if the default is none, the spec must write the full list for "all tools"                                                                                                |
| prompt, both       | none                                                                                                                                                                                                                                                                                                                                                     | No file form. **U1** decides whether a prompt could become a skill with `disable-model-invocation: true` and a lexicon `arguments` value (`src/targets/lexicon.ts:32`); until then `none`                                                                                                   |
| rule, scaffold     | A rule spec writing `.agents/rules/<id>.md`, modelled on Cursor's (`src/targets/cursor/spec/rule.ts:24` globs mapping, `:76` limits): `trigger: glob` + `globs` for a scoped rule, `trigger: always_on` when `appliesToEveryFile` (`src/targets/shared/repo-wide-rules.ts:18`)                                                                           | A fifth emitter for `appliesTo`, so `test/targets/rule-globs-agreement.test.ts` must cover it. The 24,000-byte file limit goes on `limits`. The 20,000-token budget is over all rules at once, which no per-file `limits` entry can check: it goes in the setup docs                        |
| rule, context file | `renderRulesDocument` (`src/targets/shared/repo-wide-rules.ts:32`), which Codex (`src/targets/codex/index.ts:115`), `agents-standard` (`src/targets/agents-standard/index.ts:66`) and Copilot (`src/targets/copilot/build-helpers.ts:9`) already call for the root `AGENTS.md`                                                                           | Pick one carrier per repo-wide rule. If a target also writes it to `.agents/rules/` as `always_on`, a project with Codex installed loads it twice (both files add up). Decision for the roadmap, no new layer                                                                               |
| rule, plugin       | Same rule spec under the plugin's `rules/`                                                                                                                                                                                                                                                                                                               | Claude's plugin inlines rules into each skill; this channel ships them as files. Target layer only                                                                                                                                                                                          |
| hook, both         | A `ConfigKindTable` entry (`src/targets/config-kind-table.ts:64`) writing `.agents/hooks.json`, and a hook-ops builder with an event table like Cursor's (`src/targets/cursor/hook-ops.ts:18`) and matcher translation (`:91`). `nodeEvalCommandLine` (`src/targets/shared/hook-command-line.ts:17`) builds the command                                  | **No layer carries the hook's I/O.** The catalog hook reads Claude's stdin (`tool_input`, `catalog/shared/hooks/protect-config.hook.md:22`) and denies with exit 2 (`:29`). Antigravity sends `toolCall.args` and ignores a non-zero exit, so the hook fails open. See the neutrality table |
| mcp, scaffold      | A new `McpDialect` value (`src/targets/mcp-dialect.ts:26`): `serversKey: 'mcpServers'`, and `url` is accepted, so no field rename. The `EnvSyntax` (`src/targets/env-reference.ts:22`) is `PORTABLE_MCP_ENV_SYNTAX` (`:17`) if **U2** shows `${NAME}` expands                                                                                            | If U2 shows no expansion, `interpolatedFields` is empty and a server with an env token is skipped with the reason, as the dialect already allows                                                                                                                                            |
| mcp, plugin        | Same dialect                                                                                                                                                                                                                                                                                                                                             | `${NAME}` works only for a name declared in `variables`, so the plugin build must emit that declaration. Target layer, new code                                                                                                                                                             |
| settings, both     | none                                                                                                                                                                                                                                                                                                                                                     | `none` (D7)                                                                                                                                                                                                                                                                                 |
| plugin manifest    | Claude's plugin build writes `plugin.json` with `pkg.version` (`src/targets/claude-code/plugin-assemble.ts`)                                                                                                                                                                                                                                             | `.antigravity-plugin/plugin.json` lets one repo ship both, but the manifest schema is closed, so a separate builder. **U7** showed it is needed                                                                                                                                             |

The brief's TOML question is answered by D4: commands are gone, so no TOML is written. Codex's splice merge
(`renderToml`, `src/config-merge/toml-file.ts:215`) stays Codex's alone.

### Capability rows (draft)

| Kind     | Scaffold                     | Plugin                                         |
| -------- | ---------------------------- | ---------------------------------------------- |
| skill    | native                       | native (pack plugins, F1a, F1b)                |
| agent    | native                       | native (pack plugins, F1d)                     |
| prompt   | none (revisit after U1)      | none                                           |
| rule     | native (`always_on` only)    | native (`rules/`, `always_on` only, F1c)       |
| hook     | native                       | native (one `hook-<name>` plugin each, F1e)    |
| mcp      | native                       | native (one `mcp-<name>` plugin each, F1f)     |
| settings | none (the CLI owns its file) | none (the manifest schema has no settings key) |

### Neutrality table

Every Antigravity difference from steps 2 and 3, and the ground rule 1 layer that absorbs it.

| Difference                                                                      | Layer                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Paths under `.agents/` and `~/.gemini/config/`                                  | `KindEmitSpec.outputPath`; config destinations in the `ConfigKindTable` |
| Skill and agent frontmatter fields                                              | `KindEmitSpec` field mappings                                           |
| Agent tool names (`view_file`, `run_command`, …)                                | `ToolDialect` (`names`)                                                 |
| Model tiers (`flash_lite`, `flash`, `pro`)                                      | Tier table                                                              |
| Rule `trigger` and comma-separated `globs`                                      | Rule `KindEmitSpec`, with `appliesToEveryFile`                          |
| 24,000-byte rule file limit                                                     | `KindEmitSpec.limits`                                                   |
| 20,000-token rules budget; MCP Ask approval; print-mode soft-deny               | Setup docs (ground rule 3)                                              |
| Context file `AGENTS.md`, `.agents/rules/`, `.agents/skills/`                   | `ProviderLexicon` (`conventions-file`, `rules-dir`, `skills-dir`)       |
| Argument syntax for a skill run as a command                                    | `ProviderLexicon` `arguments`, once U1 is known                         |
| No prompt kind                                                                  | `capabilities.ts`                                                       |
| Hook event names (`PreInvocation`, `PostInvocation` have no catalog equivalent) | Hook translation table in the target                                    |
| Hook matcher tool names                                                         | Hook translation table, from Claude's names (known debt, below)         |
| **Hook stdin shape (`toolCall.args.Path` observed, `TargetFile` documented)**   | **None.** A needed neutral concept, below                               |
| MCP server map and fields                                                       | `McpDialect`                                                            |
| MCP env reference                                                               | `EnvSyntax` (after U2)                                                  |
| Plugin MCP `variables` declaration                                              | Plugin build in the target                                              |
| Plugin manifest and folder layout                                               | Plugin build in the target                                              |
| Shared `.agents/skills/` with Codex and `agents-standard`                       | `Target.sharesSkillFilesWith`                                           |
| Settings file owned by the CLI                                                  | `capabilities.ts` (`none`)                                              |

No row needs a change to `catalog/` or the zod schema except the two hook rows:

- **Needed neutral concept: a hook I/O contract.** Today the catalog's hook bodies are written against Claude's payload
  and exit codes, and every shipped hook target accepts that: Cursor imports Claude hooks through its third-party table,
  and Codex sends `tool_input` and honours exit 2 (`docs/decisions/codex-target-2026-10.md:22`). Antigravity is the
  first target that doesn't. The difference is the **stdin**: `toolCall.name` / `toolCall.args`, where a write is
  `write_file` with `args.Path` (P4; the docs say `write_to_file` / `TargetFile`) instead of `tool_input.file_path`.
  `protect-config` finds no `tool_input`, throws inside its `try`, and lets the write through. The verdict is **not**
  a difference after all: P4 showed exit 2 denies, as does `{"decision": "deny"}` on stdout, although the plugins page
  says a non-zero exit fails open. The fix is a neutral input contract that each hook target adapts, for example with
  a small adapter the target puts in front of the hook's command that rewrites Antigravity's payload into the neutral
  shape. **Cost:** a named input shape (a body convention or schema field), the three catalog hooks rewritten against
  it, an adapter per target (Claude, Cursor and Codex become identity mappings), and a regression test per target that
  a deny really denies. Until then a first version must ship `hook` as `none`: shipping it would install guards that
  look active and block nothing. Exit 2 working is an observation on `1.4.12` that contradicts a doc page, so the
  regression test must keep checking it.
- **Known debt: neutral matchers.** Catalog matchers are Claude names (`Edit|Write`,
  `catalog/shared/hooks/protect-config.hook.md:10`; the follow-up named in
  `docs/decisions/neutral-agent-vocabulary-2026-11.md:136`). Cursor translates them with a fixed table; Antigravity
  would be the third table. Since the I/O contract already touches every hook, the two belong in one phase: matchers
  written in the neutral tool vocabulary (`edit`, `shell`, …) that each target's `ToolDialect` already maps.

## Probe log

Step 4, 2026-11-01, Antigravity CLI `1.4.12`, Linux, signed in with a Google account. Every run was `agy -p` on
`gemini-3.8-flash-low` with `--output-format stream-json`, in a fresh `git init` repo under the scratchpad built from
fixture files, never in this repo. Each fixture carried a codeword so an answer can't be guessed. No run used
`--dangerously-skip-permissions`: workspace writes are auto-allowed in print mode, and the MCP runs passed a
session-only `--settings '{"permissions":{"allow":["mcp(probe/*)"]}}'`. The stream shows each tool call with its
arguments, and `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl` shows the exact text the
model got. U6 needs no probe (a docs gap). U7 writes into the owner's home profile, so it ran later, in step 6 of the
plan, with the owner's approval (below the table).

| #   | Question                                                  | Expected          | Observed                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `AGENTS.md` and `.agents/rules/` reach the model?         | both              | **`AGENTS.md` yes** (ALPHA-17), with no settings. `trigger: always_on` yes (BRAVO-22). **`trigger: glob` no**: after reading `src/app.ts`, neither `globs: "src/**/*.ts"` nor `globs: "*.ts"` attached (runs 2, 3)                                                  |
| P2  | `.agents/skills/` skill listed and picked?                | yes               | Yes: listed, picked from its description, `SKILL.md` read on demand (CHARLIE-3)                                                                                                                                                                                     |
| U5  | Same skill name at the repo root and in the start folder? | undocumented      | **Listed once, and the repo-root copy won** over the nearer `sub/.agents/skills/` copy (run 9)                                                                                                                                                                      |
| P3  | `/<skill> args`: is the text substituted?                 | undocumented (U1) | **No substitution.** The transcript shows the skill body with `$ARGUMENTS` still literal, and the typed text only in the user's request. The model filled in `ARGS=[hello world 42]` itself (run 4)                                                                 |
| P4  | Hook denies a `.env` write; raw stdin?                    | deny              | **Both exit 2 and JSON `decision: deny` blocked it**; the model saw the reason. stdin: `toolCall: {name: "write_file", args: {Path, Content}}`, `stepIdx`, `lastUserInput`, and the common fields, `transcriptPath` pointing at `transcript_full.jsonl` (runs 5, 6) |
| P5  | `${NAME}` in a workspace `mcp_config.json`?               | undocumented (U2) | **Not expanded**, in `env` or `args`: the server got the literal `${PROBE_SECRET}`. **The server inherits `agy`'s environment** (`INHERITED=[golf-77]`). The tool runs as `call_mcp_tool` with `ServerName` and `ToolName` (runs 7, 8)                              |
| U3  | Agent with no `tools`: what can it do?                    | conflict          | No write tool: the agent run with `--agent notools` said so, and no file appeared. Same for a `tools: [view_file, grep_search]` agent. The `init` event lists the session's 44 tools in both cases, so it is not the agent's set (run 10)                           |
| P6  | Does `agy` read `.claude/`, `CLAUDE.md`?                  | no                | **No**: `CLAUDE.md`, `.claude/rules/` and `.claude/skills/` never reached the model (run 1), and the D0 trace never opened them                                                                                                                                     |
| U7  | What does `agy plugin import` make of a sigil plugin?     | undocumented (D8) | **Imported and listed, but nothing reached the model, and the hook could not have worked.** Details below the table (runs 11-13)                                                                                                                                    |

**U7**, 2026-11-01, `agy 1.4.12`, run by plan step 6. `npm run catalog:build`, then `agy plugin import <path>` for
three sigil plugins from `dist/claude/plugins/`, never the bare `agy plugin import claude`: `essentials` (one skill),
`hook-protect-config` (one `PreToolUse` hook) and `typescript-starter` (three skills with inlined rules under
`## Applied Rules`, one agent). `essentials` carries no inlined rules or agent, so `typescript-starter` was added to
cover them.

- **Import.** Each copied the Claude folder as-is to `~/.gemini/config/plugins/<name>/`, added a root `plugin.json`
  (name, version, description, `author` flattened to a string) and, for the hook, a copy of `hooks/hooks.json` at the
  root. It also wrote `~/.gemini/config/import_manifest.json`. Output: `essentials` skills 1, `hook-protect-config`
  hooks 1, `typescript-starter` skills 3 and agents 1, then "Staged to ~/.gemini/config".
- **`agy plugin list --json`.** All three `enabled`, `source: "claude-code"`, version `0.5.0`. Skills are listed, the
  hook is listed as one hook named `hooks`, and **the agent is missing**. No rules and no MCP: the inlined rules are
  skill body text, not a component.
- **`agy plugin validate --strict`** on each imported folder. `essentials`: passes, one note (no `logo`).
  `hook-protect-config`: fails on 3 warnings. `Edit` and `Write` are "Claude Code's name for a tool, so it never
  matches; match `replace_file_content` or `edit_file`" (and `write_to_file` or `write_file`). `hooks/hooks.json` is
  "never loaded: plugin hooks are read only from hooks.json at the plugin root". A note says the `"hooks"` wrapper
  loads as one hook named `hooks`; Antigravity names each hook at the top level. `typescript-starter`: fails with one
  error. The agent's `tools: Read, Grep, Glob, Bash` is a string where a YAML list is expected, so "the loader skips
  this agent". `agy agents` lists none.
- **Skill by name (run 12).** `agy -p` in a scratchpad repo, asking for `explain-diff` on a diff file. The model
  answered `NONE`, and its thinking in the transcript says "the `explain-diff` skill isn't available". The imported
  skills never reached a print-mode session.
- **Hook (run 13).** A `.env` write went through: `write_file` returned "Created file." and no hook message
  appeared, as expected. The matcher names Claude tools, and the script reads `tool_input`, which this stdin does not
  have (P4).
- **Permissions (run 11).** Here a plain print run had its `write_file` (and a `git` `run_command`) auto-denied, unlike step 4.
  The writes ran with a session-only `--settings '{"permissions":{"allow":["write_file(*)"]}}'`. The cause was not
  isolated.
- **Clean-up.** `agy plugin uninstall` for each plugin, after which `agy plugin list --json` is `[]`. Uninstall left
  an empty `plugins/` folder and `import_manifest.json` with `"imports": null`. Both were removed, so
  `~/.gemini/config/` holds only what it held before (`.migrated`, `mcp_config.json`, `projects/`).

What this changes:

- **Tool names come from the binary.** `agy 1.4.12` calls `read_file` (`Path`) and `write_file` (`Path`, `Content`),
  and neither is in the hooks page's list or in the `init` tool list, which has `view_file` and `write_to_file`. A
  `ToolDialect` and a matcher table built from the docs would miss every write. Both must be built from observed
  names, and a live probe must re-check them on each `agy` update.
- **MCP:** `EnvSyntax` cannot express a reference here. Because the server inherits the environment, an identity entry
  (`NAME: {sigil:env:NAME}`) can be dropped and still work; any other token is skipped with its reason.
- **Prompts:** a prompt could ship only as a skill, with `disable-model-invocation: true`, and with its
  `{sigil:arguments}` rendered as prose pointing at the user's request, since nothing is substituted.
- **Rules:** `AGENTS.md` and `always_on` rules work today. `glob` rules need a multi-turn check (the docs say rules are
  re-read before each turn) before scoped rules ship.
- **Skills:** the shared `.agents/skills/` works as documented. A second workspace level does not shadow the root.
- **P6:** nothing sigil writes for Claude reaches Antigravity, but the `AGENTS.md` and `.agents/skills/` that Codex
  and `agents-standard` write do, with no target.
- **U7: importing the Claude plugin is not a channel.** Skills import but were not offered to the model, the agent is
  skipped for a string `tools`, and the hook is never loaded and could not match. A plugin channel needs its own
  builder (`hooks.json` at the root with named hooks, list-valued agent `tools`, observed tool names), and a live
  check that an installed plugin's skill reaches a session. `agy plugin validate --strict` is a free conformance check
  for that builder's output.

### Phase A

Step 1 of [plan-antigravity-target-a.md](../plan-antigravity-target-a.md), 2026-11-01, `agy 1.4.12`, Linux, signed in
with a Google account, `agy -p` on `gemini-3.8-flash-low` with `--output-format stream-json`, in a fresh `git init`
repo under the scratchpad. Unlike step 4, the files are sigil's own output, not hand-written fixtures.

| #   | Question                                              | Expected | Observed                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Do sigil's `agents-standard` files reach Antigravity? | yes      | **Both reached it.** `sigil add shared/cli --target agents-standard` wrote `.agents/skills/cli/` with `cli-rules` inlined. The prompt asked to audit a CLI's command tree without naming a skill: the model read `cli/SKILL.md` from its description and returned its codeword (ECHO-58). The `AGENTS.md` codeword (DELTA-41) came back with no read of the file, so it was in context |

**`sigil add` writes no `AGENTS.md`.** The same `add` with the repo-wide rule `shared/clean-code` skipped it ("a rule
reaches this target only inside the skills that use it"), for `agents-standard` and for `codex` alike. The root
`AGENTS.md` with the repo-wide rules comes only from `sigil build --target agents-standard` (or `codex`), at
`dist/<target>/AGENTS.md`. A1 used that file, copied to the repo root with the codeword appended. So the P6 line and
the Decision's first bullet were wrong about `add`: through `add`, a rule reaches Antigravity only inlined in a skill.

### Phase B

Written with [plan-antigravity-target-b.md](../plan-antigravity-target-b.md), 2026-11-02, `agy 1.4.12`, Linux, signed
in, `agy --model gemini-3.8-flash-low --output-format stream-json`, in a fresh `git init` repo under the scratchpad
holding `src/app.ts` and `.agents/rules/ts-style.md` (`trigger: glob`, a `description`, `globs: "src/**/*.ts"`,
codeword DELTA-58).

| #   | Question                                                       | Expected | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Does a `trigger: glob` rule attach after a read, edit or turn? | yes      | **No, in every run.** Run 1: `-p "Read src/app.ts and summarize it in one line."`, then a `--continue -p` turn asking for a rule's review codeword; the model read the file, and the second turn found none (it tried `run_command`, which was denied). Run 2: `--continue -p` "Without using any tools, answer only from your context": `NONE`. Run 3: with `--settings` allowing the edit tools, an `edit_file` of `src/app.ts` (two `read_file` and two `edit_file` calls; the line was added), then the codeword: `NONE`, and `NONE` again in a `--continue` turn. Control: the same file with `trigger: always_on` returned DELTA-58. Live check after Phase B: `sigil add shared/clean-code shared/cli --target antigravity`, a codeword appended to each installed file, one `-p` run: both came back (KILO-73, LIMA-29); the rule with no read, the skill after a `read_file` of its `SKILL.md` |

### Phase C

Step 1 of [plan-antigravity-target-c.md](../plan-antigravity-target-c.md), 2026-11-02, `agy 1.4.12`, Linux, signed
in, `agy --model gemini-3.8-flash-low --output-format stream-json` with a session-only
`--settings '{"permissions":{"allow":["mcp(*)"]}}'`, in a fresh `git init` repo under the scratchpad. Two probe
servers, both Node scripts: a stdio one whose one tool returns its argv and `PROBE_ID`, and a Streamable HTTP one on
`127.0.0.1` that logs every request and whose tool returns the request path. The argv and the path tell the runs apart.

| #   | Question                                                                     | Expected                        | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Which entry shapes load from `.agents/mcp_config.json`, and from where else? | stdio and remote with no `type` | **Every shape loads; only `mcp_config.json` is read.** Run 1: `{command, args}` with no `type`: `call_mcp_tool` returned `ARGV=[run1]`. Run 2: the same with `type: "stdio"`: accepted, `ARGV=[run2]`. Run 3: on the local HTTP server, `{type: "http", url}`, `{url}` and `{serverUrl}` each got `server/discover`, `initialize`, a GET, the two `.well-known/oauth-protected-resource` probes and `tools/list` at load; `{type: "http", url}` and `{url}` were then called (`HPROBE=[/typed]`, `HPROBE=[/untyped]`). `https://mcp.jam.dev/mcp` in both forms left no tool cache, since it needs sign-in first, so the local server settles the load question. Run 4: the server only in a root `.mcp.json`: `NO-SERVER`, no call. Run 5: no `env`, `PROBE_ID=c1-ok` exported to `agy`: `PROBE_ID=[c1-ok]`. `agy` caches each loaded server's tool list in `~/.gemini/antigravity-cli/mcp/<server>/`, and `agy mcp list` shows only the user file ("No MCP servers configured" with the workspace file in place) |
| C2  | Does a server `sigil add` wrote run, and does `uninstall` remove it?         | yes                             | **Yes.** Live check after Phase C: `sigil add shared/filesystem --target antigravity` wrote `.agents/mcp_config.json` holding only `mcpServers.filesystem` (`npx`, no `type`). One `-p` run with `--settings '{"permissions":{"allow":["mcp(filesystem/*)"]}}'`: `call_mcp_tool` with `ServerName: filesystem`, `ToolName: list_directory`, `path: src` returned `[FILE] app.ts`. `sigil uninstall` then reported the file "emptied, deleted", and it was gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Phase D

Step 1 of [plan-antigravity-target-d.md](../plan-antigravity-target-d.md), 2026-11-02, `agy 1.4.12`, Linux, signed
in, `agy --agent <name> --model gemini-3.8-flash-low --output-format stream-json --print-timeout 90s -p`, in a fresh
`git init` repo under the scratchpad holding `notes.txt` (codeword OSCAR-91) and one agent per run in
`.agents/agents/`, `tools` written as a YAML block list. **`agy agents` printed nothing in every run**, with or without a
TTY, so "listed" below means the agent appeared in the list `--agent <unknown>` prints in its error
(`unknown agent "x" (available: p1)`). Print mode auto-allowed workspace writes. Shell and URL reads were soft-denied
until a session-only `--settings` allowed them, and the allow rule names the permission, not the tool: `command(*)`,
`read_url(*)` (`run_command(*)` and `read_url_content(*)` were still denied).

| #   | Question                                                                | Expected                 | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Which `tools` names load in a project agent, and what do they grant?    | the documented names     | **The documented names load and work, one per tool, except `multi_replace_file_content`. The observed names are a second, parallel set.** Run 1 `[view_file]`: called `view_file`, OSCAR-91. Run 2 `[read_file]`: called `read_file`, OSCAR-91. Run 3 `[view_file, write_to_file, replace_file_content, multi_replace_file_content]`: `write_to_file` then `replace_file_content`, `a.txt` read `alpha delta gamma`. Run 4 with `write_file`, `edit_file`: the same, under those names. Control `[view_file]`, asked to create a file: refused, no file. Run 5 `[grep_search, find_by_name, list_dir]`: `grep_search` found `notes.txt`. Run 6 `[view_file, run_command]`: `d1-shell`, reported as "unsandboxed". Run 7 `[read_url_content, search_web]`: "Example Domain". Run 8, the ten names below plus `multi_replace_file_content` and `model: flash_lite`, then `model: pro`: listed, OSCAR-91, no hang; `init.model` stayed the `--model` value. A bogus `model: bogus_tier` dropped the agent with no warning (`no custom agents are available`). Run 9 (U3 again), `[view_file, grep_search]` with `mainAgent: false`, delegated "write `b.txt`" from the main session: the subagent said it had only `view_file`, `grep_search`, `send_message`, `manage_task`; no `b.txt`. A `mainAgent: false` agent is left out of the `--agent` list. Run 10, `[list_dir, view_file, multi_replace_file_content, invoke_subagent]`: `list_dir` and `invoke_subagent` (to run 9's agent) worked; `multi_replace_file_content` was "not available". Run 11: `multi_replace_file_content` is absent from the agent's tools alone and next to the other edit names, with no hang. Run 12, asked to list its tools: the ten names below plus `manage_task`; `[read_file, write_file, edit_file]` listed those three plus `manage_task` |
| D2  | Does an agent `sigil add` installed load and run, without an edit tool? | a review, no `review.md` | **Yes.** Live check (plan step 6) in a fresh repo with a buggy `src/app.ts`: `sigil add --target antigravity typescript/ts-code-reviewer` wrote `.agents/agents/ts-code-reviewer.md` with `tools` `view_file`, `grep_search`, `find_by_name`, `list_dir`, `run_command` and no `model`. `agy --agent ts-code-reviewer -p "Review src/app.ts, then write your findings to review.md."` with no allow rule: the agent's first call was `run_command` (`git status`), print mode denied it, and the run ended with an empty response. Rerun with `--settings` allowing `command(*)` only: `list_dir`, `view_file`, `find_by_name`, four read-only `run_command` calls, then a severity-ranked review that found the off-by-one crash; no write tool was called and no `review.md` exists. `agy agents` again printed nothing; `--agent nope` listed `ts-code-reviewer`. `sigil uninstall --yes` removed the file and left `.agents/` empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

What D1 changes: the dialect keeps the documented names (`view_file`; `grep_search`, `find_by_name`, `list_dir`;
`write_to_file`, `replace_file_content`; `run_command`; `search_web`, `read_url_content`; `invoke_subagent`) and drops
`multi_replace_file_content`. The observed `read_file`, `write_file` and `edit_file` also load, but as their own tools
under their own names, so writing both would only double the names. `manage_task` and `send_message` come with every
agent. The model tiers stand as documented, `flash_lite` included, and a tier outside the table drops the agent, so the
tier table is closed.

### Phase E

Step 1 of [plan-antigravity-target-e.md](../plan-antigravity-target-e.md), 2026-11-02, `agy 1.4.12`, Linux, signed in,
`agy --model gemini-3.8-flash-low --output-format stream-json --print-timeout 90s` with a session-only
`--settings '{"permissions":{"allow":["command(*)"]}}'` (run 1 without it), in fresh `git init` repos under the
scratchpad holding `notes.txt` (codeword PAPA-64), `.env.local` and a hand-written `.agents/hooks.json` in the plan's
decision 4 shape: keyed by hook name, tool events as `[{matcher, hooks: [{type, command}]}]`, other events as
`[{type, command}]`. Each hook was a Node script outside the repo that logged its stdin as one JSON line.

| #   | Question                                                    | Expected                 | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Does the named-hook file load, and what does each hook see? | exit 2 denies; both sets | **The file loads in the planned shape, exit 2 denies, and the default tools are the observed set.** Run 1 (P4 again): a `PreToolUse` hook named `shared-protect-config`, matcher `*`, exiting 2 when an argument ends in `.env`: `write_file` with `Path`, `Content` was blocked, no `.env`, the stderr reason in the stream. Run 2, the recorder on `*`: `write_file` (`Path`, `Content`), `edit_file` (`Path`, `Target`, `Replacement`) for the one-word change and again for the two-line change, `read_file` (`Path`), and `run_command` (`CommandLine`, `WaitMsBeforeAsync`, `toolSummary`) both for the codeword search (`grep`) and for `echo e1`. No documented name (`write_to_file`, `view_file`, `grep_search`, …) was reported. Run 3, the recorder on the five edit names joined with `\|`: one `write_file` and three `edit_file` calls logged, and none of the two `read_file` calls, so the matcher is an alternation that matches whole names. Run 4: `SessionStart` fired with the common fields plus `lastUserInput` and no `stepIdx`; `PostToolUse` fired for `run_command` and `read_file`. Run 5: a `Stop` hook exited 2 with a reason; the hook ran once, the reply was `hello`, and the session ended. Run 6, a project agent `e1-reader` (`[view_file, run_command]`) asked to run `echo e1-sub`: the hook saw the main session's `invoke_subagent` (`Prompt`, `Role`, `TypeName`) and the subagent's `run_command` and `send_message`. The subagent's stdin has the same keys as the main session's, with its own `conversationId`; no field names the agent. No stdin carried a working-directory field |
| E2  | Does a hook `sigil add` installed deny?                     | `.env` blocked           | **Yes.** Live check (plan step 7) in a fresh repo: `sigil add shared/protect-config --target antigravity` wrote `.agents/hooks.json` holding only `shared-protect-config`, `PreToolUse` with the five edit names as matcher and one `node -e` command. Run 1, "create `.env` holding A=1": the model chose `run_command`, which print mode denied, so the hook was not reached. Run 2, the same asking for the file-writing tool: two `write_file` calls, both blocked, `sigil-hook: blocked write to protected file .env` in the stream, no `.env`. Run 3, "create `notes.txt`": `write_file` wrote it. `sigil uninstall` reported `.agents/hooks.json` "emptied, deleted", and it was gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

What E1 changes: nothing in the decision 1 table is dropped. The default session reports the observed names, and D1
showed an agent whose `tools` list the documented names calls them under those names, so the hook matcher still names
both sets. No new edit-shaped name was seen. `Path` is the path key of every observed file tool, and `TargetFile` stays
for the documented ones. No `agentField` and no `cwdField`. A `Stop` hook cannot block with exit 2, so the setup page
says so.

### Phase F

Step 1 of [plan-antigravity-target-f.md](../plan-antigravity-target-f.md), 2026-11-02, `agy 1.4.12`, Linux, signed in,
`agy --model gemini-3.8-flash-low --output-format stream-json --print-timeout 90s`, in fresh `git init` repos under the
scratchpad. The fixture plugin `sigil-probe` was written by hand in the plan's decision 2-7 shape: a root `plugin.json`
holding only decision 7's keys, `skills/probe-skill/SKILL.md` (SKILL-F1), `rules/probe-rule.md` with
`trigger: always_on` (RULE-F1), `agents/probe-agent.md` with `tools: [read_file]` and `model: flash` (AGENT-F1),
`hooks.json` holding the exact `shared-protect-config` fragment that `sigil add` writes (renamed
`probe-protect-config`), and `mcp_config.json` with one stdio server, `probe`, whose `probe_env` tool returns
`$PROBE_F1`, with no `variables`.

| #   | Question                                    | Expected                | Observed                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Does a plugin in the planned shape deliver? | the skill reaches a run | **Yes, every component, on both routes.** `agy plugin install <path>` reported all five components and copied the plugin to `~/.gemini/config/plugins/sigil-probe/`. Skill, rule, agent and hook worked as installed and as a workspace folder; the MCP server inherits `agy`'s environment. `agy plugin validate --strict` passes with only a `logo` note, signed in or not. Details below (runs 1-8) |

- **F1a, the gate (run 1), installed:** "What is the probe-skill marker?" The model read
  `~/.gemini/config/plugins/sigil-probe/skills/probe-skill/SKILL.md` and answered `SKILL-F1`.
- **F1b (runs 7, 8), workspace:** after uninstalling, the fixture copied to `.agents/plugins/sigil-probe/` of a fresh
  repo, with nothing installed. The same question read that copy's `SKILL.md` and answered `SKILL-F1`; the codeword
  question answered `RULE-F1`.
- **F1c (run 2):** "List every codeword your rules give you" answered `RULE-F1` with no tool call: an `always_on` plugin
  rule is in the context from the start.
- **F1d (run 3):** `agy --agent probe-agent -p "say your marker"` answered `AGENT-F1` with no tool call. The list-valued
  `tools` and `model: flash` loaded.
- **F1e (run 4):** "create `.env` holding `A=1`" with a session-only `write_file(*)` allow: no `.env`. The stream shows
  `sigil-hook: blocked write to protected file .env`, and the model named the hook
  `jsonhook__probe-protect-config_PreToolUse_0_0`. The fragment `sigil add` writes works unchanged from a plugin root.
- **F1f (runs 5, 6):** `PROBE_F1=x agy …` with `mcp(*)` allowed. The server is registered as **`sigil-probe_probe`**
  (`<plugin>_<key>`, as the docs say), and its tool list was cached in `~/.gemini/antigravity-cli/mcp/sigil-probe_probe/`.
  Run 5, asking for "the probe server's tool", made the model look for it with `run_command` (denied); run 6, naming the
  server `sigil-probe_probe`, called `call_mcp_tool` and got **`PROBE_F1=x`**: a plugin's server inherits `agy`'s
  environment, as P5 found for a workspace server. The CLI log also said "Not reloading plugin MCP servers: … not logged
  into Antigravity", yet the server ran.
- **F1g:** `agy plugin validate --strict` with `HOME` at an empty folder: exit 0, the one note "no logo: the plugin shows
  a generic icon", the same output as signed in. **Validate needs no sign-in.** A copy with an extra manifest key
  (`bogus`) gives the warning `unknown field "bogus" is ignored`, and `--strict` turns it into exit 1.
- **F1h: not run.** No plugin folder exists in the repo yet, so no GitHub URL could point at one. Decision 10 stays as
  written.
- **Cleanup:** `agy plugin uninstall sigil-probe`, then `agy plugin list --json` was `[]`. Install had created
  `~/.gemini/config/import_manifest.json` (`{"imports": null}`) and an empty `~/.gemini/config/plugins/`; both were
  removed. The MCP tool cache `~/.gemini/antigravity-cli/mcp/sigil-probe_probe/` stays, outside the cleanup rule.

What F1 changes in the plan: decisions 3 and 5 stand as written. Decision 6 keeps the `inherited` env handling, with no
`variables`. The setup page names the namespaced server key (`<plugin>_<key>`), since a model asked for the bare key
did not find it. Decision 9's validator needs no signed-out skip.

## Decision

**Go, staged, with target id `antigravity`.** The docs call the product Antigravity CLI and the binary `agy`, and
the folders it reads (`.agents/`, `~/.gemini/config/`) are shared with the Antigravity App, so the id names the
product, not the binary or the CLI alone.

- **Demand.** The owner moved from Gemini CLI to Antigravity as the Google tool sigil will use (Why Antigravity, in
  the plan), and Gemini CLI no longer serves individual accounts. That makes this the only Google agent sigil can
  serve for its owner. No outside demand is recorded.
- **What already works with no target (P1, P6, A1).** `sigil add --target agents-standard` (or `codex`) writes
  `.agents/skills/` with the rules each skill uses inlined, and `sigil build` for those targets writes a root
  `AGENTS.md` with the repo-wide rules (`add` does not, A1). Antigravity loads both as-is. So skills and repo-wide
  rules reach Antigravity today. The first deliverable is a setup note saying so, at no code cost. Nothing written for
  Claude reaches it.
- **What a target adds.** Custom agents (`.agents/agents/`), MCP servers (`.agents/mcp_config.json`, user and
  workspace scope), scoped rules (`.agents/rules/` with `trigger: glob`, once a glob rule attaches; B1 found none yet), and a
  plugin, the one channel besides Cursor's that ships rules as files. `prompt` and `settings` stay `none`.
- **Maintenance cost.** Higher than Cursor's. In three places the binary contradicted a doc page: tool names
  (`read_file` / `write_file` vs `view_file` / `write_to_file`), the hook exit code, and the agent `tools` default. So
  every `agy` update needs the live probes re-run, not only `sync --check`. The probes are cheap: ten print-mode runs
  on the lowest Flash tier, with no special flags. The roadmap should keep the probe fixtures as a script so a re-run
  is one command. Per catalog change, conformance is the same as any target: emit specs, `provider-limits`, the
  `appliesTo` agreement test. The only extra per-change cost is a new agent tool or hook matcher needing an
  observed name.
- **Hooks wait.** They ship only after the neutral hook I/O contract (neutrality table), together with neutral
  matchers, as their own phase ahead of the hook phase. Until then `hook` is `none` for this target, because a
  Claude-shaped hook would install, look active, and block nothing. **Shipped in Phase E** (2026-11-02,
  [plan-antigravity-target-e.md](../plan-antigravity-target-e.md)): after Phase H's contract, hooks go to
  `.agents/hooks.json` / `~/.gemini/config/hooks.json`, one named entry per hook, with the observed and documented tool
  names both in the matcher; exit 2 denies (E1), and a `Stop` hook cannot block.
- **Gates by probe.** Agents ship on the U3 result (no `tools` means no writes, so an "all tools" agent must list
  them). MCP ships with identity env entries only (P5). C1 settles the MCP dialect: `serversKey: 'mcpServers'`,
  `envSyntax: 'inherited'`, `interpolatedFields: []`, `stdioType` unset, `remoteType: 'drop'`, with the catalog's
  `url` kept. A `type` is accepted on both entries but not needed. B1 found no attach after a read, an edit or a later turn, so
  Phase B skips scoped rules. D1 settles the agent dialect on the documented names, one per tool: `read` →
  `view_file`; `search` → `grep_search`, `find_by_name`, `list_dir`; `edit` → `write_to_file`,
  `replace_file_content`; `shell` → `run_command`; `web` → `search_web`, `read_url_content`; `agent` →
  `invoke_subagent`; `todo` unmapped. `multi_replace_file_content` is left out (an agent never gets it). The model
  tiers are `flash_lite`, `flash`, `pro`. The plugin
  channel needs its own builder, not `agy plugin import` (U7), and goes last, after a probe shows an installed
  plugin's skill reaching a session.

The phases are in the roadmap, [plan-antigravity-target.md](../plan-antigravity-target.md).
