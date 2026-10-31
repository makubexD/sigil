# Copilot plugin channel: does the Claude-format marketplace work? (2026-10)

Status: tested 2026-10-30; the owner chose the narrowed Route A the same day. This closes ADR Phase 4
of [distribution-channels-2026-09](distribution-channels-2026-09.md), section 6.

## How it was run

The main session ran it unattended, on the owner's instruction, against the published marketplace
(`marketplace-v0.3.0`, `5cfefad`).

- **Copilot CLI 1.0.105:** `copilot -p` and a pseudo-terminal for slash commands, in a throwaway
  `COPILOT_HOME`. Auto mode picked `gpt-6-luna`.
- **VS Code 1.143.1:** `code chat` in a separate profile. Its sessions ran on the Copilot CLI runtime
  (`provider: copilotcli`), so agreement between the two surfaces is less independent than it looks.
  Plugins were registered from a local clone with `chat.pluginLocations`.

A re-run must use the prefixed names, `/<plugin>:<skill>` and `<plugin>:<agent>`, and must uninstall
`mcp-filesystem` before the hook checks, or the model writes through it and never reaches the hook. A
CLI project hook also needs a trusted folder. The probe project had no `.github/` or `.claude/`, so
nothing shadowed a plugin. Each run spends the owner's AI credits (0.37 for a one-word reply), so a
check that a file listing can answer doesn't need a model run.

## Results

| Check                                  | Copilot CLI                                                   | VS Code                                         |
| -------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| Marketplace adds                       | **Pass** with `makubexD/sigil#marketplace`; fails with no ref | Not tested (documented; local clone used)       |
| Lists 21, five install                 | **Pass** (one transient `browse` failure)                     | Local folders loaded                            |
| Skills load                            | **Pass**: 9, as `/<plugin>:<skill>`                           | **Pass**                                        |
| Agents load (`.md`)                    | **Pass**: 7, as `<plugin>:<agent>`                            | **Pass**                                        |
| Read-only agent can't edit             | **Pass**: no edit tool                                        | **Pass**                                        |
| Writing agent can edit                 | **Pass**, with the hook below patched to `exec`               | **Pass**                                        |
| `$ARGUMENTS` filled                    | **Pass** by slash; literal if the model loads the skill       | **Pass** by slash                               |
| `$diff`, `$audience` filled            | **Degraded**: stay literal, arguments appended at the end     | **Degraded**: not expanded; model read the file |
| No auto-invocation                     | **Pass**                                                      | Not tested                                      |
| `hook-protect-config` blocks `.env`    | **Unsafe**: `.env` created                                    | **Unsafe**: `.env` created                      |
| `hook-protect-config` allows `add.ts`  | **Unsafe**: `edit` denied, "hook errored"                     | Allowed, through `apply_patch`                  |
| `hook-reviewer-bash-guard`             | **Unsafe**: every shell command denied                        | **Unsafe**: `touch` denied                      |
| `mcp-filesystem` runs, root is project | **Fail**: runs, but the root is the plugin folder             | **Fail**: same                                  |

Not tested: VS Code's marketplace install UI and `#ref`, its Local harness, the Copilot app and cloud
agent, `dependencies`, Windows, and the MCP servers that need environment values.

## Causes

1. **`command` + `args` doesn't work on Copilot.** sigil's plugin hooks use Claude's exec form. Copilot
   drops `args` unless the entry uses `exec`, so it runs bare `node`, which reads the JSON payload as a
   script and exits 1, and `preToolUse` fails closed. Changing `command` to `exec` in the installed copy
   made `hook-reviewer-bash-guard` allow `touch` and the writing agent's edit succeed. `sigil add` already
   writes `exec`.
2. **`apply_patch` defeats `shared/protect-config`, also under `sigil add`.** On the CLI the hook fires
   (`tool_name: Edit`), but `tool_input` is the raw patch string, so `ti.file_path ?? ti.path` finds no
   path and the script allows the call. With `sigil add --target copilot` in a trusted folder and project
   hooks confirmed loaded, `.env` was created. The `edit` tool sends `path`, which the script reads; a
   `.env` write through `edit` was not tried, because the model chose `apply_patch`. This closes the live check
   left open in [copilot-hooks-2026-10](copilot-hooks-2026-10.md): it failed. Fixed with this record:
   the hook now reads the patch's file headers, and with `sigil add` both Copilot CLI and VS Code deny an
   `apply_patch` write of `.env`, and the CLI still allows `notes.txt`. Why `hook-protect-config` neither
   errored nor blocked as a plugin in VS Code stays unknown.
3. **`.` in plugin MCP config is the plugin folder on Copilot.** Claude uses the session directory
   ([ADR section 8](distribution-channels-2026-09.md#8-hooks-and-mcp-as-plugins-2026-10-30)), so
   `mcp-filesystem` can't reach the user's project on Copilot.
4. **An MCP write skips the guard.** `filesystem-write_file` doesn't match `Edit|Write`. Not checked on
   Claude.

## What held up

The test was expected to break on several of these, and none did. The `.md` agent extension, Claude's
tool names (mapped to `view`, `rg`, `glob`, `bash`), the nested hook shape, PascalCase events and the
`.claude-plugin/` manifests all work. `#ref` works on the CLI although its help doesn't show it. Plugin
names are namespaced, so documentation must use the prefixed forms.

## Decision

**Route A, narrowed: rely on the Claude format for skills, agents and prompts, and add no emitter.**
These pass on both surfaces, and an emitter's main remaining benefit, the two degraded rows, affects one
skill. Copilot users keep `sigil add` for hooks and MCP. It writes `exec`. Its MCP path passed one run
on Copilot CLI 1.0.105, 2026-10-30: `sigil add mcp:shared/filesystem --target copilot --yes` wrote
`.mcp.json`, the server connected, and its only allowed directory was the project. Copilot loads a
project `.mcp.json` only from a trusted folder. VS Code was not run for this path.

The gate set before the test sent any unsafe result to Route B, a Copilot emitter; the owner accepted
this as an exception. The cost: nothing stops a Copilot user installing a `hook-*` plugin, and the
marketplace can't filter by client, so the limit is documentation only. `platforms: [claude]` doesn't
hold on this route either: `reviewer-bash-guard`, `worker-mode-guard` and `mk-check` never reach Copilot
through `add`, but can be installed from the marketplace. An untested alternative is a single-string
shell-form `command`, which might run on both clients without a separate format.

There is no `plugin` channel in `src/targets/copilot/capabilities.ts`, so
[capabilities.md](../reference/capabilities.md) doesn't change: a `native` row would need a
`KindEmitSpec`, or `provider-kind-coverage` fails, and this route has no emitter.

Separately from the route, `build --target copilot` now writes the same `.github/agents/<name>.agent.md`
files as `add`, with 0 byte differences from a full `add`. It no longer writes `.github/AGENTS.md`, a
195 KB aggregate that dropped the tool limits.

## Routes not taken

**Route B, a Copilot emitter,** would build from `COPILOT_EMIT_SPECS`, which gives the lexicon,
`.agent.md` and the `platforms` filter for free. Of 127 Markdown files in `dist/claude/plugins` on
2026-10-30, 47 contain `$ARGUMENTS`, 52 `CLAUDE.md` and 4 `.claude/`, which `add` translates and a Claude-format plugin
can't. Anyone reopening it starts with a spike on three questions:

1. **Format.** GitHub recommends Agent Plugins 1.0 for new plugins, but that standard makes only skills
   and MCP portable; agents and hooks sit under the client-specific `com.github.copilot` namespace. The
   alternative is the legacy Copilot format, which carries them directly.
2. **Where it's published.** Copilot checks `.github/plugin/marketplace.json` before
   `.claude-plugin/marketplace.json`, so one `marketplace` branch might serve both clients, each pointing
   at its own plugin tree. A shared plugin tree is out: Claude would load `agents/x.agent.md` beside
   `agents/x.md`.
3. **Declaring it.** `plugin` rows in `capabilities.ts`, plugin specs in `spec/`, and how packs and the
   generated `hook-*` and `mcp-*` plugins map.

**Route C, a no-go,** would have said plainly that the Claude marketplace isn't supported on Copilot.

## Scope and open questions

Other tools (Codex, Cursor, Gemini) were out of scope, and so were rules as plugin content, which the
ADR matrix marks as undocumented for Copilot.

Read 2026-10-30:

- [About Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins) lists custom
  agents, skills, hooks, MCP and LSP configs, and extensions, on VS Code, Copilot CLI, the Copilot app
  and the cloud (repository settings).
- The [CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference) puts
  `.claude-plugin/` last in the lookup order for both `marketplace.json` and `plugin.json`, so a Copilot
  manifest added later would win. VS Code names a Claude format and warns that support for a format
  doesn't guarantee every component works
  ([reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)).

Still open: whether the cloud agent installs plugins from a repo marketplace (the docs say "through
repository settings"; not tested), and whether Copilot's skill discovery has a description-length
budget like Claude's (the docs read don't say).
