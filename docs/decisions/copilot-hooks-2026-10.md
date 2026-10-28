# Copilot hook target (2026-10)

Status: shipped in #102 (2026-10-28); the owner's live check in Copilot CLI is still open (see
[Probe](#probe-before-building)). Phase 1 of `docs/plan-audit-rows-15-18.md` (audit row 17). The brief it started from
was deleted once this record covered it.

## What the docs say

Checked 2026-10-28 against
[Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration),
[Use hooks (cloud agent)](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), and
[VS Code agent hooks (Preview)](https://code.visualstudio.com/docs/copilot/customization/hooks).

- **Files.** Copilot CLI loads hooks from, in order: policy (`/etc/github-copilot/policy.d/*.json`), user
  (`~/.copilot/hooks/*.json`, or `$COPILOT_HOME/hooks/`), repository (`.github/hooks/*.json` at the repo root), inline
  `hooks` in `.github/copilot/settings.json` / `.github/copilot/settings.local.json`, and plugins. All sources run
  together; a repository hook does not replace a user hook for the same event. VS Code reads the same set. The cloud
  agent reads `.github/hooks/*.json` **only from the default branch** and never loads `settings.json`.
- **Cross-tool.** Copilot CLI and VS Code also read the repository's `.claude/settings.json` and
  `.claude/settings.local.json`. `~/.claude/settings.json` is not listed.
- **Schema.** `{ "version": 1, "hooks": { "<event>": [ entry, … ] } }`. An entry is flat:
  `{ "type": "command", "matcher"?, "bash"? , "powershell"?, "command"?, "exec"?, "args"?, "cwd"?, "env"?, "timeoutSec"? }`.
  `exec` + `args` runs without a shell and must not be combined with `bash` / `powershell` / `command`. **`exec` and
  `args` are Copilot CLI only**; the cloud agent honors `bash`, then `command` as a fallback.
- **Event names pick the payload.** camelCase (`preToolUse`) gets `toolName` / `toolArgs` and regex matchers against
  Copilot's runtime tool names (`edit`, `create`, `bash`, …). PascalCase (`PreToolUse`) is the documented
  compatibility alias "as used in Claude Code plugins": snake_case payload (`tool_name`, `tool_input`), `tool_name`
  reported as the Claude name (`Write`, `Edit`, `Bash`, `Read`), and Claude's matcher semantics (`*`, `Edit|Write`).
  PascalCase aliases are documented for `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`,
  `SessionStart`.
- **Blocking.** For `preToolUse`, exit 2 denies, stdout JSON `permissionDecision: "deny"` denies, and **any other
  non-zero exit or a crash also denies** ("fail-closed"). Timeouts are fail-open. Claude Code only blocks on exit 2.

## Decision

1. **Go: the Copilot target emits `hook` natively** for the Copilot CLI and VS Code. Without it a Copilot-only project
   gets no guard, user scope has no path at all (`~/.claude/` is not read), and the cloud agent never reads
   `.claude/settings.json`.
2. **Source of truth: keep `event` as authored, no neutral vocabulary.** The roadmap recommended a provider-neutral
   `event` mapped per target. The docs make that layer empty: Copilot adopted Claude's PascalCase names as its own
   alias, with Claude's payload field names and matcher semantics. The Copilot spec maps each `HOOK_EVENTS` value to
   its PascalCase alias (identity for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`). `Stop`,
   `SubagentStop` and `Notification` have no documented PascalCase alias (Copilot has `agentStop`, `subagentStop`,
   `notification`, with camelCase payloads): rendering one for Copilot is refused, the same way `renderArtifact`
   refuses a `tools` list a spec can't carry, until a probe shows the alias works. `KIND_REGISTRY` drops
   `ownedBy: ['claude']` for `hook` only; `settings` stays Claude-owned.
3. **Destinations**, merged with the existing config-kind machinery (`replaceMerge` / `previousOpFor`,
   `array-append` on `hooks.<Event>`, `ensureHomeBackup` / `isHomeScopedRoot` for the home file):

   | Scope   | File                                  | Read by                           |
   | ------- | ------------------------------------- | --------------------------------- |
   | project | `.github/hooks/sigil.json`            | CLI, VS Code, cloud agent¹        |
   | local   | `.github/copilot/settings.local.json` | CLI, VS Code (inline `hooks` key) |
   | user    | `~/.copilot/hooks/sigil.json` (home)  | CLI, VS Code                      |

   ¹ Only from the default branch, and only for shell-form hooks (see below). `$COPILOT_HOME` is not honored in v1;
   the user path is fixed to `~/.copilot`, stated in `docs/reference/config-kinds.md`.

4. **Entry shape.** Exec form (`args` set) → `{ type, matcher, exec: command, args, timeoutSec: timeout }`. Shell form
   → `{ type, matcher, command, timeoutSec }` (the cross-platform field). `version: 1` is written once at the file
   root when sigil creates the file, and never removed by `uninstall` while other hooks remain.

## Consequences and limits

- **Fail-closed is a behavior change for catalog hooks.** On Copilot, a hook that cannot start (no `node` on PATH, a
  broken `NODE_OPTIONS`) denies every matched tool call, where Claude Code lets it through. `shared/protect-config`'s
  "Not covered" section must say so per provider.
- **The cloud agent will not run exec-form hooks.** `shared/protect-config` is exec form on purpose (Windows exit-code
  fidelity), so it protects the CLI and VS Code, not the cloud agent. A shell-form variant for the cloud agent is out
  of scope.
- **Double run with both targets installed.** A project with `shared/protect-config` in `.claude/settings.json` and
  in `.github/hooks/sigil.json` runs it twice under Copilot CLI. Both deny the same calls, so the result is the
  same; it costs one extra process start. Documented, not deduplicated.
- **VS Code hooks are Preview.** Supported, not promised.

## Probe before building

The docs say neither payload format "guarantees the same tool arguments". `shared/protect-config` reads
`tool_input.file_path` and **lets the call through** when that is not a string, so if Copilot's `create` / `edit`
pass the path as `path`, the installed guard would silently do nothing. The owner checks this in Copilot CLI
(not installed on the spike machine) before the emitter step:

1. Put a logging hook in `.github/hooks/probe.json`:
   `{"version":1,"hooks":{"PreToolUse":[{"type":"command","matcher":"Edit|Write","exec":"node","args":["-e","process.stdin.pipe(require('fs').createWriteStream('probe.log',{flags:'a'}))"]}]}}`
2. Ask Copilot to create a file and to edit one. Read `probe.log`: the `tool_input` keys for both calls.
3. If the key is not `file_path`, the step plan's first step makes `protect-config` read
   `tool_input.file_path ?? tool_input.path` (harmless for Claude) and adds a test for both shapes.

The live check that stays at the end of Phase 1 is unchanged: `shared/protect-config` installed with
`sigil add --target copilot` blocks a `.env` write in Copilot CLI.
