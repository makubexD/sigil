# OpenCode target (2026-11)

Status: **go, staged**, 2026-11-03; see [Decision](#decision). Stage 1 is the setup note. The owner moved the U1 gate to the end on 2026-11-03: see [V2 run](#v2-run).

## How the docs pass ran

Every claim cites a page on `opencode.ai/docs`, read on 2026-11-03 from
`packages/web/src/content/docs/` at tag `v1.19.5` (commit `810c0eb`) and checked to resolve on the live site. Where a
page could be compared with the code, that tag's source under `packages/` was read. Citations like `config/paths.ts:27`
are relative to `packages/opencode/src/`, or to `packages/core/src/` when they start with `core:`. **Conflict** means the
page and the source disagree, and the source wins for what 1.19.5 does. **Undocumented** means only the source says it.
Nothing here is live behavior yet; step 3 probes it.

`sst/opencode` now redirects to `anomalyco/opencode`.

### Two product lines

The plan's starting facts are true of the npm package `opencode-ai` only. That package holds OpenCode 1. **OpenCode 2
ships as `@opencode/cli`, `2.2.5` on 2026-11-03**, with the same `opencode` binary name, so the two aren't installed
side by side (`installation/index.ts:55-56`, `:76-82`). OpenCode 1 advertises it at the end of `opencode upgrade`
(`cli/cmd/upgrade.ts:79`). V2's own guide says what breaks
([Migrate from V1](https://opencode.ai/v2/docs/migrate-v1/)):

- **Three intentional breaks:** the plugin API, the server API and clients, and terminal config (`tui.json` →
  `cli.json`). "V1 plugin implementations do not run in V2."
- **Everything else is meant to stay compatible:** V2 reads the same config locations, normalizes V1 fields in memory,
  and still discovers `agent(s)/`, `command(s)/` and `.opencode/skills/`. A native V2 shape exists (`agents`, `commands`,
  `permissions`, `mcp.servers`, `plugins`) but is optional, and V1 agent frontmatter is "deprecated but still translated".
- **Behavior differences that reach sigil:** V2 reads [`AGENTS.md` only](https://opencode.ai/v2/docs/instructions/), with
  no `CLAUDE.md` fallback. Todos are off by default. `external_directory` is allowed by default. `lsp` config is ignored.

So a file-based target written in V1 shape should load on both lines, and the one piece that can't is a generated
plugin (D5). This record answers D0–D8 for V1 as the plan scoped them and notes V2 where it differs. V2's source was not
read and neither line has been run yet. U1 asks for a V2 run.

## Kind table

Project paths walk from the working directory up to the git worktree (`config/paths.ts:27`). User paths are under
`~/.config/opencode/`. `opencode.json[c]` means either file.

| sigil kind | Project path                                                                                    | User path                                                                  | Format                                                                                                                                                                                                                               | Docs                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `skill`    | `.opencode/skills/<name>/SKILL.md`; also `.agents/skills/` and `.claude/skills/`                | `skills/<name>/SKILL.md`; also `~/.agents/skills/` and `~/.claude/skills/` | Agent Skills `SKILL.md`: `name`, `description` required; `license`, `compatibility`, `metadata` optional; unknown fields ignored                                                                                                     | [Agent Skills](https://opencode.ai/docs/skills/#place-files)  |
| `agent`    | `.opencode/agents/<name>.md`; or the `agent` key in `opencode.json[c]`                          | `agents/<name>.md`; or the `agent` key                                     | Markdown; `description`, `mode`, `model`, `permission`, `temperature`, `top_p`, `steps`, `hidden`, `color`, `disable`, `variant`; deprecated `tools`, `maxSteps`. Body is the prompt. Other keys go to the provider as model options | [Agents](https://opencode.ai/docs/agents/#markdown)           |
| `prompt`   | `.opencode/commands/<name>.md`; or the `command` key                                            | `commands/<name>.md`; or the `command` key                                 | Markdown; `description`, `agent`, `model`, `subtask`, `variant`. Body is the template: `$ARGUMENTS`, `$1`…, `` !`cmd` ``, `@file`                                                                                                    | [Commands](https://opencode.ai/docs/commands/#markdown)       |
| `rule`     | root `AGENTS.md` (fallback `CLAUDE.md`); or files listed in `instructions` (paths, globs, URLs) | `AGENTS.md` (fallback `~/.claude/CLAUDE.md`); or `instructions`            | Plain Markdown, no frontmatter, no path scoping                                                                                                                                                                                      | [Rules](https://opencode.ai/docs/rules/#precedence)           |
| `hook`     | `.opencode/plugins/*.{js,ts}`                                                                   | `plugins/*.{js,ts}`                                                        | No declarative hooks. A JS/TS module returning `tool.execute.before` and similar; V1 API only                                                                                                                                        | [Plugins](https://opencode.ai/docs/plugins/#from-local-files) |
| `mcp`      | `mcp` key in `opencode.json[c]`                                                                 | `mcp` key                                                                  | `type: local` with `command` array, `environment`, `cwd`, `enabled`, `timeout`; `type: remote` with `url`, `headers`, `oauth`, `enabled`, `timeout`. `{env:NAME}` and `{file:path}` substitution                                     | [MCP servers](https://opencode.ai/docs/mcp-servers/#local)    |
| `settings` | `opencode.json[c]`; `.opencode/opencode.json[c]` (undocumented on V1)                           | `opencode.json[c]`                                                         | JSON or JSONC against `https://opencode.ai/config.json`, merged across layers                                                                                                                                                        | [Config](https://opencode.ai/docs/config/#precedence-order)   |

Singular folder names (`agent/`, `command/`, `plugin/`, `skill/`) still load for backwards compatibility
([Config](https://opencode.ai/docs/config/#precedence-order)). The plan's `.opencode/agent/` and `.opencode/command/` are
those legacy names. The plural is the one to write, and V2 calls it preferred.

## Answers

### D0. Install, update, scripted runs, config layers, and isolation

**Install and update.** `npm i -g opencode-ai` for V1. `opencode upgrade [target]` moves within the line, and `--major`
swaps to OpenCode 2 ([CLI](https://opencode.ai/docs/cli/#upgrade)). `autoupdate` only notifies by default: nothing is
installed until `/update` ([Config](https://opencode.ai/docs/config/#autoupdate)).

**Scripted runs.** `opencode run [message..]` takes `--model provider/model`, `--agent`, `--command`, `--format json`,
`--dir` and `--auto` ([CLI](https://opencode.ai/docs/cli/#run)). Without `--auto`, a permission ask in `opencode run` is
auto-rejected and the run continues (**undocumented**, `cli/cmd/run.ts:791-812`). `--auto` still enforces explicit `deny`
([Permissions](https://opencode.ai/docs/permissions/#auto-mode)).

**Layers.** Remote `.well-known/opencode`, then global, `OPENCODE_CONFIG`, project `opencode.json[c]`, `.opencode`
directories, `OPENCODE_CONFIG_CONTENT`, then managed files
([Config](https://opencode.ai/docs/config/#precedence-order)). Layers deep-merge, and arrays replace except `instructions`,
which concatenates in the layered merge (`config/config.ts:42-52`). At one level `.jsonc` loads after `.json`, so it wins
(**undocumented**, `config/paths.ts:15-20`, `config/config.ts:272-274`).

**Isolation.** `OPENCODE_CONFIG_DIR` does not isolate a probe. It adds a directory; the global config
still loads from `Global.Path.config` (`config/config.ts:272-274`, `config/paths.ts:24-40`). Discovery of
`~/.claude/skills/`, `~/.agents/skills/` and `~/.claude/CLAUDE.md` is rooted at the home directory
(`skill/index.ts`, `session/instruction.ts:59-62`). And a mismatch: the global `AGENTS.md` follows
`OPENCODE_CONFIG_DIR` (`core:global.ts:64`), while the global config doesn't.

A probe gets real isolation from `HOME=<scratch>/home` with every `XDG_*_HOME` unset. `xdg-basedir` then derives config,
data, cache and state from that home, and `os.homedir()` follows it (`core:global.ts:10-20`). Auth lives in the data
dir, so nothing of the owner's is visible, and that also rules out reaching a Claude credential by accident.

**Side effects to design around.** Each config directory, `.opencode/` included, gets a `.gitignore`. A background
dependency install of `@opencode-ai/plugin` can leave `package.json` and `node_modules` there (**undocumented**,
`config/config.ts:309-325`, `:450-466`). On 1.19.4 only the global directory and a `.opencode/` holding a plugin got them
([Probe log](#setup)). The first run without env overrides seeds a global config
file (`:264-270`). A config file with no `$schema` gets one written into it (`:245-249`), by text insert, so comments
survive but a byte-for-byte drift hash wouldn't.

### D1. Rules

**`AGENTS.md` lookup.** From the working directory up to the worktree. The first _filename_ that exists anywhere wins, in
the order `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` (deprecated, **undocumented**). Then every copy of that file on the walk
is loaded, not only the nearest (**conflict** with "the first matching file wins", `session/instruction.ts:122-132` and
`core:fs-util.ts:154-166`; the code comment says otherwise too, and V2's page describes the stacking).

**Global.** `~/.config/opencode/AGENTS.md`, or `~/.claude/CLAUDE.md` if that's absent. First one wins
([Rules](https://opencode.ai/docs/rules/#precedence)).

**Turning the fallback off.** There is no config key, only environment variables. `OPENCODE_DISABLE_CLAUDE_CODE` drops all
`.claude` support and `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT` drops `CLAUDE.md`
([Rules](https://opencode.ai/docs/rules/#claude-code-compatibility)). **Conflict:** the page says the second covers only
`~/.claude/CLAUDE.md`, while the source also removes project `CLAUDE.md` (`session/instruction.ts:63-67`). V2 has no
fallback at all.

**`instructions`.** Paths, globs and URLs, combined with `AGENTS.md`
([Rules](https://opencode.ai/docs/rules/#custom-instructions)). A relative glob is matched at every level from the working
directory up to the worktree (`session/instruction.ts:80-84`). URLs have a 5-second timeout.

**Per-path rules.** Nothing like `appliesTo`: no globs, no frontmatter. The nearest thing is **undocumented** on V1: when
the `read` tool opens a file, any `AGENTS.md` between that file and the working directory is attached to the result once
per message (`tool/read.ts:300`, `session/instruction.ts:178-220`). [V2 documents it](https://opencode.ai/v2/docs/instructions/#discovery).
That is directory-scoped and read-triggered, so it isn't `appliesTo` either. Rules are repo-wide for sigil's purposes.

### D2. Skills

**Folders.** `.opencode/skills/` is native. OpenCode also reads `.agents/skills/` and `.claude/skills/`, in project and
home ([Agent Skills](https://opencode.ai/docs/skills/#place-files)). The layout survey's claim holds on paper. The match
is `skills/**/SKILL.md`, recursive (`skill/index.ts:23`). `OPENCODE_DISABLE_EXTERNAL_SKILLS` turns off both external
folders, and `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` only `.claude` (**undocumented** for the first). So `agents-standard`
output is already discovered.

**Frontmatter.** `name`, `description` required; `license`, `compatibility`, `metadata` optional; unknown fields ignored
([Agent Skills](https://opencode.ai/docs/skills/#write-frontmatter)). There's no `allowed-tools`: that field is ignored,
so a skill's tool list doesn't restrict anything here.

**Conflict on enforcement.** The page says `name` must match the folder and the regex
([Validate names](https://opencode.ai/docs/skills/#validate-names)). 1.19.5 checks only that `name` is a string
(`skill/index.ts:53-59`), and `NameMismatchError` is declared and never raised. `description` is optional at parse and
filtered out at listing (`skill/index.ts:322`). sigil's kebab ids satisfy the strict reading, so neither side matters to
output.

**Same name in two folders.** The docs only say to keep names unique
([Troubleshoot](https://opencode.ai/docs/skills/#troubleshoot-loading)). The source logs a warning and the later write
wins, and `add` runs with `concurrency: "unbounded"` around an async parse (`skill/index.ts:105-146`, `:235-245`). So
which copy wins is completion order, not folder order. One entry reaches the listing either way. That is harmless for
identical copies and a real hazard for different ones, which P2 should confirm.

**Delivery.** Skills are advertised in the native `skill` tool's description and loaded on demand
([Recognize tool description](https://opencode.ai/docs/skills/#recognize-tool-description)). `permission.skill` gates them
by name. A built-in `customize-opencode` skill sits underneath and a disk skill of that name overrides it
(`skill/index.ts:276-284`).

### D3. Agents

**Frontmatter.** See the Kind table. The file name is the agent name, and a nested path keeps its folders (`a/b.md` is
`a/b`, `config/entry-name.ts:15-19`). `mode` is `primary`, `subagent` or `all`, default `all`
([Mode](https://opencode.ai/docs/agents/#mode)). A subagent with no `model` uses the caller's
([Model](https://opencode.ai/docs/agents/#model)). `model` needs a `provider/model-id`, so a neutral tier has nothing
provider-free to map to; a target would omit it. `tools` is deprecated in favor of `permission`
([Tools](https://opencode.ai/docs/agents/#tools-deprecated)).

**A trap for emit specs.** The schema takes any extra key, and unknown keys are passed to the provider as model options
([Additional](https://opencode.ai/docs/agents/#additional), `core:v1/config/agent.ts:40-75`). A Claude-only field left
in the frontmatter would reach the model API instead of being dropped. A spec must map every field explicitly, which
`KindEmitSpec` already requires.

**Neutral tool map.** Permission keys are the mapping target
([Permissions](https://opencode.ai/docs/agents/#permissions)):

| Neutral  | OpenCode permission keys | Note                                                                          |
| -------- | ------------------------ | ----------------------------------------------------------------------------- |
| `read`   | `read`, `list`           | `list` is directory listing; `lsp` is left out of every neutral tool          |
| `search` | `grep`, `glob`           |                                                                               |
| `edit`   | `edit`                   | One key gates `write`, `edit`, `apply_patch`                                  |
| `shell`  | `bash`                   | V2 action name is `shell`; V1 keys are still read                             |
| `web`    | `webfetch`, `websearch`  |                                                                               |
| `agent`  | `task`                   | V2 action name is `subagent`. Depth is limited by `subagent_depth`, default 1 |
| `todo`   | `todowrite`              | Off by default on V2                                                          |

**Can `permission` express a read-only agent exactly? Yes.** The built-in `explore` agent is the proof: `"*": deny`, then
named allows (`agent/agent.ts:196-209`). Rules are ordered and the last match wins
([Granular Rules](https://opencode.ai/docs/permissions/#granular-rules-object-syntax)), key order is preserved at parse
(`core:v1/config/permission.ts:15-17`), and an agent's rules append after the defaults (`agent/agent.ts:293`). So:

```yaml
permission:
  '*': deny
  read: allow
  list: allow
  grep: allow
  glob: allow
```

This block shows the shape only. Its `read: allow` drops the `.env` rule, so sigil writes the object form (P4).

An allow-list like this also denies MCP tools and `skill`, because the keys are wildcard matches on the tool name. A
`disallowedTools` list maps to `<key>: deny` the same way. `read: allow` as a shorthand replaces the default `.env` rule;
**conflict** there: the page says `.env` reads are denied by default
([Defaults](https://opencode.ai/docs/permissions/#defaults)), and the source says `ask` (`agent/agent.ts:130-135`). Every catalog agent lists `read`, so every one writes
the object form. Step 2 decides how this fits `ToolDialect`, whose `names` form
expects a list, not a rule map.

### D4. Commands

**Frontmatter.** `description`, `agent`, `model`, `subtask`, plus `variant` (**undocumented** on the page,
`core:v1/config/command.ts:5-12`). Unknown keys are ignored. An invalid file throws and fails the load
(`config/command.ts:36`). A nested path becomes a namespaced command. A file can override a built-in such as `/init`
([Built-in](https://opencode.ai/docs/commands/#built-in)).

**Arguments.** `$ARGUMENTS` is the raw string and `$1`, `$2`… are positional
([Arguments](https://opencode.ai/docs/commands/#arguments)). Two behaviors the page doesn't give
(`session/prompt.ts:1372-1395`):

- **The highest-numbered placeholder takes every remaining argument**, joined by spaces.
- **A template with no placeholder gets the arguments appended** after a blank line.

Splitting honors `"..."` and `'...'`.

**Against `src/targets/prompt-args.ts`.** sigil has named `{{name}}` and a matching `args:` list. Claude resolves `$name`
through `arguments:` and Copilot uses `${input:name}`. OpenCode has no named form, so a new helper would write
`{{name}}` as `$<position in args>`. That's lossless for order, and the argument name survives only in the description.
`{{name}}` with no `args:` entry has no position; the [reuse map](#reuse-map) settles that case. A last free-text argument works unquoted, but
`explain-diff`, the only catalog prompt with `args:`, lists its free text first (P3).

**Shell injection.** `` !`cmd` `` and `@file` in a template run or expand on OpenCode. A catalog body that happens to
hold that syntax would now execute. Step 2 should check for it.

### D5. Hooks

**A neutral `script:` hook can map onto a generated plugin file on V1. On V2 it would need a second build.**

**The surface** ([Plugins](https://opencode.ai/docs/plugins/#events), `packages/plugin/src/index.ts`). A file in
`.opencode/plugins/` loads automatically (non-recursive, `config/plugin.ts:21`) and its exports are called with
`{ project, client, $, directory, worktree }`. All hooks run in sequence (`plugin/index.ts:284-297`).

| Neutral event   | OpenCode                                 | Can deny?        | Note                                                               |
| --------------- | ---------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `before-tool`   | `tool.execute.before`                    | Yes, by throwing | Fires for built-in and MCP tools (`session/tools.ts:107`, `:403`)  |
| `after-tool`    | `tool.execute.after`                     | No               |                                                                    |
| `prompt-submit` | `chat.message`                           | Undocumented     | Not in the page's list; typed in `packages/plugin/src/index.ts`    |
| `session-start` | `event` with `session.created`           | No               | Fire-and-forget: `void hook.event?.()` (`plugin/index.ts:257-261`) |
| `stop`          | `event` with `session.idle`              | No               | Same                                                               |
| `subagent-stop` | none documented                          | -                | Refuse                                                             |
| `notification`  | none (`permission.asked` is only a part) | -                | Refuse                                                             |

**Input fields.** `input` is `{ tool, sessionID, callID }` and `output` is `{ args }`. There's no stdin and no JSON; a
generated plugin has to build what the neutral script expects. `args` by tool (`tool/*.ts`): `read`, `edit`, `write` use
`filePath`; `bash` uses `command`, with `workdir`; `apply_patch` uses `patchText`. MCP tools arrive as `<server>_<tool>`.
These fit `HookInputDialect`'s fields. **Which edit tool appears depends on the model:** `gpt-*` models other than
`gpt-4` and `*oss*` get `apply_patch` and never `edit` or `write` (`tool/registry.ts:297-300`), so a path guard needs
patch headers too, as it already does for Copilot.

**Deny.** A thrown error is the documented way
([.env protection](https://opencode.ai/docs/plugins/#env-protection)). `args` is also mutable, which sigil wouldn't use.
`trigger` wraps the hook in `Effect.promise`, so a rejection is a defect, not a typed failure, and P5 must show that the
model sees it as a failed tool call rather than a crashed turn. There's also a dead end: the `"permission.ask"` hook is
in the plugin types but nothing in 1.19.5 triggers it (no match in `packages/opencode/src` or `packages/core/src`), so
`tool.execute.before` is the only route.

**Shape of a generated plugin.** One `.opencode/plugins/sigil-hooks.js` that, for each catalog hook on an event, runs the
composed `node -e` source through `child_process` with the normalized JSON on stdin, and throws on exit 2. The file is
sigil-owned and whole. It needs `node` on `PATH` at runtime, same as every other target's script hooks.

**Against V2.** The V1 file doesn't run on V2, and a V2 port is [its own migration](https://opencode.ai/v2/docs/migrate-v1/#plugins).
What a V2 install does when it finds a V1-shaped file in `.opencode/plugins/` isn't stated. See U2.

### D6. MCP

**Shape.** A `mcp` map keyed by server name, with `type` required ([Local](https://opencode.ai/docs/mcp-servers/#local),
[Remote](https://opencode.ai/docs/mcp-servers/#remote)). Against `PORTABLE_MCP_DIALECT` (`src/targets/portable-mcp.ts:30`):

| Portable              | OpenCode                | Fits `McpDialect` today?                     |
| --------------------- | ----------------------- | -------------------------------------------- |
| `mcpServers`          | `mcp`                   | Yes, `serversKey`                            |
| `${NAME}`             | `{env:NAME}`            | Yes, `envSyntax`                             |
| `command` + `args`    | one `command` array     | **No**                                       |
| `env`                 | `environment`           | **No**                                       |
| no `type` on stdio    | `type: local` required  | **No**: `stdioType` is the literal `'stdio'` |
| `type: http` or `sse` | `type: remote` required | **No**: `remoteType` is `keep` or `drop`     |
| `url`, `headers`      | same                    | Yes                                          |

So the data-only dialect needs new fields, or a small renderer hook. Step 2 decides which. The rule "a JSON MCP entry comes
only from an `McpDialect`" stands either way.

**`{env:NAME}` details** ([Env vars](https://opencode.ai/docs/config/#env-vars), `config/variable.ts:34-36`). Plain text
replacement over the whole file before parsing. It reaches every field, so `interpolatedFields` is everything. A missing
variable becomes an empty string with no error. There's no default syntax. The value isn't JSON-escaped, so a value
holding `"` breaks the parse. Invalid config is a hard failure at startup.

**V2.** `mcp.servers` with `disabled`, but the flat V1 entry stays accepted, and mixed members are recognized inside `mcp`
([Migrate from V1](https://opencode.ai/v2/docs/migrate-v1/#mcp-servers)).

### D7. Settings and permissions

**Keys sigil could merge.** Everything in `opencode.json[c]` is user-owned: the tool doesn't rewrite the file at start
beyond adding `$schema` (D0). The keys a target would touch are `mcp`, plus `permission` and `instructions` if the
`settings` kind ever maps them. That makes `settings` a better fit than Antigravity's, whose file is tool-owned. Writes
must be schema-valid, because a bad value stops startup, and unknown top-level keys are dropped silently
(`onExcessProperty: "ignore"`, `config/parse.ts:38-42`).

**Can sigil write JSONC without losing comments? Not today.** sigil has no JSONC code or dependency (no match for
`jsonc` in `src/` or `package.json`), and `serialize()` writes plain JSON. OpenCode itself patches JSONC with
`jsonc-parser` `modify`/`applyEdits` (`config/config.ts:13`, `:151-163`), so a comment-safe path exists if sigil wants that
dependency. It doesn't have to:

- **`.opencode/opencode.json` is loaded after the project root files** (`config/config.ts:438-448`). In a project, sigil
  can write there and never open the user's root `opencode.json[c]`. V1's page doesn't list it; V2's does
  ([Migrate from V1](https://opencode.ai/v2/docs/migrate-v1/#use-your-existing-configuration)).
- **`opencode.json` and `opencode.jsonc` both load at one level.** In user scope sigil can write `opencode.json` and leave
  a user's `opencode.jsonc` alone. The owner's own setup has that file, so this is the live case. A key set in both goes
  to the `.jsonc`.

Recommendation for step 2: never edit a `.jsonc`. Only plain JSON goes through `serialize()`.

### D8. Distribution

**Channel.** npm packages in the `plugin: [...]` array, installed by Bun at startup and cached in
`~/.cache/opencode/node_modules/` ([From npm](https://opencode.ai/docs/plugins/#from-npm)). Entries can be
`name@version`, a file path, or a `[name, options]` tuple (**undocumented** on the page, built-in
`customize-opencode` skill). `opencode plugin <module>` installs one and patches config, in project or with `--global` in
user config ([plugin](https://opencode.ai/docs/cli/#plugin)). There's no marketplace or manifest, and the ecosystem page
is a list.

**What it ships.** Code: hooks, tools, auth. A plugin has no documented way to ship skills, agents or commands as files.
The way that exists is **undocumented**: a `config` hook receives the merged config object and can mutate it
(`plugin/index.ts:245-253`), so a package could add `agent`, `command` or `skills.paths` entries. `skills.paths` and
`skills.urls` themselves appear only in the built-in skill and `core:v1/config`.

**Verdict.** This is a code channel, not an artifact channel. A sigil package would be a generated JS plugin that rewrites
config at runtime, on an undocumented hook and an API V2 replaced. The scaffold channel (files in the repo or the user
folder) is the one worth considering. On V2 the plugin story changes too: `plugins`, directories only, `opencode plugin
add`, Git specs ([V2 plugins](https://opencode.ai/v2/docs/plugins/)).

## Open for later steps

| #   | Question                                                                                                         | Source                |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------- |
| U1  | Do the file-based kinds really load unchanged on `@opencode/cli`? They load; enforcement isn't proven.           | [V2 run](#v2-run)     |
| U2  | What does V2 do with a V1-shaped `.opencode/plugins/*.js`: skip, warn, or fail? This decides if `hook` can ship. | undocumented, not run |

U3 to U9 are answered in the [Probe log](#probe-log).

## Reuse map

Step 2, 2026-11-03. Each row names the sigil piece an `opencode` target would use for one Kind table row, with what it
still lacks. Every path is written in OpenCode 1 shape, the shape V2 says it still reads.

| Row           | sigil piece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Gap                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| skill         | A skill `KindEmitSpec` writing `.agents/skills/<name>/SKILL.md`, the same file as `AGENTS_STANDARD_SKILL_SPEC` (`src/targets/agents-standard/spec/skill.ts:30`), with `AGENT_SKILLS_LIMITS` (`src/targets/agent-skills-limits.ts:15`). OpenCode documents the same 64 and 1,024 limits. `sharesSkillFilesWith` (`src/types.ts:538`) gains a fourth member, and `add` already refuses a second owner (`src/commands/add/plan.ts:120`)                                                                             | Don't write `.opencode/skills/`: a copy of one name in two folders is the completion-order hazard in D2. `allowedTools` isn't mapped, same as Codex, because OpenCode ignores it                                                                                                                                                                                                                             |
| agent         | A spec writing `.opencode/agents/<name>.md` with a `names` `ToolDialect` (`src/targets/tool-dialect.ts:32`) built from the D3 table. Every neutral tool has a key, so 39 of 39 catalog agents render `exact` in `restrictionOutcome` (`src/targets/tool-restriction.ts:80`). The `tools` `FieldMapping` writes `to: 'permission'` and its `serialize` shapes the rule map, as Antigravity's writes a YAML list (`src/targets/antigravity/spec/agent.ts:73`). `mode: subagent` is a constant `alwaysEmit` mapping | `disallowedTools` stays unmapped: no catalog agent authors one, and `restrictionProblems` then fails closed (`src/targets/tool-restriction.ts:54`). `model` stays unmapped because a tier has no provider-free id, with Cursor as precedent (`src/targets/cursor/spec/agent.ts:9`). One catalog agent sets it and inherits the caller's model. No `whenToUse`-style field                                    |
| prompt        | A spec writing `.opencode/commands/<slug>.md`, with the slug rule Claude's scaffold uses (`src/targets/claude-code/spec/prompt.ts:47`) and `substitutePlaceholders` (`src/targets/prompt-args.ts:31`) for a new positional helper                                                                                                                                                                                                                                                                                | **`bodyTransform` gets only the body** (`src/targets/spec-types.ts:101`, `src/targets/emit.ts:103`), and a position needs `args:`. It has to take the artifact too; existing callers are unaffected. A `{{name}}` with no `args:` entry stays in the body as literal text: refusing it would lose `author-artifact`, whose one hit is a doc example (`catalog/shared/prompts/author-artifact.prompt.md:120`) |
| rule          | `via` inline, as Codex and `agents-standard` declare it (`src/targets/agents-standard/capabilities.ts:18`), plus `renderRulesDocument` (`src/targets/shared/repo-wide-rules.ts:32`) for the root `AGENTS.md` on a full build (`src/targets/codex/index.ts:138`; the Copilot form is `src/targets/copilot/build-helpers.ts:19`). `isRepoWideRule` (`src/targets/shared/repo-wide-rules.ts:23`) keeps a scoped rule out                                                                                            | None for `via`. `instructions` could carry rule files, but they'd be repo-wide (D1), so a scoped rule would widen. No fifth `appliesTo` emitter                                                                                                                                                                                                                                                              |
| hook          | `HookInputDialect` (`src/targets/hook-input.ts:52`) fits D5's fields without change: the plugin passes `{ tool, args }`, with `pathFields: ['filePath']`, `commandField: 'command'` and `patch: { tools: ['apply_patch'], field: 'patchText' }`. `composeHookScript` (`:188`) builds the source                                                                                                                                                                                                                  | **No delivery path.** `hook` is a config kind (`src/kinds.ts:228`), so `add` sends it to a `ConfigMergeOp`. Merging a fragment can't write a JS file. V2 also won't run a V1 plugin, so a guard would look active and block nothing. See the neutrality table                                                                                                                                                |
| mcp           | An `McpDialect` value (`src/targets/mcp-dialect.ts:33`): `serversKey: 'mcp'`, an `EnvSyntax` (`src/targets/env-reference.ts:22`) writing `{env:NAME}`, and every field in `interpolatedFields`. `mcpServerOp` (`:164`) and a `ConfigKindTable` entry (`src/targets/config-kind-table.ts:64`) do the rest                                                                                                                                                                                                         | **The dialect needs data fields.** `stdioType` is only `'stdio'` (`:46`) and `remoteType` only `keep` or `drop` (`:48`), and nothing renames `env` or joins `command` and `args`. Add `stdioType: 'local'`, a `remoteType` that sets a value, `envKey` and `commandForm: 'array'`, read in `applyTypePolicy` (`:114`). A renderer hook would be a builder by another name                                    |
| settings      | None. The catalog's `settings` is Claude's vocabulary (`ownedBy`, `src/kinds.ts:115`), so its `Bash(...)` rules can't merge into `permission`                                                                                                                                                                                                                                                                                                                                                                    | `none`, as on Codex and Copilot                                                                                                                                                                                                                                                                                                                                                                              |
| config writes | The JSON merge. `parseConfig` (`src/config-merge/file-format.ts:29`) is `JSON.parse` for every non-TOML path, and `renderConfig` (`:38`) calls `serialize()` (`src/config-merge/primitives.ts:134`). **It doesn't handle `.jsonc`:** a comment fails the parse, and comments couldn't survive a write. `holdsUserComments` (`:77`) is TOML-only                                                                                                                                                                  | Destinations are plain `.json` only: `.opencode/opencode.json` and user `opencode.json` (D7). OpenCode parses `.json` as JSONC too (`config/config.ts:240`), so a hand-commented `.json` is refused by `add` as "not valid JSON" (`src/commands/add/read-config.ts:23`). No data is lost, but the hint needs a target-aware word                                                                             |
| user root     | `ConfigRoot` (`src/types.ts:184`) and `resolveConfigRoot` (`src/config-utils.ts:66`), with `resolveCodexHome` (`:32`) as the model                                                                                                                                                                                                                                                                                                                                                                               | `home` is wrong when `XDG_CONFIG_HOME` is set, so a new `opencode-home` root honors it, also listed in `isHomeScopedRoot` (`:86`) so backups run                                                                                                                                                                                                                                                             |
| `$schema`     | `classifyConfigDrift` (`src/config-merge/drift.ts:115`) compares only the keys in sigil's fragment                                                                                                                                                                                                                                                                                                                                                                                                               | None. OpenCode inserting `$schema` (D0) isn't drift                                                                                                                                                                                                                                                                                                                                                          |

The D4 injection question is answered: neither catalog prompt holds `` !`cmd` ``, `@file`, `$1` or `$ARGUMENTS`. A
future one is caught by `bodyForbids` (`src/targets/spec-types.ts:130`) on the prompt spec. Skills aren't templates, so
the check doesn't apply to them.

### Capability rows (draft)

The `plugin` channel stays undefined (`src/targets/capability-types.ts:55`): D8 found a code channel, not an artifact
channel.

| Kind     | Scaffold                                                  |
| -------- | --------------------------------------------------------- |
| skill    | native (`.agents/skills/`, shared)                        |
| agent    | native                                                    |
| prompt   | native                                                    |
| rule     | via (inline; repo-wide rules in `AGENTS.md` on a build)   |
| workflow | none (no workflow file, and the catalog holds none)       |
| hook     | none (V1-only plugin, and no whole-file path for a hook)  |
| mcp      | native                                                    |
| settings | none (this kind's schema is Claude Code's own vocabulary) |
| template | none (`TEMPLATE_NOT_EMITTED`)                             |

### Neutrality table

Every OpenCode difference from steps 1 and 2, and the layer that absorbs it.

| Difference                                                                            | Layer                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Paths under `.opencode/`, `.agents/skills/` and `~/.config/opencode/`                 | `KindEmitSpec.outputPath`; `ConfigKindTable` destinations            |
| `XDG_CONFIG_HOME` for the user config                                                 | New `opencode-home` `ConfigRoot`                                     |
| Agent `mode`, `permission` and the file name as the agent name                        | `KindEmitSpec` field mappings                                        |
| Unknown agent keys reaching the model API                                             | `KindEmitSpec`: only mapped keys are written; `forbiddenKeys` guards |
| Permission keys for neutral tools                                                     | `ToolDialect` (`names`)                                              |
| `read: allow` dropping the `.env` default (U9)                                        | Agent spec's `serialize`: the object form                            |
| No provider-free model id                                                             | Agent spec leaves `model` unmapped                                   |
| Positional `$1` from named `{{name}}`                                                 | Prompt `bodyTransform`, given the artifact                           |
| `` !`cmd` `` and `@file` in command templates                                         | `bodyForbids`                                                        |
| Skill folder shared with Codex, Antigravity and `agents-standard`                     | `Target.sharesSkillFilesWith`                                        |
| `AGENTS.md`, `.agents/skills/`, skill arguments                                       | `ProviderLexicon`                                                    |
| Repo-wide rules only, no `appliesTo`                                                  | `capabilities.ts` (`via`), `isRepoWideRule`                          |
| `mcp` key, `{env:NAME}`, `type: local` and `remote`, `command` array, `environment`   | `McpDialect` (with the new fields) and `EnvSyntax`                   |
| No env default, empty on a missing variable, no JSON escaping                         | Setup docs                                                           |
| `.jsonc` config files                                                                 | `ConfigKindTable` destinations (`.json` only)                        |
| `.opencode/` gains `.gitignore`, plus `package.json` and `node_modules` with a plugin | Setup docs                                                           |
| `.claude/skills/` also read: bodies collide, user-only prompts reach the model (P7)   | Setup docs (`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`, tested in P7)     |
| `CLAUDE.md` fallback on V1, none on V2                                                | Setup docs; the `AGENTS.md` carrier is the same on both              |
| Settings keys                                                                         | `capabilities.ts` (`none`)                                           |
| No artifact plugin channel                                                            | `capabilities.ts` (`plugin` undefined)                               |
| Agent files, commands and MCP on V1 and V2                                            | V1 shape, which V2 translates; U1 confirms                           |
| **Hooks as generated code, on a V1-only API**                                         | **None.** Shipped as `none`; see below                               |

No row changes `catalog/` or the zod schema. The shared code changes are three, all in the target layer's own types:
four `McpDialect` fields, the `bodyTransform` argument, and one `ConfigRoot`.

**Needed concept, only if hooks ever ship: a config kind that writes a whole sigil-owned file.** This isn't a catalog
concept, because hooks are already neutral and D5's fields fit. It is a pipeline one. `add`, `update`, `uninstall` and
drift all assume a config kind is a fragment in a shared file, so a generated plugin needs a new op kind through
`src/config-merge/` and the manifest, plus a test per path. It would also need a V2 plugin build and an answer to U2, and
even then a guard installed for one line fails open on the other. The catalog has three hooks, so that cost isn't
justified for a first version. `hook: none` needs no concept and fails visibly: `add` skips with the reason.

### Reuse first: `agents-standard` or a small target?

`agents-standard` already reaches OpenCode on paper. It writes `.agents/skills/` (D2), with each skill's rules inlined,
and a full build adds a root `AGENTS.md` (D1). `sigil add` writes no `AGENTS.md`, so a scaffold install gets repo-wide
rules only inside skills. P7 proved this live.

| Catalog (2026-11-03) | Count | `agents-standard`      | Small `opencode` target |
| -------------------- | ----- | ---------------------- | ----------------------- |
| skills               | 46    | 45, without `mk-check` | 45 (same files)         |
| rules                | 64    | inlined                | inlined                 |
| agents               | 39    | no                     | yes, restriction exact  |
| prompts              | 2     | no                     | yes                     |
| MCP servers          | 4     | no                     | yes                     |
| hooks                | 3     | no                     | no                      |
| settings             | 6     | no                     | no                      |

`mk-check` is `platforms: [claude]`. The target adds no skill or rule reach, so its whole value is 39 agents, 2 prompts and 4 MCP servers. Nothing else
carries those: `.claude/agents/` isn't in OpenCode's paths, and an MCP entry needs OpenCode's own shape. The agents are
the catalog's reviewers and auditors, and all 39 stay exact, so that's real reach rather than a thin layer.

**Answer for step 4: the small target is worth more than a doc on technical value; P4 and P6 passed.** It is mostly
data in one `src/targets/opencode/` folder plus the three shared changes, and the existing conformance rules cover it.
This isn't the decision. Against it stand owner priority 4 of 4, a second product line, and live probes per OpenCode
update. If step 4 says no-go, the doc route stays honest as long as it says what it leaves out.

## Probe log

### Setup

- `opencode-ai` 1.19.4, Linux. The docs pass read tag `v1.19.5`, one patch later.
- Model: `opencode/deepseek-v4.1-flash-free` for every model run. `opencode/glm-5.3-flash-free` also passed the gate and
  repeated P1's `AGENTS.md` result.
- Isolation as in D0: `env -i` with a scratch `HOME`, no `XDG_*` variables and no provider keys, one fresh `git init` repo
  per probe under the scratchpad. No `auth.json` was created, and `opencode models` listed no Anthropic model.
- Scripted form: `opencode run --model <id> '<prompt>'`, without `--auto`, so an `ask` is auto-rejected. Loader facts came
  from `opencode debug skill`, `debug agent <name>`, `agent list` and `mcp list`, which call no model.
- **Gate passed (U7).** A free model answers with no credentials. Four early P1 runs were killed by an 80-second
  timeout with no output. The cause wasn't found; the same probes then ran normally, with stdin closed and output in a
  file, and it didn't happen again.

### Results

| Probe | Run                                                                       | Expected                              | Observed                                                                         |
| ----- | ------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| P1    | `AGENTS.md` asks for a closing word                                       | Word present                          | `Hello! TANGERINE`, on both models                                               |
| P1    | `CLAUDE.md` alone                                                         | Word present (fallback)               | `Hello! PERSIMMON`                                                               |
| P1    | Same, `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1`                             | Source: word gone. Docs: word stays   | `Hello!`, so the source is right                                                 |
| P1    | Same, `OPENCODE_DISABLE_CLAUDE_CODE=1`                                    | Word gone                             | `Hello!`                                                                         |
| P2    | One skill only in `.agents/`, `.opencode/` and `.claude/`                 | All three listed and picked           | All listed; each picked by description, and its code came back                   |
| P2    | `dup-skill` with a different body in all three folders                    | One entry, winner by completion order | One entry. `.opencode` 15 of 16 listings, `.claude` 1. The model got `.opencode` |
| P3    | `.opencode/command/hello.md`, `$1` `$2`, args `one two`                   | `HELLO[one][two]`                     | `HELLO[one][two]`                                                                |
| P3    | Same, args `one two three four`                                           | The last placeholder takes the rest   | `HELLO[one][two three four]`                                                     |
| P3    | `.opencode/commands/plural.md`, `$1` `$ARGUMENTS`, args `aa bb`           | Plural folder loads                   | `PLURAL[aa bb][aa bb]`: loads, and `$1` as the last position takes both          |
| P3    | `explain-diff` shape, `$1` then `$2`, four unquoted words                 | First word in `$1`, the rest in `$2`  | `AUDIENCE[beta gamma reviewer] DIFF[alpha]`                                      |
| P3    | Same, first argument quoted                                               | Words stay in `$1`                    | `AUDIENCE[reviewer] DIFF[alpha beta gamma]`                                      |
| P4    | `mode: subagent`, the D3 allow-list, asked through `task` to write a file | Refused                               | Model reported only `glob`, `grep`, `read`; no file                              |
| P4    | Same list with `mode: all`, write and shell through `--agent`             | Refused                               | Model reported no such tool; no file                                             |
| P4    | Same, read `note.txt`                                                     | Allowed                               | Text returned                                                                    |
| P4    | Same, read `.env`, with shorthand `read: allow`                           | Default `.env` ask dropped            | **Value returned**                                                               |
| P4    | Object-form `read` keeping the `.env` rules, read `.env`                  | `ask`, auto-rejected                  | `permission requested: read (.env); auto-rejecting`, no value                    |
| P4    | Object form, read `note.txt`                                              | Allowed                               | Text returned                                                                    |
| P4    | Object-form `read` plus `bash: allow`, run `cat .env`                     | The `read` rule doesn't cover shell   | **Value returned**                                                               |
| P5    | Plugin throws on a `.env` write                                           | Failed tool call, turn continues      | `Write .env failed`, the error reached the model, exit 0, no file                |
| P5    | Same plugin, `ok.txt`                                                     | Allowed                               | Written                                                                          |
| P5    | Same, inside a subagent through `task`                                    | Fires too                             | Fired with the subagent's session id and blocked the write                       |
| P6    | `.opencode/opencode.json` `mcp`, `{env:PROBE_HOST_TOKEN}` set             | Starts, receives the value            | `probe connected`; server and tool both saw the value                            |
| P6    | Same, variable unset                                                      | Empty string, no error                | Started with `TOKEN=""`, and the model got `TOKEN=`                              |

P5 raw input: `input` is `{ tool, sessionID, callID }`, and `output.args` is `{ filePath, content }` for `write` and
`{ description, subagent_type, prompt }` for `task`. That matches D5 and `HookInputDialect`.

### P7, what OpenCode already picks up

Two repos with no OpenCode config, both from sigil's real output.

**A full `agents-standard` build:** `.agents/skills/` (45 skills) and a 6,493-byte root `AGENTS.md`. All 45 listed. The
model confirmed the rules are in its prompt, and it picked `ng-document` by description.

**`sigil add` of one skill, one agent and one prompt for `claude`, plus the same skill for `agents-standard`:**

- No `AGENTS.md` was written. Confirmed: `add` carries repo-wide rules only inside skills.
- `.claude/agents/ng-code-reviewer.md` isn't in `opencode agent list`. Confirmed: an agent needs a target.
- **`ng-document` reaches OpenCode twice, with different bodies:** 7,419 bytes in `.agents/`, with rules inlined, and 3,776
  in `.claude/`. One entry, and `.agents` won 16 of 16 listings. With P2's 1 in 16, the winner is usually stable and
  not guaranteed, as the source says (U4). sigil makes this collision itself: `sharesSkillFilesWith` covers only skill
  folders a target writes, and `claude` isn't in that group.
- **U8 confirmed. `shared-explain-diff` has `disable-model-invocation: true`, and OpenCode offers it anyway.** The model
  listed it and, asked for a diff summary with no command, loaded it. A prompt meant to run only on the user's command
  can run on the model's choice.
- `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` removes both `.claude` entries, leaving `ng-document` from `.agents/` and the
  built-in. It is an environment variable, so sigil can only document it.

### V2 run

`@opencode/cli` 2.2.5, Linux, 2026-11-03. Loader only: all eight free models returned `Free usage limit reached`, with no
credentials in use. That includes `deepseek-v4.1-flash-free`, which answered on V1 the same day. So no row here rests on a
model's reply.

How to run it:

- `npm i --prefix <scratch> @opencode/cli@2.2.5`, then call `node_modules/@opencode/cli-linux-x64/bin/opencode`. npm 12 skips
  the package's postinstall, so `.bin/opencode` only prints an error.
- D0's isolation holds (`debug paths` stays in the scratch `HOME`). Add `TMPDIR`, or `tmp` is `/tmp/opencode`. Pass
  `--standalone`, or commands use a background service.
- `run` has no `--command`, and `debug skill` is gone. Loader facts come from `opencode serve` with basic auth (`opencode`,
  the printed password): `/api/skill`, `/api/command`, `/api/agent`, `/api/mcp`. Give fixtures a commit and create a session, then poll for a
  project entry: with both, the lists filled within about 3 seconds. They stayed empty in the two runs without them,
  which had no commit, so the cause wasn't isolated.
- `POST /api/session/{id}/command` stores the expanded text first, so substitution needs no model reply.

| Probe | Run                                                         | Observed                                                                                 |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P2    | One skill only in `.agents/`, `.opencode/` and `.claude/`   | All listed. Picking wasn't run                                                           |
| P2    | `dup-skill` with a different body in all three, 16 listings | One entry, `.opencode` 16 of 16                                                          |
| P3    | `$1` `$2`, args `one two` and `one two three four`          | `HELLO[one][two]`, `HELLO[one][two three four]`                                          |
| P3    | `.opencode/commands/`, `$1` `$ARGUMENTS`, args `aa bb`      | `PLURAL[aa bb][aa bb]`                                                                   |
| P3    | `explain-diff` shape, unquoted and with the first quoted    | `AUDIENCE[beta gamma reviewer] DIFF[alpha]`, `AUDIENCE[reviewer] DIFF[alpha beta gamma]` |
| P3    | First argument `"a "b" c"`                                  | Splits: `DIFF[a ]`. `\"` splits too                                                      |
| P3    | First argument `'a "b" c'`                                  | Holds                                                                                    |
| P4    | Agents with the object-form `read`, `mode: subagent`, `all` | Listed. Rules keep `*.env: ask` after `*: allow`, and `* deny` before the allows         |
| P6    | `mcp` with `{env:PROBE_HOST_TOKEN}`, set and unset          | `connected`, value received; unset starts with an empty string                           |
| P7    | `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`                     | The `.claude` skill is gone; `.agents` and `.opencode` remain                            |

**Differences from V1.** `dup-skill` was 15 of 16 `.opencode` on V1, and the [Skills](https://opencode.ai/v2/docs/skills/) page
now states a fixed precedence. A V1-shaped `mcp` map is translated to `mcp.servers`. The file-write side effects didn't
appear: no `$schema` insert in `opencode.json`, and no `.gitignore` in `.opencode/`.

**Not run:** picking by description, permission enforcement, `cat .env`, `AGENTS.md` versus `CLAUDE.md`, and U2. Instruction
entries were empty without a model turn, so they prove nothing either way. These are Phase F in the roadmap.

### Quoting run

2026-11-04, `opencode-ai` 1.19.4 and `@opencode/cli` 2.2.5, Linux, one fresh session per case. The question from the roadmap's
Phase D: can a real diff reach `$1`? The template was `DIFF[$1] AUDIENCE[$2]`, sent as `<first argument> reviewer` through the
server's command route (V1 `POST /session/{id}/command`, V2 `POST /api/session/{id}/command`). Both store the expanded text
before any model reply, so no row rests on a model: no free model answered on V1, and the requests timed out waiting for one.
`serve` rejects `--standalone`, and `OPENCODE_SERVER_PASSWORD` sets its password instead of the printed one. V1 and V2 gave the
same result on every case.

| Case | First argument                                                 | Observed in `$1`                | Observed in `$2`               |
| ---- | -------------------------------------------------------------- | ------------------------------- | ------------------------------ |
| 1    | `"it's a test"`                                                | Whole                           | `reviewer`                     |
| 2    | `'say "hi" now'`                                               | Whole                           | `reviewer`                     |
| 3    | `it's "both" here`, in `"`                                     | 5 of 16 characters              | The rest, then `reviewer`      |
| 3    | Same, in `'`                                                   | 2 of 16 characters              | The rest, then `reviewer`      |
| 4    | Three lines, in `"` and in `'`                                 | Whole, newlines kept            | `reviewer`                     |
| 5    | A real 1,648-character `git diff` of a test file, holding both | 848 of 1,648 in `"`, 219 in `'` | Diff text, with quotes dropped |
| 6    | `"one two"`, no second argument                                | Whole                           | Empty, no error                |

**A diff holding both quote types can't reach an argument whole, and nothing reports it.** The model would get part of the
diff, and the rest as the audience. Most real diffs hold both, so `explain-diff` doesn't ship on this target: its spec skips a
prompt with two or more arguments, and `add` says why. This is the arguments' shape, not the prompt's: `{{diff}}` could reach
OpenCode whole only as the last argument, and reordering `args:` to fit would change the catalog for one target.

### Sigil output run

2026-11-04, `opencode-ai` 1.19.4 and `@opencode/cli` 2.2.5, Linux, D0's isolation, with `sigil`'s own output and no hand-written
files except case 5's. One repo held `sigil add --target opencode` of `shared/feature`, `shared/code-reviewer` and
`shared/author-artifact`. The other held a full `sigil build --target opencode`: 45 skills, 39 agents, 1 command. `add` also
skipped `shared/explain-diff` with the quoting reason.

| Case | Check                                                  | Observed                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | V1 `debug skill`, V2 `/api/skill`                      | Both repos, every skill listed: 45 of 45 on the build. Extras are built-ins: V1 `customize-opencode`, V2 `Browser`, `OpenCode`, `Report`                                                                                              |
| 2    | V1 `agent list` and `/agent`, V2 `/api/agent`          | 39 of 39 on the build, all `subagent`. 41 subagents in all, with the two built-ins (`explore`, `general`). The `add` repo: 3, the same way                                                                                            |
| 3    | V1 `debug agent code-reviewer`, V2 `/api/agent`        | Same order on both, after the defaults: `*` deny, then `read` `*` allow, `*.env` ask, `*.env.*` ask, `*.env.example` allow, then `list`, `grep`, `glob`, `bash` allow. All 39 agents carry the deny rule                              |
| 4    | V1 `/command`, V2 `/api/command`                       | `shared-author-artifact` under its slug, in both repos                                                                                                                                                                                |
| 5    | Command route, one word, a prompt with one `args` item | `ECHO[tangerine]` on both, from `ECHO[{{word}}]`. Neither catalog prompt fits (`author-artifact` has no `args`, `explain-diff` doesn't ship), so this is a fixture rendered through `OPENCODE_PROMPT_SPEC`                            |
| 6    | V1, the agent asked through `task` to read `.env`      | **Not answered.** The one try hit a 150-second timeout with no output and stdin closed, so nothing was read and no value appeared. This proves nothing about refusal. V2's reply to case 5 was `Free usage limit reached`, status 429 |

**What still rests on hand-written fixtures.** P4's `.env` result, because case 6 had no model reply: the rules above are
loaded from sigil's output, but nothing has been seen enforcing them. Also P2's picking between two copies, and P3's second
argument. Model-backed checks on V2 stay in Phase F.

**For the next run.** V1 and V2 take different command bodies: `{"command", "arguments"}` on V1, `{"name", "text"}` on V2. On V2
one `/api/skill` read 4 seconds after creating a session came back empty, and a later run polling each second filled in 2. The
cause wasn't isolated, so poll.

### What the probes change

- **U3 to U9 are answered.** U1 and U2 stayed open here: these probes didn't run on `@opencode/cli`.
- D3 stands. Blocked tools were absent from the model's report, not refused, and no file appeared. That rests on the
  model's word plus the result. The object-form `read` isn't optional, because P4 returned a `.env` value with the
  shorthand.
- **The object form protects only the `read` tool.** All 39 catalog agents list `shell`, so `bash: allow` lets `cat .env`
  through. That is the authored restriction rendered exactly, and with `hook: none` there is no guard behind it.
- D5 stands for V1: a guard works, and it fires in subagents. The reason for `hook: none` is V2 and the delivery path,
  not the plugin API.
- **`explain-diff` needs quoting on OpenCode.** `{{diff}}` becomes `$1`, so an unquoted diff leaves one word there and
  sends the rest to `audience`. Quoting fixes it. A diff holding `"` wasn't tested. `opencode run` also re-quotes an
  argument holding spaces, so scripted tests must pass words separately.
- A corrected D1 conflict: the source is right, and `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT` also drops a project `CLAUDE.md`.
- D0's dependency install is narrower than the source reading suggested. Three `.opencode/` folders with no plugin kept
  only their `.gitignore` across their runs.

## Decision

**Go, staged, with target id `opencode`.** Scaffold channel only. `hook`, `settings` and `workflow` stay `none`, and the
`plugin` channel stays undefined. Code no longer waits on U1 (owner, 2026-11-03): the [V2 run](#v2-run) showed that every
kind loads, and the enforcement half of U1 closes last, in the roadmap's Phase F.

- **Demand.** Low. OpenCode is the owner's priority 4 of 4, no outside demand is recorded, and the owner's own config
  is left over from a retired worker setup. That rules out building ahead of Claude, Copilot or Antigravity work. It
  doesn't rule out the target, because OpenCode is in the owner's delivery order.
- **What already works with no target (P7).** A full `agents-standard` build reaches OpenCode today: 45 skills, picked
  by description, and repo-wide rules through the root `AGENTS.md`. `sigil add` installs skills with their rules
  inlined, but no `AGENTS.md`. So the first deliverable is a setup note, at no code cost.
- **What a target adds.** 39 agents with their tool restrictions exact (P4), 2 prompts as commands (P3) and 4 MCP servers
  (P6). No other route carries those: P7 shows `.claude/agents/` isn't read. It adds no skill or rule reach.
- **Maintenance cost.** Per catalog change, the same as any target: emit specs, `provider-limits` and the conformance
  rules. Per OpenCode update, the probes again. This is the cheapest live check sigil has, because it needs no account,
  and that's what the owner's focus asks for: a target that can stay proven. A re-run script, as Antigravity has, keeps
  it to one command. The real extra cost is a second product line, since V1 and V2 both have to be probed.
- **Neutral concepts.** None for this scope: no row changes `catalog/` or the schema, and the three shared changes are in
  the target layer. The whole-file config kind stays unbuilt, because `hook: none` doesn't need it.
- **Hooks stay out, although P5 passed.** A guard works on V1 and fires in subagents. But it would be a generated file
  that V2 doesn't run, so a catalog guard could look installed and block nothing. Failing visibly at `add` is safer than
  a `.env` guard that silently stops working on an upgrade.

**Why not stop at the doc?** It would leave every reviewer and auditor agent out, and those are the catalog's main
reach beyond skills. The target is mostly data in one folder. If U1 fails, the target stays for V1 and the docs narrow to it.

**What would change this.** If `@opencode/cli` doesn't enforce the V1 shape for agents (U1), this record is revised and the
setup docs narrow to V1. The code stays, because it holds for V1. U2 only decides whether hooks can ever ship, so it doesn't gate the target.

**Known limits to carry forward.**

- `.env` stays reachable through `shell` on every catalog agent, with no hook to stop it (P4). The setup note says so.
- A Claude install in the same repo reaches OpenCode: skills can collide with different bodies, and a user-only prompt
  is offered to the model (P7). The setup note names `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS`. A warning from `add` is a
  question for the roadmap.
- Every model result here comes from one free model, on one version. The loader results don't depend on the model.
- The probes ran on 1.19.4, and the docs pass read 1.19.5.

**Stages** (the roadmap, step 5, turns these into phases):

1. Setup note for the free route, with P7's limits.
2. Probe `@opencode/cli`, loader first. U1's enforcement half and U2 close last, in the roadmap's Phase F.
3. Shared changes: the `McpDialect` fields, the `bodyTransform` argument and the `opencode-home` root.
4. The target: skills, agents, prompts, rules and MCP.
