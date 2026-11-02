# Antigravity: install rules and skills

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

```bash
sigil add --target antigravity <rule-skill-or-pack>
```

This page covers what the `antigravity` target writes, what it skips and why, and what was tested.

## What the target writes

- **Skills** go to `.agents/skills/<name>/SKILL.md`, in the Agent Skills layout, with the rules each skill uses
  inlined. Antigravity lists a skill from that folder and picks it from its description, with no settings
  ([Skills](https://antigravity.google/docs/skills#cli-skill-locations); [ADR](../decisions/antigravity-target-2026-11.md)
  P2, A1).
- **Repo-wide rules** go to `.agents/rules/<id>.md` with `trigger: always_on`, so they are in every session
  ([Rules](https://antigravity.google/docs/rules#where-rules-are-stored); ADR P1, and the B1 control run).
- **Scoped rules are skipped**, with the reason. A rule whose `appliesTo` is narrower than every file would be a
  `trigger: glob` file, and on `agy` 1.4.12 a glob rule never reached the model: not after a read of a matching file,
  not after an edit of it, and not in a later turn of the same conversation (ADR B1). The rule still reaches
  Antigravity inside the skills that use it, since each skill carries its rules inlined. `sigil add` lists the
  skipped rule and its reason. The same goes for a repo-wide rule you narrow with a `scope` in `.sigil/overlays.yaml`:
  narrowed, it is a scoped rule. If it is already installed, `sigil update` refuses to rewrite it and leaves the
  `always_on` file as it was, so remove the overlay or `sigil uninstall` the rule.

`sigil build --target antigravity` writes the same files and **no `AGENTS.md`**. Antigravity also loads a root
`AGENTS.md`, so a repo-wide rule written both there and in `.agents/rules/` would load twice. If you used the
`agents-standard` route before (below), don't also keep its built `AGENTS.md` copy: remove the sections that are now
`.agents/rules/` files.

**One owner for `.agents/skills/`.** `codex`, `agents-standard` and `antigravity` write the same skill files, so install
skills for one of them: `sigil add` refuses the second. GitHub Copilot and Cursor also read `.agents/skills/`.
`sigil add` and `sigil status` say so when a skill is installed for one of them too: Copilot shows it twice, and
Cursor uses its own copy.

## MCP servers

```bash
sigil add --target antigravity shared/filesystem                # .agents/mcp_config.json
sigil add --target antigravity shared/filesystem --scope user   # ~/.gemini/config/mcp_config.json
```

A server merges into the `mcpServers` map of `.agents/mcp_config.json` (project scope, the default, git-committed)
or `~/.gemini/config/mcp_config.json` (user scope, all projects), next to the servers you already have
([MCP](https://antigravity.google/docs/mcp#mcp-configuration-structure)). The first write to a user file that holds
your own servers takes one `~/.gemini/config/mcp_config.json.sigil.bak`. Nothing else in `~/.gemini/` is touched.
`--scope local` is refused: Antigravity has no personal per-project MCP file. Antigravity doesn't read `.mcp.json`
(ADR C1), so a server installed for `claude` or `copilot` doesn't reach it.

**Don't install one server at both scopes.** Neither file overrides the other: when both name the same server,
whichever one is already running keeps the name
([Settings](https://antigravity.google/docs/settings#other-configuration-files)), so which copy you get depends on
what started first.

**Environment variables.** These files expand no environment references: a server given `${NAME}` gets the literal
text. A server does inherit `agy`'s environment (ADR P5, C1). So an `env` entry that only passes a variable through
under its own name is dropped, since the server sees that variable anyway: export it before you start `agy`. Any
other use of a variable, such as one in `args` or a `Bearer` token in `headers`, can't be written, and `sigil add`
skips that server with the reason.

**Approval.** An MCP tool with no permission rule runs in Ask mode, and in print mode an Ask is denied. To allow a
server's tools, add a rule such as `mcp(filesystem/*)` (`mcp(<server>/<tool>)` for one tool, `mcp(*)` for all)
([MCP](https://antigravity.google/docs/mcp#mcp-permissions-and-access-control)):

```bash
agy -p "<prompt>" --settings '{"permissions":{"allow":["mcp(filesystem/*)"]}}'
```

## Agents

```bash
sigil add --target antigravity typescript/ts-code-reviewer   # .agents/agents/ts-code-reviewer.md
agy --agent ts-code-reviewer -p "Review src/app.ts"
```

An agent goes to `.agents/agents/<name>.md` with `name`, `description`, `tools` and, when the catalog agent sets a
model hint, `model` ([Custom subagents](https://antigravity.google/docs/subagents#custom-subagents)). Start a session
as the agent with `agy --agent <name>`; the main agent can also hand it a task through its `invoke_subagent` tool.
`agy agents` printed nothing in testing, even with agents present, so check an install with `agy --agent <name>`
(ADR D1).

**Tools.** The catalog writes neutral tool names, and the target turns each into Antigravity's own:

| Catalog  | Antigravity `tools`                       |
| -------- | ----------------------------------------- |
| `read`   | `view_file`                               |
| `search` | `grep_search`, `find_by_name`, `list_dir` |
| `edit`   | `write_to_file`, `replace_file_content`   |
| `shell`  | `run_command`                             |
| `web`    | `search_web`, `read_url_content`          |
| `agent`  | `invoke_subagent`                         |
| `todo`   | none                                      |

Only names a probe saw load and work are written, because a misspelt name "may cause the subagent process to hang"
(a known issue on the subagents page). The docs' `multi_replace_file_content` never reached an agent, so it is left
out (ADR D1). An agent that lists `todo` is skipped with the reason, or written without it and a warning under
`toolPolicy: nearest`; the same goes for `disallowedTools`, since Antigravity has no denylist. No catalog agent uses
either.

**An agent with no `tools` gets the full list above.** In Antigravity an absent `tools` means no tools at all: a
subagent given only read tools could not write a file (ADR U3, D1 run 9). On every other target an absent list means
every tool, so sigil writes the whole list to keep that meaning. Browser, image and MCP tools are not in the catalog's
vocabulary and are never written. A reviewer that lists `read`, `search` and `shell` gets no edit tool, but
`run_command` can still change files.

**Model.** The catalog's `model` hint becomes a tier: `fast` → `flash_lite`, `balanced` → `flash`, `deep` → `pro`
([Build plugins](https://antigravity.google/docs/build-plugins#subagents) lists `flash_lite`). No hint writes no
`model` line, so the agent inherits the session's model. A `claude:` model override applies to Claude only. Antigravity
drops an agent whose `model` is not a tier, with no warning, so sigil never writes anything else.

**Shell commands.** sigil writes no `commandExecutionPolicy`, so the documented default, `sandbox`, applies to
`run_command`. In testing `agy 1.4.12` reported a run as "unsandboxed" anyway (ADR D1, run 6), so don't rely on the
sandbox to contain an agent's commands.

**Approval in print mode.** An agent's writes and shell commands go through the same approvals as the main agent's
([Approvals in print mode](#approvals-in-print-mode)). In testing, workspace writes were allowed and shell commands
and URL reads were denied until an allow rule named the permission, not the tool: `command(*)`, `read_url(*)`
(`run_command(*)` was still denied). A catalog reviewer starts with `git status`, so without `command(*)` its first
call is denied and the run ends with no output (ADR D2):

```bash
agy --agent ts-code-reviewer -p "<prompt>" --settings '{"permissions":{"allow":["command(*)"]}}'
```

Agents go to project scope only. Antigravity writes no shared agent folder with another target, so an agent installed
for `cursor` or `claude` as well is a separate copy.

## What doesn't reach it

- **Hooks.** Not built yet; they are a later phase of the [roadmap](../plan-antigravity-target.md#phases).
  `sigil add` skips them with that reason.
- **Prompts and workflows.** Antigravity has no prompt files: workflows stopped working, and a skill is the slash
  command ([Migrating workflows to skills](https://antigravity.google/docs/migration/workflows-to-skills)).
- **Anything written for Claude Code.** Antigravity doesn't read `CLAUDE.md` or `.claude/` (ADR P6), so
  `--target claude` installs don't come across.
- **Sigil's Claude plugins, through `agy plugin import`.** Don't run `agy plugin import claude`: it imports every
  Claude plugin you have. Importing sigil's plugins one by one doesn't work either: the skills were listed but never
  reached a session, the agent was skipped, and the hook loads but can't fire, because its tool names and input are
  Claude Code's (ADR U7).

## Without the target

Before this target, the route was `sigil add --target agents-standard` for skills (the same files) and a copy of the
`AGENTS.md` that `sigil build --target agents-standard` writes, for repo-wide rules (ADR A1). It still works, but
`--target antigravity` replaces both, and the manifest tracks its rule files where it never tracked a copied
`AGENTS.md`. Don't combine the two: the copied `AGENTS.md` and the `.agents/rules/` files would load each rule twice.

## Approvals in print mode

`agy -p` can't ask you to approve a tool call, so a call that needs approval is denied and the run goes on. The docs
say workspace file reads and writes are allowed and shell commands and MCP tools need an allow rule
([Headless mode](https://antigravity.google/docs/cli/headless#permissions-in-headless-mode)), but in one test a file
write was denied too (ADR U7, run 11). To allow a tool for one run:

```bash
agy -p "<prompt>" --settings '{"permissions":{"allow":["write_file(*)"]}}'
```

Put the same `permissions.allow` list in `~/.gemini/antigravity-cli/settings.json` to keep it. That file is
user-wide; there is no documented project settings file, and the CLI rewrites it at start but keeps `permissions`
([Settings](https://antigravity.google/docs/settings#setting-up-preferences)).

## Limits

Each rule file is cut off at 24,000 bytes, and `sigil sync --check` fails a rule that would pass it. All always-on and
global rules share a 20,000-token budget; past it, the largest are replaced by a pointer with their path and
description ([Rules](https://antigravity.google/docs/rules#size-limits-and-token-budgets)). The budget covers every
always-on rule at once, so no single file check can enforce it: install only the repo-wide rules you want.

## What was tested

Antigravity CLI `agy 1.4.12` on Linux, in print mode (`agy -p`) on `gemini-3.8-flash-low`, signed in with a Google
account, in throwaway repos. The Antigravity desktop app, Windows and macOS were not checked. Results:
[antigravity-target-2026-11](../decisions/antigravity-target-2026-11.md#probe-log).

- **P1, P2, A1:** `AGENTS.md`, an `always_on` rule and a `.agents/skills/` skill each returned their codeword.
- **B1:** a `trigger: glob` rule with `globs: "src/**/*.ts"` returned `NONE` after a read of `src/app.ts`, after an
  `edit_file` of it, and in a `--continue` turn after each. The same file with `trigger: always_on` returned its
  codeword. This is why scoped rules are skipped.
- **P5, C1:** a stdio server in `.agents/mcp_config.json`, with or without `type: "stdio"`, and a local HTTP server
  given as `url` (with or without `type: "http"`) or `serverUrl`, were each loaded and called. `${NAME}` reached the
  server as literal text, and a variable exported to `agy` reached it with no `env` entry. A server only in
  `.mcp.json` was not loaded.
- **U3, D1:** in a project agent each `tools` name in the table above loaded and was called;
  `multi_replace_file_content` never did. An agent with only `view_file` and `grep_search` refused to write a file.
  `model: flash_lite` and `model: pro` loaded; a made-up tier dropped the agent.
