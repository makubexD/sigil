<p align="center">
  <img src="docs/assets/sigil-logo.svg" width="280" alt="Sigil — one source, every assistant">
</p>

<p align="center">
  <strong>Write AI coding instructions once. Compile to Claude Code, GitHub Copilot, and more.</strong>
</p>

---

> **Status:** v0.1, early. The catalog covers C#, TypeScript, Angular, Python, and React. Sigil is
> **not on npm yet**, so you build it from source (below). Two targets exist today: Claude Code and
> GitHub Copilot.

## Why

Every AI tool has its own format for coding instructions. Today you re-type the same
"how to write a good unit test" guidance for Claude, then again for Copilot, in each tool's
own syntax. When guidance changes, it drifts.

**Sigil** solves this with a **canonical-source → compiler** approach:

- Author skills, agents, and rules **once** in plain Markdown with YAML frontmatter.
- Express DRY reuse through `extends:` (rules inherit rules) and `uses:` (skills reference rules/agents by ID).
- A build step compiles the resolved catalog to each platform's native layout.
- Adding a language = one new folder. Adding a new AI platform = one new adapter.

## Prerequisites

- Node.js **20.19 or newer**, and npm
- git

## Install

```bash
git clone https://github.com/makubexD/sigil.git
cd sigil
npm install
npm run build
npm link            # puts a global `sigil` command on your PATH
```

Details, alternatives to `npm link` (such as `npm run sigil -- <command>`), and heap-size notes:
[Build and link](docs/guides/operations.md#build-and-link). Once Sigil is published, `npx sigil` and
`npm install -g sigil` will work without a clone.

## Quick start

These commands assume `sigil` is on your PATH (the `npm link` step above). Run them from the root of
the project you want to equip, not from the sigil clone:

```bash
sigil add                                      # guided wizard: pick target, kinds, artifacts
sigil list --kind skill                        # browse first (also: sigil search <query>)
sigil add skill:typescript/ts-generate-tests   # or install one artifact plus what it depends on
sigil add pack:typescript-starter              # or a curated bundle
```

Files land in your project (`.claude/` or `.github/`) and are tracked in `.sigil/manifest.json`, so
`sigil status`, `update`, and `uninstall` know what Sigil wrote. Packs are defined in
[`packs.yaml`](packs.yaml); `sigil list` shows what is available.

> **Only pay for what you load.** A skill or agent costs only its short description until it is
> used; a rule loads its full text whenever a matching file is read. Pick individual artifacts
> rather than whole packs for a lean context. Plugins cannot carry loose rules or settings (rules
> ride inlined inside skills), so `sigil add` is the only way to install those.

## Who are you?

| You want to...                                                  | Start here                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Just use Sigil in my project (including the interactive wizard) | [docs/guides/consuming.md](docs/guides/consuming.md)                                                |
| Use Sigil as a Claude Code plugin                               | [Plugin section of consuming.md](docs/guides/consuming.md#install-a-pack-as-a-claude-plugin)        |
| Use it with GitHub Copilot                                      | [Copilot section of consuming.md](docs/guides/consuming.md#add-a-skill-to-a-github-copilot-project) |
| Publish my own catalog or marketplace                           | [docs/guides/publishing.md](docs/guides/publishing.md)                                              |
| Suggest or write a new skill, rule, or agent                    | [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/guides/authoring.md](docs/guides/authoring.md)         |
| Contribute code to Sigil itself                                 | [CONTRIBUTING.md § Contributing code](CONTRIBUTING.md#b-contributing-code)                          |
| See what works today and what is planned                        | [Support matrix](docs/index.md#support-matrix)                                                      |

## Claude Code, Copilot, and other tools

- **Claude Code** (recommended): `sigil add` writes `.claude/skills|agents|rules/` and merges
  hooks, settings, and MCP config. A plugin marketplace can also be built locally with
  `sigil build --target claude`; a published marketplace is planned. See
  [consuming.md](docs/guides/consuming.md).
- **GitHub Copilot**: `sigil add --target copilot` writes `.github/` skills, agents, instructions,
  prompts, and MCP config. Commit those files; Copilot's cloud agent reads repository files. There is
  no plugin channel, and no hooks or settings. See [consuming.md](docs/guides/consuming.md) and
  [capabilities](docs/reference/capabilities.md).
- **Other tools**: only the `claude` and `copilot` targets exist. Codex and Cursor targets are planned
  ([Codex](docs/ideas/codex-target.md), [Cursor](docs/ideas/cursor-target.md)). Skills follow the open
  [Agent Skills](https://agentskills.io/specification) format, and some agents read `.claude/skills/`
  or `.github/skills/` directly, so scaffolding with `--target claude` or `--target copilot` may work
  for them.

## What is in the catalog

Run `sigil list` (or `sigil search <query>`) to browse. The catalog has skills, agents, rules,
prompts, and config kinds (MCP, hooks, settings) for `csharp`, `typescript`, `angular`, `python`,
and `react`, plus `shared` artifacts that apply to every stack. Curated bundles are the packs in
[`packs.yaml`](packs.yaml). Artifact kinds and fields: [docs/reference/spec.md](docs/reference/spec.md).

## Library usage

Sigil is primarily a CLI, but `config-merge`'s pure JSON-merge primitives — the machinery behind
`mcp`/`hook`/`settings` install, drift detection, and repair — are also published as a small,
curated library surface for programmatic use (e.g. a tool that wants to detect or repair drift in
a sigil-managed config file without shelling out to the CLI):

```ts
import { applyMerge, classifyConfigDrift, detectConfigDrift } from 'sigil';
```

Everything else — the pipeline stages, target adapters, wizard, commands — is intentionally not
exported; only `.` and `./package.json` resolve via the package name (`package.json`'s `exports`
map). See `src/index.ts` for the full exported surface and `CLAUDE.md`'s "public library surface"
invariant for why it stays curated rather than exposing all of `dist-cli/`.

## Learn more

Start at [docs/index.md](docs/index.md): a map by audience, a glossary, and the support matrix.
Also [CHANGELOG.md](CHANGELOG.md) for version history and [CLAUDE.md](CLAUDE.md) for the invariants
code contributors must keep.

## License

MIT — Copyright (c) 2026 makudev1719
