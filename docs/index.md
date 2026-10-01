# Sigil — Documentation

> **New here?** Start with the [README](../README.md) for the pitch and install steps, then pick
> your path below.

## Use Sigil (install artifacts into a project)

| Doc                                                          | Covers                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| [guides/consuming.md](guides/consuming.md)                   | Wizard, `add`, `list`, `init`, status/update/uninstall, plugins |
| [reference/troubleshooting.md](reference/troubleshooting.md) | Common errors and FAQ                                           |
| [reference/capabilities.md](reference/capabilities.md)       | Which kinds each target delivers, per channel (generated)       |
| [reference/config-kinds.md](reference/config-kinds.md)       | How `mcp` / `hook` / `settings` merge into your JSON files      |

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
| [../CLAUDE.md](../CLAUDE.md)                           | Invariants that must not break, architecture, doc map                       |
| [reference/architecture.md](reference/architecture.md) | Extension model, emit specs, templates, lexicon, conformance                |
| [guides/operations.md](guides/operations.md)           | Build and link, targets, CI gate (`npm run ci:local` mirrors CI), `release` |
| [../CHANGELOG.md](../CHANGELOG.md)                     | Version history                                                             |

## Project history and backlog (not user docs)

- [decisions/](decisions/README.md): point-in-time decision logs and retrospectives.
- [audits/](audits/): measurement logs and campaign notes.
- [ideas/](ideas/): the gap backlog; one short brief per planned or missing capability.

The guides and reference describe the system as it stands; history and ideas do not.

## Support matrix

| Scenario                             | Status                    | Details                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1 Guided menu and wizards           | Supported                 | `sigil` with no command opens a guided menu in a terminal; `add`, `init`, `uninstall`, `update`, `prune`, `new`, `edit` are guided too. Outside a terminal everything is flag-driven. The `add` wizard has no keyword search yet; the menu's Search entry does. [Guide](guides/consuming.md#using-the-guided-menu) |
| S2 Claude plugin marketplace         | Partial                   | Local build works (`sigil build --target claude` → `dist/claude`); a published marketplace is planned. [Brief](ideas/publish-claude-marketplace.md)                                                                                                                                                                |
| S3 Publish your own marketplace/fork | Partial                   | `--catalog-dir` and `--packs` work; marketplace name, owner, and author are hardcoded; the manifest does not record the catalog source. [Guide](guides/publishing.md), [metadata](ideas/own-marketplace-metadata.md), [catalog source](ideas/manifest-catalog-source.md)                                           |
| S4 GitHub Copilot                    | Supported (scaffold only) | Instructions, skills, agents, prompts, MCP. No plugin channel; no hooks or settings. [Capabilities](reference/capabilities.md), [plugin channel](ideas/copilot-plugin-channel.md), [hooks](ideas/copilot-hooks.md)                                                                                                 |
| S5 npm distribution                  | Planned                   | Not published; build from source. [Brief](ideas/npm-first-publish.md)                                                                                                                                                                                                                                              |
| S6 Suggest an artifact without code  | Partial                   | Open an issue or discussion, or run the `sigil new` wizard from a clone. No issue form; `sigil import` reads Claude layouts only. [Issue form](ideas/artifact-proposal-issue-form.md), [Copilot import](ideas/import-copilot-layout.md)                                                                            |
| S7 Other AI tools                    | Planned                   | Codex and Cursor targets planned; Gemini CLI to be evaluated. [Codex](ideas/codex-target.md), [Cursor](ideas/cursor-target.md), [Gemini CLI](ideas/gemini-cli-target.md)                                                                                                                                           |
| S8 GUI / web browsing                | Not available             | Terminal only. [Brief](ideas/ui-beyond-terminal.md)                                                                                                                                                                                                                                                                |

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
