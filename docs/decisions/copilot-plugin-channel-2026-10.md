# Copilot plugin channel: does the Claude-format marketplace work? (2026-10)

Status: tested 2026-10-30; the owner chose the narrowed Route A the same day. Phase 1 of
`docs/plan-copilot-plugin-channel.md`, and ADR Phase 4 of
[distribution-channels-2026-09](distribution-channels-2026-09.md).

## How it was run

The main session ran it unattended, on the owner's instruction, against the published marketplace
(`marketplace-v0.3.0`, `5cfefad`).

- **Copilot CLI 1.0.105:** `copilot -p` and a pseudo-terminal for slash commands, in a throwaway
  `COPILOT_HOME`. Auto mode picked `gpt-6-luna`.
- **VS Code 1.143.1:** `code chat` in a separate profile. Its sessions ran on the Copilot CLI runtime
  (`provider: copilotcli`), so agreement between the two surfaces is less independent than it looks.
  Plugins were registered from a local clone with `chat.pluginLocations`.

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

## What held up, against the plan's concerns

The `.md` agent extension, Claude's tool names (mapped to `view`, `rg`, `glob`, `bash`), the nested hook
shape, PascalCase events and the `.claude-plugin/` manifests all work. `#ref` works on the CLI although
its help doesn't show it. Plugin names are namespaced, so documentation must use the prefixed forms.

## Decision

**Route A, narrowed: rely on the Claude format for skills, agents and prompts, and add no emitter.**
These pass on both surfaces, and an emitter's main remaining benefit, the two degraded rows, affects one
skill. Copilot users keep `sigil add` for hooks and MCP. It writes `exec`; its MCP path was not part of
this test.

The gate in the plan says any unsafe result points to Route B; the owner accepted this as an exception.
The cost: nothing stops a Copilot user installing a `hook-*` plugin, and the marketplace can't
filter by client, so the limit is documentation only. An untested alternative is a single-string
shell-form `command`, which might run on both clients without a separate format.
