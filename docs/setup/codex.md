# OpenAI Codex: install Sigil skills

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

`sigil add --target codex` writes skills to `.agents/skills/`, where Codex reads them. A full `sigil build --target codex`
also writes a root `AGENTS.md` with the repo-wide rules.

## Install skills

```bash
sigil add --target codex <skill-or-pack>
```

Each skill carries its rules inside it. `add` doesn't write `AGENTS.md`, because that file usually belongs to you.

Agents and prompts are skipped, with a warning:

- **Agents.** A Codex agent file can't restrict an agent's tools, so every catalog agent would gain tools it isn't meant
  to have. See [the decision](../decisions/codex-target-2026-10.md#agents).
- **Prompts.** Codex [deprecated custom prompts](https://learn.chatgpt.com/docs/custom-prompts) in favor of skills.

`agents-standard` writes the same files as `codex`, so installing a skill for both is safe, and removing one install
keeps the file for the other.

## Trust the project

Codex treats an explicitly untrusted project differently per file type. Skills in `.agents/skills/` still load, but
`AGENTS.md` and everything under `.codex/` don't, with no error. Trust the project when Codex asks.

## Keep the listing short

Codex lists each skill's name, description and path at session start, within 2% of the context window, or 8,000 characters
when the window is unknown. Past that it [shortens descriptions](https://learn.chatgpt.com/docs/build-skills), then omits
skills with a warning. A project's own selection fits. All 45 skills together may not, so install what the project uses.

## What was tested

Codex CLI 0.166.0 on Linux, against a local mock model. That proves what Codex loads and sends. It doesn't prove that a
real model picks a skill from its description. Results:
[codex-target-2026-10](../decisions/codex-target-2026-10.md).
