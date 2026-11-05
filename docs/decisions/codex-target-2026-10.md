# Codex target (2026-10)

Status: shipped 2026-10-31 as ADR Phase 5, covering skills, hooks and MCP. Probed on Codex CLI 0.166.0, Linux. The
brief it started from was deleted once this record covered it.

## How the probes ran

`codex` was not signed in, and no OpenAI account was used. Every probe ran the real `codex exec` binary against a local
mock of the Responses API, configured through the documented `model_providers` setting, with a throwaway `CODEX_HOME`.
The mock returned scripted tool calls and logged each request body.

That proves what Codex loads, what it sends to the model, and what its hooks and MCP clients do. **It does not prove
that a real model picks a skill**: dispatch on the `description` was not tested here. The [real-model run](#real-model-run)
tested it later.

## Results

| #   | Question                                    | Observed                                                                                                                                              |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Do project `.agents/skills` load?           | Yes, in the request's skill listing, with the project trusted, explicitly untrusted, and with no trust entry                                          |
| A2  | Do `.codex/agents/*.toml` load?             | Not observed: no agent tool or role reached the request with this model. Moot, see [Agents](#agents)                                                  |
| A3  | Does `hooks.json` accept `args`?            | **No.** `command: "node"` ran with no arguments, the hook reported Failed, and the write went through. Only one command string runs                   |
| A4  | What does `apply_patch` send?               | `tool_name: "apply_patch"`, `tool_input: { "command": "<patch text>" }`. Matcher `Edit\|Write` fires. Exit 2 blocks the write                         |
| A5  | Unreviewed project hook in `codex exec`?    | **Skipped with no output, exit 0, and the write succeeded.** With `--dangerously-bypass-hook-trust` it ran                                            |
| A6  | Does Codex read `AGENTS.md`?                | Yes when trusted or with no trust entry. **Not read in an explicitly untrusted project**, unlike skills                                               |
| A7  | Project `config.toml` MCP, `${NAME}`?       | The server started when trusted and not when untrusted. `${NAME}` is **not expanded** in `args` or `env`. `env_vars = ["NAME"]` forwards the variable |
| A8  | Does the published Claude marketplace load? | `codex plugin marketplace add makubexD/sigil --ref marketplace` and `codex plugin add` work. See [Plugins](#plugins)                                  |

## Hooks fail open

Three separate routes let a write through with no error, and each needs its own answer:

1. **An unreviewed hook is skipped.** That's Codex's design; the setup page and install hint must say so.
2. **A hook that exits with anything but 2 allows the action.** So a hook that can't start protects nothing.
3. **`protect-config` reads the wrong field.** It parses a string `tool_input`, or `file_path` and `path`, so Codex's
   `{ command }` object yields no file to check.

Codex runs a hook through `$SHELL` on Unix and `%COMSPEC%` on Windows, with `commandWindows` as the Windows override
([`command_runner.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/command_runner.rs),
[`discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)). A multi-line
`args` script must therefore become one string; see [Hook command](#hook-command).

## Plugins

Installing `typescript-starter`, `hook-protect-config` and `mcp-filesystem` from the existing marketplace showed:

- **Skills load**, as `typescript-starter:ts-document` and so on. Four of the plugin's files still carry Claude terms
  (`CLAUDE.md`, `.claude/`, `$ARGUMENTS`), because they're rendered with Claude's lexicon.
- **MCP loads.**
- **Agents don't load.** The plugin's `agents/` folder is ignored.
- **`hook-protect-config` fails open.** Its `args` are dropped as in A3, so the hook reports Failed and `.env` is written,
  even with hook trust bypassed.

## Decisions

### Agents

**No agents on Codex** (`agent: none`). All 39 catalog agents set `tools`. A Codex agent file can't restrict tools or
replace the parent's sandbox ([Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)), so rendering
one would silently widen it, which `renderArtifact` exists to refuse. Reopen if Codex adds a per-agent sandbox or tool
list.

### Plugin route

**No Codex plugin emitter.** Skills and MCP arrive through the published Claude marketplace, which is the ADR Phase 4
outcome for Copilot. The Claude terms in skill bodies are an accepted, documented limit. **Hook plugins must not be
recommended on Codex**; `sigil add` is the route for hooks. `MarketplaceFormat` isn't extracted, because no second format
exists.

### Prompts

**`prompt: none`.** Custom prompts are
[deprecated](https://learn.chatgpt.com/docs/custom-prompts) and live only in the home directory.

### TOML

**`smol-toml` reads, and sigil writes by splicing text**, because re-serializing would drop a user's comments. Sigil
owns whole `[mcp_servers.<key>]` tables, and `renderToml` refuses to write unless the result parses back to the merged
object. A same-named table a user wrote is replaced, as `object-spread` does in JSON.

### Skill files

**A project installs skills for `codex` or `agents-standard`, not both.** They write the same files. An early version let
both own them, and review found that one target's `update` marked the other's file as edited, different install sets
rendered different Boundary sections, and treating identical files as no conflict adopted users' own files. `add` now
refuses the second target (`Target.sharesSkillFilesWith`).

### Hook command

**A `node -e` script is stored base64-encoded in `command`.** Codex runs a hook through `$SHELL -lc`, or `%COMSPEC%`, and a
hook that can't start lets every call through. The encoded form has no character any of those shells treats specially.
The cost is that `/hooks` shows an unreadable string, so review means reading the catalog source. Protection across
shells won over readability.

## Real-model run

Codex CLI 0.166.0 on Linux, model `deepseek-flash` on DeepSeek's paid API as a `model_providers` entry, in a throwaway
`CODEX_HOME` and `HOME`, with the key passed only to that process. Codex warned that it has no metadata for the model.

| Date       | Case | Run                                                                         | Result                                                                          |
| ---------- | ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-11-04 | R1   | One call, `wire_api = "responses"`                                          | **Answered.** DeepSeek serves the Responses route Codex needs                   |
| 2026-11-04 | R2   | One call, `wire_api = "chat"`                                               | Refused at load: `` `wire_api = "chat"` is no longer supported ``               |
| 2026-11-04 | R3   | A skill in `.agents/skills/`; the question matches its description, unnamed | **Pass, 2 of 2.** The first command was `cat` on that `SKILL.md`, then the word |
| 2026-11-04 | R4   | Control: same question, no skill                                            | Searched the repo, answered `NONE`                                              |

So a real model does pick a skill from its description. This is one model, and not one OpenAI ships.

## Not proven

- A real model using a hook-guarded tool. The [real-model run](#real-model-run) covers skills only.
- The hook on Windows, fish, zsh, tcsh or nushell. It ran through bash and `sh` only.
- The `/hooks` review itself. Hook runs used `--dangerously-bypass-hook-trust`.
