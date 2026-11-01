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

## What is skipped

These kinds are skipped with a warning, and the reason is in [capabilities.md](../reference/capabilities.md):

- **Agents**, until a later phase. A Cursor subagent has no tool list, so a read-only catalog agent needs
  `readonly: true`, which isn't built yet.
- **Prompts.** Cursor is folding commands into skills.
- **Hooks and MCP servers**, until later phases. Install them for another target meanwhile.
- **Workflows and settings.** Cursor has no workflow file, and `settings` is Claude Code's own vocabulary.

## Skills Cursor already reads

Cursor also reads skills from other tools' folders: `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, and the
skills of the plugins installed in Claude Code. So if you use sigil's Claude plugin, its skills already reach Cursor,
and you don't need to install them again.

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
skills are picked from their description, and Cursor's own skill copy wins over `.claude/` and `.agents/`. That doesn't
prove the desktop app, Windows, or sigil's own `.mdc` output in a live session, which a later check covers. Results:
[cursor-target-2026-11](../decisions/cursor-target-2026-11.md).
