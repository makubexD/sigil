# Sigil — Documentation

> **New here?** Start with the [README](../README.md) for the pitch and install steps, then pick
> your path below.

## Use Sigil (install artifacts into a project)

| Doc                                                          | Covers                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [guides/consuming.md](guides/consuming.md)                   | Wizard, `add`, `list`, `init`, status/update/uninstall, plugins                    |
| [setup/claude-code.md](setup/claude-code.md)                 | Install packs as Claude Code plugins from the published marketplace                |
| [setup/copilot.md](setup/copilot.md)                         | Install packs on GitHub Copilot from the same marketplace, and what not to install |
| [setup/codex.md](setup/codex.md)                             | Install skills on OpenAI Codex, and the trust and listing limits                   |
| [setup/cursor.md](setup/cursor.md)                           | Install rules and skills on Cursor, and the skills Cursor already reads            |
| [setup/antigravity.md](setup/antigravity.md)                 | Install Sigil rules and skills for Antigravity                                     |
| [setup/opencode.md](setup/opencode.md)                       | Install skills, agents and commands on OpenCode, and the `.env` limit              |
| [setup/skills-cli.md](setup/skills-cli.md)                   | Install single skills into any agent with `npx skills`, from the `skills` branch   |
| [reference/troubleshooting.md](reference/troubleshooting.md) | Common errors and FAQ                                                              |
| [reference/capabilities.md](reference/capabilities.md)       | Which kinds each target delivers, per channel (generated)                          |
| [reference/artifacts.md](reference/artifacts.md)             | Every installable artifact: packs, tools, install command (generated)              |
| [reference/config-kinds.md](reference/config-kinds.md)       | How `mcp` / `hook` / `settings` merge into your JSON files                         |

## Author artifacts (catalog authors)

| Doc                                          | Covers                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| [guides/authoring.md](guides/authoring.md)   | Adding or changing a skill, rule, agent, or language; `get/search/patch/move/import` |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)     | Authoring rules, PR process, what reviewers check                                    |
| [guides/publishing.md](guides/publishing.md) | Publishing your own catalog or Claude marketplace                                    |
| [reference/spec.md](reference/spec.md)       | Artifact kinds, frontmatter schema, platform mapping, CLI reference                  |

## Contribute code

| Doc                                                    | Covers                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)               | Contributing code: setup, checks, PR process                                |
| [../CLAUDE.md](../CLAUDE.md)                           | Purpose, commands, hard rules, pointers (full rules in `.claude/rules/`)    |
| [reference/architecture.md](reference/architecture.md) | Extension model, emit specs, templates, lexicon, conformance                |
| [guides/operations.md](guides/operations.md)           | Build and link, targets, CI gate (`npm run ci:local` mirrors CI), `release` |
| [../CHANGELOG.md](../CHANGELOG.md)                     | Version history                                                             |

## Where a code topic lives

Moved from the root `CLAUDE.md`. Paths are from the repository root.

| Topic                                                                           | Doc                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| CLI command reference, platform/frontmatter mapping, trust scanner              | `docs/reference/spec.md`                                |
| Per-command CLI flags (generated from `sigil <cmd> --help`)                     | `docs/reference/cli-flags.md`                           |
| Extension model, emit specs, templates, lexicon, conformance engine             | `docs/reference/architecture.md`                        |
| Which kinds each target delivers per channel (generated from `capabilities.ts`) | `docs/reference/capabilities.md`                        |
| `mcp` / `hook` / `settings` config-kind merge model + scope tables              | `docs/reference/config-kinds.md`                        |
| Adding a skill, rule, or language; `sigil get/search/patch/move/import`         | `docs/guides/authoring.md`                              |
| Wizard step registry, home menu, guided verbs, install-state legend             | `src/wizard/CLAUDE.md` (auto-loads under `src/wizard/`) |
| Installing artifacts into a consumer project; manifest/status/update/uninstall  | `docs/guides/consuming.md`                              |
| Build targets, CI gate, `sigil release`                                         | `docs/guides/operations.md`                             |
| Common errors, FAQ                                                              | `docs/reference/troubleshooting.md`                     |
| Full doc map + command cheat-sheet                                              | `docs/index.md`                                         |

## Project history and backlog (not user docs)

- [decisions/](decisions/README.md): point-in-time decision logs and retrospectives.
- [audits/](audits/): measurement logs and campaign notes.
- [ideas/](ideas/): the gap backlog; one short brief per planned or missing capability.

The guides and reference describe the system as it stands; history and ideas do not.

## Support matrix

| Scenario                             | Status      | Details                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 Guided menu and wizards           | Supported   | `sigil` with no command opens a guided menu in a terminal; `add`, `init`, `uninstall`, `update`, `prune`, `new`, `edit` are guided too. Outside a terminal everything is flag-driven. The `add` wizard has no keyword search yet; the menu's Search entry does. [Guide](guides/consuming.md#using-the-guided-menu)                                                                                            |
| S2 Claude plugin marketplace         | Supported   | Each release pushes the marketplace to the `marketplace` branch: `/plugin marketplace add makubexD/sigil#marketplace` ([setup](setup/claude-code.md)). A local build (`sigil build --target claude` → `dist/claude`) also works.                                                                                                                                                                              |
| S3 Publish your own marketplace/fork | Partial     | `--catalog-dir` and `--packs` work, and the manifest records the catalog each artifact came from; a `marketplace:` block in `packs.yaml` sets the marketplace name, owner, and author. [Guide](guides/publishing.md)                                                                                                                                                                                          |
| S4 GitHub Copilot                    | Supported   | Instructions, skills, agents, prompts, MCP and hooks through `add`. Skills, agents and prompts also load from the Claude marketplace ([setup](setup/copilot.md)). No settings. [Capabilities](reference/capabilities.md), [plugin route](decisions/copilot-plugin-channel-2026-10.md), [hooks](decisions/copilot-hooks-2026-10.md)                                                                            |
| S4b OpenAI Codex                     | Supported   | Skills, hooks and MCP through `add`, plus `AGENTS.md` on `build`. Skills also load from the Claude marketplace. No agents or prompts. [Setup](setup/codex.md), [probes](decisions/codex-target-2026-10.md)                                                                                                                                                                                                    |
| S5 npm distribution                  | Planned     | Not published; build from source. [Brief](ideas/npm-first-publish.md)                                                                                                                                                                                                                                                                                                                                         |
| S6 Suggest an artifact without code  | Supported   | Fill in the [issue form](https://github.com/makubexD/sigil/issues/new?template=propose-artifact.yml), or run the `sigil new` wizard from a clone. `sigil import` reads Claude and Copilot layouts. [Guide](guides/authoring.md#import-an-existing-portable-template-directory)                                                                                                                                |
| S4c Cursor                           | Partial     | Rules (`.mdc`) and skills through `add` and `build`, no `AGENTS.md`. Cursor also reads Claude Code's skills and installed plugins. Hooks, MCP and agents are planned. [Setup](setup/cursor.md), [probes](decisions/cursor-target-2026-11.md)                                                                                                                                                                  |
| S4d Antigravity                      | Partial     | Skills and repo-wide rules (`always_on`) through `add` and `build`, no `AGENTS.md`. Scoped rules are skipped: no glob rule attached in testing. MCP servers and agents (`.agents/agents/`) through `add`. Hooks are planned. [Setup](setup/antigravity.md), [probes](decisions/antigravity-target-2026-11.md)                                                                                                 |
| S4e OpenCode                         | Partial     | Skills, agents and commands through `add` and `build`, plus `AGENTS.md` on `build`. `explain-diff` is skipped: a real diff doesn't survive its argument quoting. MCP servers through `add`, no hooks. Agent restrictions were seen working only on OpenCode 1 with hand-written files, not yet on Sigil's own files or OpenCode 2. [Setup](setup/opencode.md), [probes](decisions/opencode-target-2026-11.md) |
| S8 GUI / web browsing                | Not planned | Plugin browsers in each AI tool, plus the generated [artifact index](reference/artifacts.md). [Decision](decisions/ui-beyond-terminal-2026-11.md)                                                                                                                                                                                                                                                             |

## Glossary

- **Artifact**: one authored unit in the catalog: a Markdown file with YAML frontmatter, identified
  by `<language>/<name>` (for example `typescript/ts-generate-tests`).
- **Kind**: the type of an artifact: `skill`, `agent`, `rule`, `prompt`, `workflow`, or a config kind
  (`mcp`, `hook`, `settings`) that merges into JSON instead of writing a whole file. See
  [spec.md](reference/spec.md).
- **Pack**: a curated bundle of artifacts, defined in [`packs.yaml`](../packs.yaml).
  `sigil add pack:<name>` installs it.
- **Target**: the AI tool Sigil compiles for. Today `claude` and `copilot`.
- **Channel**: how a target delivers artifacts. **Scaffold** writes loose files into your project
  (`sigil add` / `init`); **plugin** builds a distributable plugin layout (`sigil build`). Not every
  kind is available on every channel; see [capabilities.md](reference/capabilities.md).
- **Closure**: an artifact plus everything it pulls in through `uses:` (rules and agents),
  resolved transitively. `add` installs the closure by default.
- **Manifest**: `.sigil/manifest.json` in a consumer project: records what Sigil installed, with
  content hashes, so `status`, `update`, and `uninstall` work.
- **Template / slot**: shared body prose (`kind: template`) with `<!-- slot: key -->` markers;
  an artifact opts in with `template:` and fills only the slots. See
  [architecture.md](reference/architecture.md).
- **Lexicon**: the per-provider vocabulary that turns neutral `{sigil:<term>}` tokens in artifact
  bodies into provider-specific text (file names, argument syntax) at build time.
- **Install state vs status**: both describe an installed artifact but at different moments.
  _Install state_ (six values: `new`, `foreign`, `up-to-date`, `drifted`, `outdated`, `missing`)
  is what the `add` wizard shows for each candidate, including ones never installed (`new`) or
  files Sigil did not write (`foreign`). _Status_ (five values: `up-to-date`, `outdated`,
  `drifted`, `orphaned`, `missing`) is what `sigil status` reports for entries already in the
  manifest, adding `orphaned` (id gone from the catalog). Wizard legend:
  [src/wizard/CLAUDE.md](../src/wizard/CLAUDE.md).

## Common commands

| Command                       | When to use                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `sigil add`                   | Install artifacts (wizard in a terminal, or `skill:<id>` etc.) |
| `sigil list` / `sigil search` | Browse the catalog                                             |
| `sigil status`                | Check the health of what is installed                          |
| `sigil update [ids...]`       | Refresh installed artifacts to the current catalog             |
| `sigil uninstall <ids...>`    | Remove installed artifacts                                     |
| `sigil new <kind>`            | Start a new catalog artifact                                   |
| `sigil validate`              | Schema and reference checks before a build or PR               |
| `sigil build --target <name>` | Compile the plugin layout to `dist/<name>/`                    |

Everything else (`get`, `edit`, `patch`, `move`, `delete`, `retarget`, `import`, `sync`, `prune`,
`release`, …): [spec.md § CLI reference](reference/spec.md#cli-reference). Per-command flags:
[cli-flags.md](reference/cli-flags.md). Note that `move` rewrites only `extends:` and `uses:`
referrers, not other mentions of an id.
