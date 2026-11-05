# OpenAI Codex: install Sigil skills

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

`sigil add --target codex` writes skills to `.agents/skills/`, where Codex reads them, and merges hooks into
`.codex/hooks.json` and MCP servers into `.codex/config.toml`. A full `sigil build --target codex` also writes a root `AGENTS.md` with the repo-wide rules.

## Install skills

```bash
sigil add --target codex <skill-or-pack>
```

Each skill carries its rules inside it. `add` doesn't write `AGENTS.md`, because that file usually belongs to you.

Agents and prompts are skipped, with a warning:

- **Agents.** A Codex agent file can't restrict an agent's tools, so every catalog agent would gain tools it isn't meant
  to have. See [the decision](../decisions/codex-target-2026-10.md#agents).
- **Prompts.** Codex [deprecated custom prompts](https://learn.chatgpt.com/docs/custom-prompts) in favor of skills.

`agents-standard` writes the same files as `codex`, so a project uses one of them for skills. `add` refuses the second
one; to switch, remove its skills with `sigil uninstall <ids> --target agents-standard` first.

## Trust the project

Codex treats an explicitly untrusted project differently per file type. Skills in `.agents/skills/` still load, but
`AGENTS.md` and everything under `.codex/` don't, with no error. Trust the project when Codex asks.

## Install hooks, then review them

```bash
sigil add shared/protect-config --target codex            # .codex/hooks.json
sigil add shared/protect-config --target codex --scope user  # $CODEX_HOME/hooks.json
```

**A hook does nothing until you review it.** Codex skips a new or changed hook with no error, so after installing, open
`/hooks` in Codex and trust it. In `codex exec`, an unreviewed hook let a `.env` write through in testing, with exit 0.
For automation that already vets its hooks, `--dangerously-bypass-hook-trust` runs them for one invocation.

Codex has no personal per-project hook file, so `--scope local` is refused.

On Codex a hook script is stored base64-encoded, so that one command works in the shell Codex uses: your login shell on
macOS and Linux, and `cmd.exe` on Windows. If your login shell is PowerShell, the hook can't block, because PowerShell turns
exit code 2 into 1. `/hooks` therefore shows an encoded string. To read it, see the hook's source in `catalog/shared/hooks/`.

Treat hooks as a guardrail. Codex says so itself, and any exit code other than 2 lets the call through, so a hook that
can't start protects nothing. The Windows form of the command is untested.

## Install MCP servers

```bash
sigil add shared/filesystem --target codex              # .codex/config.toml
sigil add shared/filesystem --target codex --scope user # $CODEX_HOME/config.toml
```

Sigil edits only its own `[mcp_servers.<name>]` tables, and your comments and other settings stay as they are. If a
server is written another way, such as an inline `mcp_servers = { … }`, sigil refuses, writes nothing and exits non-zero.
A table you wrote with the same name as a catalog server is replaced, as in JSON config files; a user-scope file is backed
up first. If you edit an installed server, uninstalling leaves the whole server in place and warns that it's now yours,
because a partial table stops Codex from starting.

Project config loads only in a trusted project, and `--scope local` is refused.

Codex doesn't expand `${NAME}` in MCP config. A catalog variable reaches a server only by name, through `env_vars`, so
export it before starting Codex. `shared/ado` takes its organization as an
[install value](../reference/config-kinds.md#install-variables), written as plain text, so it does install on Codex:
`sigil add mcp:shared/ado --target codex --var ADO_ORG=<org>`.

## Plugins

Sigil's Claude marketplace also loads in Codex, with no project files:

```bash
codex plugin marketplace add makubexD/sigil --ref marketplace
codex plugin add typescript-tooling@sigil
```

Skills and MCP servers arrive. Agents don't, and skill bodies keep Claude's wording, such as `CLAUDE.md`.

**Don't install the `hook-*` plugins on Codex.** Codex drops their arguments, so the hook fails and the call goes through:
`hook-protect-config` didn't stop a `.env` write in testing. Use `sigil add` for hooks.

## Keep the listing short

Codex lists each skill's name, description and path at session start, within 2% of the context window, or 8,000 characters
when the window is unknown. Past that it [shortens descriptions](https://learn.chatgpt.com/docs/build-skills), then omits
skills with a warning. A project's own selection fits. All 45 skills together may not, so install what the project uses.

## What was tested

Codex CLI 0.166.0 on Linux, against a local mock model. That proves what Codex loads and sends. On 2026-11-04 a real model,
DeepSeek's `deepseek-flash` as a custom provider, picked a skill from its description in both runs, and without the skill it
answered that it didn't know. No OpenAI model was tested. Results:
[codex-target-2026-10](../decisions/codex-target-2026-10.md).
