# Agent Skills CLI: install Sigil skills with `npx skills`

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

Each Sigil release publishes its skills, rendered in the open Agent Skills format, to the `skills` branch of this
repository. The [`skills` CLI](https://github.com/vercel-labs/skills) installs them into any agent it supports, with no
clone and no `sigil` install. The branch exists from the first release that ships it; before that, the commands below
find nothing.

## Install a skill

```bash
npx skills add https://github.com/makubexD/sigil/tree/skills --skill ts-generate-tests
```

- `--list` shows every skill on the branch without installing anything.
- `--skill` takes several names: `--skill ts-generate-tests --skill py-generate-tests`.
- `-a <agent>` picks the agent: `-a claude-code` writes `.claude/skills/<name>/`, `-a codex` writes
  `.agents/skills/<name>/`. The CLI lists the other agents it knows.
- `-g` installs for your user instead of the project. `-y` skips the prompts.
- `--copy` writes real files instead of symlinks.

The CLI also writes a `skills-lock.json` at the project root, to record what it installed.

## What a skill carries

Each skill is the same file `sigil build --target agents-standard` writes, `references/` folder included. The rules a
skill follows are inlined into it, so it works on its own.

The branch holds skills only. Agents, hooks, MCP servers, settings and the repo-wide `AGENTS.md` need `sigil add`
([consuming.md](../guides/consuming.md)).

## Updates and removal

`npx skills` keeps no Sigil manifest, so `sigil status`, `sigil update` and `sigil uninstall` don't see these installs.
Update and remove them with the `skills` CLI's own commands.

Don't install the same skill with both `npx skills` and `sigil add` in one project: both write to the same folders.

## Pin a release

Every publish is also tagged `skills-v<version>`. To stay on one release, use the tag in place of the branch:

```bash
npx skills add https://github.com/makubexD/sigil/tree/skills-v<version> --skill ts-generate-tests
```

## Don't use the bare repository form

**Always use the `…/tree/skills` URL. Don't run `npx skills add makubexD/sigil`.** That form reads the default branch,
which holds Sigil's catalog source, not rendered skills. The CLI finds the source `SKILL.md` files and installs them as
they are, with unexpanded `{sigil:…}` placeholders and without their rules. Measured with `skills@1.7.6`: 46 skills
listed, and an installed one carried raw placeholders ([probes](../decisions/distribution-channels-2026-09.md#phase-3-probes-2026-11-03)).
