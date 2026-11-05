# OpenCode: install Sigil skills, agents, commands and MCP servers

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

`sigil add --target opencode` writes skills to `.agents/skills/`, agents to `.opencode/agents/` and commands to
`.opencode/commands/`, the folders OpenCode reads. It merges MCP servers into `.opencode/opencode.json`.
`sigil build --target opencode` writes the skills, agents and commands to `dist/opencode/`, plus a root `AGENTS.md` with the
repo-wide rules. MCP servers come only through `add`.

## Install

```bash
sigil add --target opencode <selector>
```

- **Skills** go to `.agents/skills/<name>/SKILL.md`, each with its rules inlined. They are the same files Codex gets. OpenCode
  lists them with no settings and picks one by its description.
- **Agents** go to `.opencode/agents/<name>.md` as subagents, so a primary agent can hand work to them. Each file's
  `permission` block is the agent's tool list: everything else is denied.
- **Commands** go to `.opencode/commands/<id>.md`, with `/` in the id written as `-`: `shared/author-artifact` is the command
  `shared-author-artifact`.

## MCP servers

```bash
sigil add --target opencode shared/filesystem                # .opencode/opencode.json
sigil add --target opencode shared/filesystem --scope user   # ~/.config/opencode/opencode.json
```

A server merges into the `mcp` map of `.opencode/opencode.json` (project scope, the default, git-committed) or
`opencode.json` under `$XDG_CONFIG_HOME/opencode`, by default `~/.config/opencode/` (user scope, all projects), next to what you
already have ([MCP servers](https://opencode.ai/docs/mcp-servers/)). The first write to a user file that holds your own settings
takes one `opencode.json.sigil.bak`. `--scope local` is refused: OpenCode has no personal per-project config file. Servers load
in the next session.

- **Only a primary agent uses these servers.** A catalog agent's allow-list denies MCP tools (below).
- **Sigil never opens a `.jsonc` file.** It leaves your `opencode.jsonc` alone, in the project root and next to the user
  `opencode.json`, and OpenCode loads both files. A key set in both goes to the `.jsonc`, so a server you already define there
  keeps your version.
- **Sigil refuses comments in a `.json` file.** OpenCode accepts them, but Sigil can't keep them when it writes. `add` stops with
  a message and leaves the file as it is, and `update` skips the file. Remove the comments, or move your settings to a `.jsonc`.
- **`{env:NAME}` has two traps.** A server that reads a variable gets a `{env:NAME}` reference in the file, and `add` prints these
  warnings. OpenCode reads the value when it starts. An unset variable becomes an empty string with no error, and a value
  holding a double quote stops OpenCode from loading the file. Export the variable first, and don't write a secret into the
  file instead: `.opencode/opencode.json` is usually committed.
- **`shared/ado` needs your organization at install.** `add` asks for it, or takes `--var ADO_ORG=<org>`, and writes it into the
  file as plain text, not as a `{env:NAME}` reference
  ([install values](../reference/config-kinds.md#install-variables)). All four catalog servers install.

OpenCode 1 also changes files itself when it starts: it adds `$schema` to `opencode.json` files, which Sigil ignores when it
checks for drift, and it writes a `.gitignore` into `.opencode/`.

## What an agent can and can't do

- **Its allow-list also denies MCP tools and the `skill` tool.** The list holds only the tools the agent names, so a catalog
  agent doesn't reach the servers above, or your own, and doesn't load skills. On OpenCode 2 this was tested for `skill`: the
  call fails with `Permission denied: skill`, and adding `skill: allow` to the same agent makes it work. For MCP tools it comes
  from reading OpenCode's source, and wasn't tested.
- **It carries no model.** It uses the model of the agent that called it.
- **Restrictions work on both versions.** A tool outside the list isn't offered to the model, with `skill` the one exception
  seen: OpenCode 2 lets the model try it, then denies the call. On OpenCode 2 this was tested
  with one of Sigil's own agents and with hand-written files of the same shape. Both versions load the rules in the same order:
  `*` deny first, then an allow for each listed tool, with `read` asking on `.env` files.

## What it skips

`add` lists each skipped artifact with its reason.

| Kind or artifact      | Why                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| `shared/explain-diff` | It takes two arguments, and OpenCode can't carry a real diff in the first one (below)   |
| Rules                 | They reach OpenCode inside the skills that use them, and through `AGENTS.md` on a build |
| Hooks                 | They would be generated code on a plugin API that OpenCode 2 doesn't run                |
| Settings              | The kind's fields are Claude Code's own                                                 |
| Workflows             | OpenCode has no workflow file                                                           |

**Why `explain-diff` is skipped.** OpenCode splits a command's arguments on spaces and quotes, so only the last one can hold
several words. An argument holding both `'` and `"` doesn't arrive whole, and nothing reports it. Most real diffs hold both,
so the model would get part of the diff, with the rest as the audience. This was the same on OpenCode 1 and 2. A prompt with
one argument gets every word, but its quotes and line breaks may not survive.

## One owner for `.agents/skills/`

`opencode`, `agents-standard`, `codex` and `antigravity` write skills to the same paths, so a project uses one of them for
skills. `add` refuses a second owner. If you already installed skills for one of the others, keep them: they reach OpenCode
as they are. `add --target opencode` refuses a whole selection that holds a skill, so to add agents and commands next to
them, name those directly or pass `--kind agent,prompt`.

Copilot and Cursor read `.agents/skills/` too. `sigil status` prints a note if a skill is installed both for one of them and
for `opencode`.

## Repo-wide rules

`add` doesn't write `AGENTS.md`. To get one, build it and copy it to the project root:

```bash
sigil build --target opencode --out-dir <dir>
cp <dir>/opencode/AGENTS.md .
```

This copy has no manifest, so `sigil status` and `sigil update` don't see it. Repeat the steps to refresh it. If your
project has its own `AGENTS.md`, merge the two by hand: the `cp` above overwrites it.

Antigravity and Cursor also read a root `AGENTS.md`. If a project has Sigil rules for either of them, this copy loads
each rule twice there.

## With Claude output

OpenCode also reads `.claude/skills/` and `CLAUDE.md`. It doesn't read `.claude/agents/`, so an agent installed for `claude`
doesn't reach it. In a project that has Sigil output for `claude`:

- **A skill in both `.agents/skills/` and `.claude/skills/` gives one entry with one body.** On OpenCode 1 which body isn't
  fixed. On OpenCode 2 the `.agents/skills/` body won in all three test runs, as its docs say. The two can differ: the
  `.agents/skills/` copy has its rules inlined. When a skill is installed for both `claude` and `opencode`, `add` and `sigil status` print a note:
  `OpenCode also reads Claude Code's skills and shows one copy of each, and which one depends on its version`. Keep one of
  the two installs. There is no note when another target, such as `codex`, owns `.agents/skills/`.
- **On OpenCode 1, a skill marked for the user only in Claude is offered to the model.** OpenCode 1 ignores that mark, so a
  prompt meant to run only on your command can run on the model's choice. OpenCode 2 honors it for the model's own choice: in
  one test run, the model didn't pick a marked skill from its description. The mark doesn't block the `skill` tool, though: a
  model told the skill's name still loaded it.
- **A `CLAUDE.md` is read when there is no `AGENTS.md`.**

The same goes for your user folder, with one difference. OpenCode reads `~/.claude/skills/`, and it reads
`~/.claude/CLAUDE.md` when there is no `~/.config/opencode/AGENTS.md`. So what you keep there reaches every project, even
one with its own `AGENTS.md`.

To turn this off, set these variables before you start `opencode`. There is no config key for them.

| Variable                                | Effect                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` | Hides the skills in `.claude/skills/`                   |
| `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` | Stops the `CLAUDE.md` fallback, project and user folder |

## No `.env` guard

**A catalog agent can read your `.env`.** All 39 list `shell`, so they can run `cat .env`, and no hook stands behind it: Sigil
installs none on OpenCode, so nothing from Sigil protects your `.env`.

Each agent keeps OpenCode's own rule that asks before a `read` of `.env`, but that rule covers only the `read` tool, and it has
two more gaps on both versions:

- **`grep` returns `.env` lines.** A plain search skips a gitignored `.env`, but a search aimed at the file returns it.
- **`opencode run --auto` approves the ask,** so a `read` of `.env` returns its values. This was tested on OpenCode 2.

To narrow the gap, remove the `bash` and `grep` lines from the agent's `permission` block, or set your own rules. See OpenCode's
[Permissions](https://opencode.ai/docs/permissions/) page for what you can set. That page says these reads are denied by
default; in testing OpenCode asked.

## What was tested

On 2026-11-04, Sigil's own output from `add` and a full `build`, in throwaway repos, on OpenCode 1.19.4 (`opencode-ai`) and
OpenCode 2 (`@opencode/cli` 2.2.5), on Linux. Both listed all 45 skills and all 39 agents as subagents, with the rules in the
order given above, and both loaded the command. A one-argument command substituted `$1` on both, from a test prompt, because no
catalog prompt that ships takes an argument.

The same day, MCP servers installed by `add` connected on both versions, and a test server received the variable's value, or an
empty string when it was unset. On OpenCode 1, a value holding a double quote stopped the file from loading, and a user-scope
server and a root `.jsonc` server both loaded. No model is involved, so to run these checks yourself, after `npm run build`:

```bash
npm run probe:opencode                        # OpenCode 1, from PATH
npm run probe:opencode -- --v2 <path>         # also OpenCode 2, from an @opencode/cli binary
```

No model answered in those runs. With a model, on OpenCode 1.19.4 (`opencode/deepseek-v4.1-flash-free`, 2026-11-03) and
OpenCode 2 (`deepseek/deepseek-flash` on the paid API, 2026-11-04):

- An agent can't use a tool outside its list. On OpenCode 2 a write and a shell command were tested with a control agent
  that could do both.
- The `.env` behavior above.
- Skills are picked by description.

On OpenCode 2 a root `AGENTS.md` loads and a `CLAUDE.md` alone doesn't, and a V1 plugin in `.opencode/plugins/` is skipped with
no message, so a guard copied from OpenCode 1 blocks nothing there. Results:
[opencode-target-2026-11](../decisions/opencode-target-2026-11.md#probe-log), P1, P2, P4, P7, the V2 run, the quoting run, the
Sigil output run, the Sigil MCP run and the Phase F run.
