# GitHub Copilot: install Sigil packs as plugins

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

Copilot reads Sigil's Claude Code plugin marketplace, so you can install skills, agents and prompts
without cloning Sigil or installing its CLI. Sigil builds no separate Copilot plugin. Hooks and MCP
servers don't work this way on Copilot: install those with `sigil add`, as described
[below](#hooks-and-mcp-through-sigil-add).

## Add the marketplace

On Copilot CLI:

```bash
copilot plugin marketplace add makubexD/sigil#marketplace
```

The `#marketplace` is required: bare `makubexD/sigil` fails. The marketplace is named `sigil`.

In VS Code, set `chat.plugins.enabled`, add `"makubexD/sigil#marketplace"` to
`chat.plugins.marketplaces`, and install from **Customize**. That marketplace install wasn't tested:
the VS Code runs loaded plugins from a local clone.

## Install a pack

```bash
copilot plugin install typescript-tooling@sigil
```

There is no scope flag. A CLI plugin installs per user, so it loads in every project.

Names carry the plugin as a prefix. The skill is `/typescript-tooling:ts-generate-tests`, and the agent
is `typescript-tooling:ts-security-auditor`. `copilot plugin marketplace browse sigil` lists all 21
plugins.

## Don't install these on Copilot

Sigil's plugins use Claude's hook and MCP forms, and Copilot handles those differently. Nothing stops
the install, because a marketplace can't filter by client.

| Plugin                     | What happens on Copilot                                       | What to do instead     |
| -------------------------- | ------------------------------------------------------------- | ---------------------- |
| `hook-protect-config`      | `.env` is not blocked, and on the CLI `edit` is denied        | Use `sigil add`        |
| `hook-reviewer-bash-guard` | Every shell command is denied                                 | No Copilot replacement |
| `hook-worker-mode-guard`   | Not run, but it has the same `command` + `args` form          | No Copilot replacement |
| `mcp-filesystem`           | Its root is the plugin folder, so it can't reach your project | Use `sigil add`        |
| `deepseek-worker`          | Needs Claude Code, and depends on `hook-worker-mode-guard`    | Skip it                |

## Hooks and MCP through `sigil add`

`sigil` isn't on npm yet, so [install it from a clone](../../README.md#install) first. Then, from your
project's root:

```bash
sigil add hook:shared/protect-config mcp:shared/filesystem --target copilot --yes
```

This writes `.github/hooks/sigil.json` and `.mcp.json`. On Copilot CLI, both load only from a trusted
folder. The MCP route ran on Copilot CLI and wasn't run in VS Code.

`mcp-ado`, `mcp-context-mode` and `mcp-maku-jam` weren't tested as plugins, so use `sigil add` for
those too.

## Limits

- A read-only agent has no edit tool but keeps its shell. `reviewer-bash-guard` never reaches Copilot
  (`sigil add` skips it), so nothing blocks a write through the shell.
- An MCP write skips `protect-config`: `filesystem-write_file` doesn't match `Edit|Write`.
- `$ARGUMENTS` is filled when you run a skill by slash command, and stays literal if the model loads
  the skill itself.
- `/essentials:explain-diff` doesn't fill `$diff` or `$audience`.
- Skill text is rendered for Claude, so it can name `CLAUDE.md` or `.claude/`. `sigil add` translates
  these; a plugin can't.

## Copies of the same artifact

A project or personal skill or agent with the same name silently beats the plugin, and `sigil status`
doesn't see plugins. For MCP, don't define one server name twice.

## Update and remove

Update and pinning weren't run. The commands are from Copilot's
[CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference).

```bash
copilot plugin marketplace update sigil
copilot plugin update typescript-tooling@sigil   # or --all
```

```bash
copilot plugin uninstall typescript-tooling@sigil
copilot plugin marketplace remove sigil
```

To stay on one release, add its tag instead: `makubexD/sigil#marketplace-v<version>`.

## What was tested

Copilot CLI 1.0.105 and VS Code 1.143.1, on 2026-10-30, with five plugins of 21. Results and causes are
in the [decision record](../decisions/copilot-plugin-channel-2026-10.md).

Not tested: the Copilot app, the cloud agent, `dependencies`, Windows, and MCP servers that need
environment values. For the cloud agent, commit the files `sigil add` writes.
