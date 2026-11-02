# Antigravity: use Sigil rules and skills today

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

Sigil has no `antigravity` target yet. Antigravity already reads two files that sigil writes for other tools: the
skills folder `.agents/skills/` and a root `AGENTS.md`. This page says how to use them now, and what doesn't come
across.

## What reaches Antigravity today

```bash
sigil add --target agents-standard <skill-or-pack>   # .agents/skills/<name>/, rules inlined
sigil build --target agents-standard                 # dist/agents-standard/AGENTS.md, repo-wide rules
cp dist/agents-standard/AGENTS.md ./AGENTS.md
```

- **Skills.** `sigil add --target agents-standard` writes each skill to `.agents/skills/<name>/SKILL.md`, with the rules
  it uses inlined. Antigravity lists a skill from that folder and picks it from its description, with no settings
  ([Agent skills](https://antigravity.google/docs/skills#cli-skill-locations);
  [ADR](../decisions/antigravity-target-2026-11.md) P2, A1).
- **Repo-wide rules.** `sigil add` writes no `AGENTS.md`: a rule reaches this target only inside the skills that use
  it. The root `AGENTS.md` with every repo-wide rule comes from `sigil build`; copy it to your repo root. Antigravity
  loads a root `AGENTS.md` into every session, with no settings
  ([Rules](https://antigravity.google/docs/rules#where-rules-are-stored); ADR P1, A1).

`--target codex` writes the same `.agents/skills/` files and the same kind of `AGENTS.md`, so it works too. The two
targets share that folder, so install skills for one of them, not both: `sigil add` refuses the second.

Each was checked with sigil's own output, not hand-written files: a skill from `sigil add` and the `AGENTS.md` from
`sigil build`, each with a codeword the model had to return (ADR A1).

## What doesn't reach it

- **Anything written for Claude Code.** Antigravity doesn't read `CLAUDE.md` or `.claude/` (ADR P6), so
  `--target claude` installs don't come across.
- **Scoped rules as their own files.** A rule with a narrower `appliesTo` only arrives inlined in the skills that use
  it.
- **Sigil's Claude plugins, through `agy plugin import`.** Don't run `agy plugin import claude`: it imports every
  Claude plugin you have. Importing sigil's plugins one by one doesn't work either: the skills were listed but never
  reached a session, the agent was skipped, and the hook is never loaded (ADR U7).
- **Agents, MCP servers and hooks.** `agents-standard` doesn't write them; the target will (below).

## Approvals in print mode

`agy -p` can't ask you to approve a tool call, so a call that needs approval is denied and the run goes on. The docs
say workspace file reads and writes are allowed and shell commands and MCP tools need an allow rule
([Headless mode](https://antigravity.google/docs/cli/headless#permissions-in-headless-mode)), but in one test a file
write was denied too (ADR U7, run 11). To allow a tool for one run:

```bash
agy -p "<prompt>" --settings '{"permissions":{"allow":["write_file(*)"]}}'
```

Put the same `permissions.allow` list in `settings.json` to keep it
([Settings](https://antigravity.google/docs/settings#setting-up-preferences)).

## Limits

Each rule file is cut off at 24,000 bytes, and all always-on and global rules share a 20,000-token budget.
Past it, the largest are replaced by a pointer with their path and description
([Rules](https://antigravity.google/docs/rules#size-limits-and-token-budgets)). Keep `AGENTS.md` lean: install the packs
you use, not the whole catalog.

## What the target will add

An `antigravity` target will write skills and rules on its own (rules in `.agents/rules/`, scoped ones once a probe
shows they attach), MCP servers in `.agents/mcp_config.json`, agents in `.agents/agents/`, hooks once sigil has a
neutral hook contract, and a plugin. The phases and their gates are in the
[roadmap](../plan-antigravity-target.md#phases).

## What was tested

Antigravity CLI `agy 1.4.12` on Linux, in print mode (`agy -p`) on `gemini-3.8-flash-low`, signed in with a Google
account, in throwaway repos. The Antigravity desktop app, Windows and macOS were not checked. Results:
[antigravity-target-2026-11](../decisions/antigravity-target-2026-11.md#probe-log).
