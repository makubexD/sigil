# OpenCode: install Sigil skills, agents and commands

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

`sigil add --target opencode` writes skills to `.agents/skills/`, agents to `.opencode/agents/` and commands to
`.opencode/commands/`, the folders OpenCode reads. `sigil build --target opencode` writes the same files to `dist/opencode/`,
plus a root `AGENTS.md` with the repo-wide rules.

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

## What an agent can and can't do

- **Its allow-list also denies MCP tools and the `skill` tool.** The list holds only the tools the agent names, so a catalog
  agent doesn't reach your MCP servers or load skills.
- **It carries no model.** It uses the model of the agent that called it.
- **Restrictions are proven on OpenCode 1 only, not yet on OpenCode 2.** OpenCode 2 loads the same rules in the same order,
  but nothing has been seen enforcing them there.

## What it skips

`add` lists each skipped artifact with its reason.

| Kind or artifact      | Why                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| `shared/explain-diff` | It takes two arguments, and OpenCode can't carry a real diff in the first one (below)   |
| Rules                 | They reach OpenCode inside the skills that use them, and through `AGENTS.md` on a build |
| MCP servers           | Not yet                                                                                 |
| Hooks                 | They would be generated code on a plugin API that OpenCode 2 doesn't run                |
| Settings              | The kind's fields are Claude Code's own                                                 |
| Workflows             | OpenCode has no workflow file                                                           |

**Why `explain-diff` is skipped.** OpenCode splits a command's arguments on spaces and quotes, so only the last one can hold
free text. An argument holding both `'` and `"` doesn't arrive whole, and nothing reports it. Most real diffs hold both, so
the model would get part of the diff, with the rest as the audience. This was the same on OpenCode 1 and 2. A prompt with one
argument isn't affected.

## One owner for `.agents/skills/`

`opencode`, `agents-standard`, `codex` and `antigravity` write the same skill files, so a project uses one of them for skills.
`add` refuses a second owner. If you already installed skills for one of the others, keep them: they reach OpenCode as they
are, and `add --target opencode` still installs agents and commands next to them.

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

- **A skill in both `.agents/skills/` and `.claude/skills/` gives one entry with one body**, and which body isn't fixed.
  The two can differ: the `.agents/skills/` copy has its rules inlined. `add` and `sigil status` print a note for this:
  `OpenCode also reads Claude Code's skills and shows one copy of each, and which one isn't fixed`. Keep one of the two
  installs.
- **A skill marked for the user only in Claude is offered to the model.** OpenCode ignores that mark, so a prompt meant to
  run only on your command can run on the model's choice.
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

**A catalog agent can run `cat .env`.** All 39 list `shell`, and no hook stands behind it: Sigil installs none on OpenCode, so
nothing from Sigil protects your `.env`.

Each agent keeps OpenCode's own rule that asks before a `read` of `.env`, but that rule covers only the `read` tool. To close
the gap, remove the `bash` line from the agent's `permission` block, or set your own rules. See OpenCode's
[Permissions](https://opencode.ai/docs/permissions/) page for what you can set. That page says these reads are denied by
default; in testing OpenCode asked.

## What was tested

On 2026-11-04, Sigil's own output from `add` and a full `build`, in throwaway repos, on OpenCode 1.19.4 (`opencode-ai`) and
OpenCode 2 (`@opencode/cli` 2.2.5), on Linux. Both listed all 45 skills and all 39 agents as subagents, with the rules in the
order above, and both loaded the command. A one-argument command substituted `$1` on both, from a test prompt, because no
catalog prompt that ships takes an argument.

No model answered in that run, so these rest on earlier tests with hand-written files, on OpenCode 1.19.4 with one free model
(`opencode/deepseek-v4.1-flash-free`), on 2026-11-03:

- An agent can't use a tool outside its list.
- The `.env` behavior above.
- Skills are picked by description.

On OpenCode 2 only loading was tested, with no model. Its guide says it reads `AGENTS.md` only, with no `CLAUDE.md` fallback,
which wasn't tested. Results: [opencode-target-2026-11](../decisions/opencode-target-2026-11.md#probe-log), P1, P2, P4, P7, the
V2 run, the quoting run and the Sigil output run.
