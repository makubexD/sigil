# Cursor: install Sigil rules and skills

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

`sigil add --target cursor` writes rules to `.cursor/rules/` as `.mdc` files and skills to `.cursor/skills/`, the folders
Cursor reads. `sigil build --target cursor` writes the same files to `dist/cursor/`.

## Install rules and skills

```bash
sigil add --target cursor <rule-skill-or-pack>
```

Each rule becomes one `.mdc` file in one of two modes:

- **Always applied.** A rule for every file (no `appliesTo`, or only `**` / `**/*`) gets `alwaysApply: true` and loads in
  every chat.
- **Scoped.** Any other rule gets its globs, comma-joined, and `alwaysApply: false`, for example
  `globs: "**/*.ts,**/*.tsx"`. Cursor attaches it once the agent reads a matching file. Naming the file in your prompt
  isn't enough: in testing, a scoped rule attached only after the read.

Both modes carry the rule's `description`. A rule scoped to one language still gets its globs, not `alwaysApply`.

Each skill carries its rules inside it, so installing a skill doesn't also write those rules as `.mdc` files.

## Hooks

```bash
sigil add shared/protect-config --target cursor              # .cursor/hooks.json
sigil add shared/protect-config --target cursor --scope user # ~/.cursor/hooks.json
```

A project hook goes in `.cursor/hooks.json`, which you commit with the repo. A user hook goes in
`~/.cursor/hooks.json` and applies to every project; sigil saves a one-time `.sigil.bak` copy before its
first write to a file that holds content it did not write. Cursor has no personal per-project hook file, so
`--scope local` is refused.

Hooks are written in Cursor's own format (`version: 1`, camelCase events). Sigil translates a catalog hook's
Claude Code event through Cursor's alias table: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`,
`SubagentStop`, `SessionStart`, `SessionEnd` and `PreCompact` become `preToolUse`, `postToolUse`,
`beforeSubmitPrompt`, `stop`, `subagentStop`, `sessionStart`, `sessionEnd` and `preCompact`. `SubagentStart`
becomes `subagentStart` only without a matcher (absent or `*`), because Cursor matches a subagent against its
own type, not a Claude agent name.

Matchers are translated by exact tool name:

| Claude Code                                     | Cursor    |
| ----------------------------------------------- | --------- |
| `Bash`                                          | `Shell`   |
| `Write`, `Edit`, `MultiEdit`, `NotebookEdit`    | `Write`   |
| `Read`, `Grep`, `Task`, `WebFetch`, `WebSearch` | unchanged |

An edit fires a `Read` call and then a `Write` call in Cursor, so an edit matcher becomes `Write`: the hook
sees every edit and no plain read. A `|` list is translated part by part and deduplicated. A matcher that is
absent or `*` writes no matcher, so the hook runs on every call of its event.

Sigil skips a hook it cannot render, with the reason, and installs the rest. That covers `Notification`,
`PermissionRequest` and any other event Cursor has no alias for; a matcher on an event other than
`PreToolUse` or `PostToolUse`; a matcher that is not an exact tool name, such as `Glob`, `Edit.*` or
`^Bash$`; and a command with a single quote in one of its words, which PowerShell would break on Windows
(a `node -e` script is exempt: sigil writes it in a form PowerShell runs). `sigil add` and the wizard list each skipped hook and its reason. For
catalog authors, `sigil sync --check` fails when a catalog hook ships to Cursor but cannot render there, so
the fix is to add `platforms:` without `cursor` or to change the event or matcher.

Cursor runs a project hook only in a trusted workspace. A hook that exits 2 denies the call; any other exit,
including a hook that cannot start, lets the call through. Empty stdout on exit 0 is allowed, so sigil writes
the command as it is and adds no `{"permission":"allow"}` wrapper.

`sigil add` warns when a hook's bare command is not on this machine's PATH, and still writes the file,
because the project may run on another machine:

```
⚠  hook shared/protect-config: 'node' is not on PATH here, and a hook that can't start lets every call through
```

Claude Code hooks in `.claude/settings.json` did not run in the Cursor CLI in testing, although Cursor's
third-party hooks page lists them: a matcher-less hook never ran, with a relative or an absolute command. Install
the hook for `cursor` instead. The desktop app was not tested.

## MCP servers

```bash
sigil add shared/filesystem --target cursor              # .cursor/mcp.json
sigil add shared/filesystem --target cursor --scope user # ~/.cursor/mcp.json
```

A project server goes in `.cursor/mcp.json`, which you commit with the repo. A user server goes in
`~/.cursor/mcp.json` and applies to every project; as with hooks, sigil saves a one-time `.sigil.bak` copy before its
first write to a file that holds content it did not write. `--scope local` is refused, because Cursor has no personal
per-project MCP file. Sigil merges its servers into the `mcpServers` map and leaves your own servers and keys in place.

A local server is written with `type: "stdio"` first, then the catalog's `command`, `args` and `env`. A remote server
gets its `url` and `headers` with no `type` key. A catalog `{sigil:env:NAME}` reference becomes `${env:NAME}`, which
Cursor expands in `command`, `args`, `env`, `url` and `headers`. An
[install value](../reference/config-kinds.md#install-variables) is written as plain text, such as the organization here:

```json
{
  "mcpServers": {
    "ado": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "--allow-scripts=keytar",
        "@azure-devops/mcp@2.10.0",
        "contoso",
        "--authentication",
        "azcli",
        "-d",
        "core",
        "work",
        "work-items"
      ]
    }
  }
}
```

Cursor loads a new project server only after you approve it:

```bash
agent mcp list              # shows "not loaded (needs approval)"
agent mcp enable filesystem # approve it once
```

In print mode (`agent -p`), `--approve-mcps` approves every server for that run, and the agent also needs `--force` to
call a tool.

Cursor does not read Claude Code's `.mcp.json`. In testing, a server in `.mcp.json` alone gave `No MCP servers
configured`, so a server installed for `claude` doesn't reach Cursor. Install it for `cursor` as well; the two files
stay independent, and uninstalling from one target leaves the other's file untouched.

## Agents

An agent is written to `.cursor/agents/<name>.md` with its `name`, `description` and, for a read-only agent,
`readonly: true`. A Cursor subagent has no tool list, so that one line is all of the agent's `tools` Cursor gets.
`model` is left out, so the subagent uses the model of the chat that calls it.

In testing, a `readonly: true` subagent runs in Ask mode: it can read and search files, but writing a file and running
shell commands are both refused, even read-only ones like `ls`. So the mapping is never exact, and `add` prints a warning
for each agent that says which way it went: `(read-only, so the agent loses those tools)` or `(no read-only flag, so the
agent gets every tool this target has)`.

- **Reviewers and auditors lose the shell.** They list `read`, `search` and `shell`, and are written with
  `readonly: true`, so on Cursor they can't run `git diff` or the tests. They review what they can read.
- **Debuggers and refactor specialists gain every tool.** They list `edit`, so no `readonly` line is written, and
  Cursor gives them all of its tools, including web and subagent calls their tool list doesn't name.

Cursor also reads `.claude/agents/`. When the same agent is installed for both `cursor` and `claude`, Cursor uses its
own copy in `.cursor/agents/`, and `sigil add` and `sigil status` print a note naming the agent.

## What is skipped

These kinds are skipped with a warning, and the reason is in [capabilities.md](../reference/capabilities.md):

- **Prompts.** Cursor is folding commands into skills.
- **Workflows and settings.** Cursor has no workflow file, and `settings` is Claude Code's own vocabulary.

## What Cursor already reads from Claude Code

Cursor also reads skills from other tools' folders: `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, and the
plugins installed in Claude Code. A sigil Claude plugin installed at user or project scope reaches Cursor with its skills,
the rules inlined in them included, and its agents. So you don't need to install those skills again.

Two things don't come across:

- **Hooks.** A plugin's hooks did not fire in Cursor: a `protect-config` hook from the Claude plugin let the agent write
  `.env`. Install hooks with `sigil add --target cursor` (see [Hooks](#hooks)).
- **An agent's tool list.** Cursor ignores a Claude agent's `tools:` line, so a sigil reviewer from the Claude plugin can
  edit files in Cursor. Install agents with `sigil add --target cursor`, which writes `readonly: true` for a read-only
  agent (see [Agents](#agents)).

Each of these was one run, with Cursor CLI `2026.10.22-27dcf5f`
([Phase F probes](../decisions/cursor-target-2026-11.md#phase-f-probes)).

When the same skill is installed both for `cursor` and for `claude`, `agents-standard` or `codex`, Cursor uses its own
copy in `.cursor/skills/` and lists the skill once. The other copy goes unused in Cursor, though the other tool still
reads it. `sigil add` and `sigil status` print a note naming those skills; it's a note, not an error. Two different
skills with the same name in two `~/.claude/skills/` folders were both listed, so this isn't a general dedupe by name.

## No `AGENTS.md`

Unlike `agents-standard` and `codex`, `build --target cursor` doesn't write a root `AGENTS.md`. Every repo-wide rule is
already an `alwaysApply: true` `.mdc` file, and Cursor also reads a root `AGENTS.md`, so writing both would load each
rule twice.

## What was tested

Cursor Agent CLI `2026.10.22-27dcf5f` on Linux, in print mode with a real model, in throwaway repos with hand-written
fixture files: `alwaysApply` rules load, scoped rules attach after a read (quoted, unquoted and comma-joined globs),
skills are picked from their description, Cursor's own skill copy wins over `.claude/` and `.agents/`, an edit fires a
`Read` call and then a `Write` call, exit 2 denies a call, empty stdout on exit 0 lets it through, and
`.claude/settings.json` hooks did not run. That doesn't prove the desktop app, Windows, an untrusted workspace, or
sigil's own output in a live session, which a later check covers. Results:
[cursor-target-2026-11](../decisions/cursor-target-2026-11.md).
