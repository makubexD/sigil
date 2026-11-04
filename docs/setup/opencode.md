# OpenCode: use Sigil skills and rules

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

There is no `opencode` target yet. OpenCode already reads what the `agents-standard` target writes, so skills and
repo-wide rules reach it today. Agents, prompts, MCP servers, hooks and settings don't.

## What reaches OpenCode

```bash
sigil add --target agents-standard <selector>
```

This writes `.agents/skills/`, each skill with its rules inlined. OpenCode lists these skills with no settings and picks
one by its description.

Skills installed for `codex` or `antigravity` are the same files, so they already reach OpenCode. `add` refuses a second
owner for these files: keep the install you have.

## Repo-wide rules

`add` doesn't write `AGENTS.md`. To get one, build it and copy it to the project root:

```bash
sigil build --target agents-standard --out-dir <dir>
cp <dir>/agents-standard/AGENTS.md .
```

This copy has no manifest, so `sigil status` and `sigil update` don't see it. Repeat the steps to refresh it. If your
project has its own `AGENTS.md`, merge the two by hand: the `cp` above overwrites it.

Antigravity and Cursor also read a root `AGENTS.md`. If a project has Sigil rules for either of them, this copy loads
each rule twice there.

## What doesn't reach it

Agents, prompts, MCP servers, hooks and settings. `agents-standard` skips each of them with the reason, and OpenCode
doesn't read `.claude/agents/`, so an agent installed for `claude` doesn't reach it either.

## With Claude output

OpenCode also reads `.claude/skills/` and `CLAUDE.md`. In a project that has Sigil output for `claude`:

- **A skill in both `.agents/skills/` and `.claude/skills/` gives one entry with one body**, and which body isn't fixed.
  The two can differ: the `.agents/skills/` copy has its rules inlined.
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

Sigil installs no hook on OpenCode, so nothing from Sigil protects your `.env`. OpenCode's own default asks before a
`read` of `.env`, but that rule doesn't cover the shell: `cat .env` is a different tool. See OpenCode's
[Permissions](https://opencode.ai/docs/permissions/) page for what you can set. That page says these reads are denied by
default; in testing OpenCode asked.

## What was tested

OpenCode 1.19.4 (`opencode-ai`) on Linux, with one free model (`opencode/deepseek-v4.1-flash-free`), in throwaway repos,
on 2026-11-03. Not tested on OpenCode 2, so nothing here is known to hold there. Results:
[opencode-target-2026-11](../decisions/opencode-target-2026-11.md#probe-log), P1, P2, P4 and P7. The commands and
both variables on this page were then run as written, in project and user folders, and matched it.
