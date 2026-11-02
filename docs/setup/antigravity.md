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

## What doesn't reach it

- **Agents, MCP servers and hooks.** Not built yet; they are later phases of the
  [roadmap](../plan-antigravity-target.md#phases). `sigil add` skips them with that reason.
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
