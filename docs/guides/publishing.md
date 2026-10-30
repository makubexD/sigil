# Publishing Your Own Catalog as a Marketplace

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) · [Consuming guide](consuming.md) · [Operations guide](operations.md)

For teams that keep their own catalog (or a fork of this one) and want to hand it to colleagues.
This guide covers only what works today; every command below was run against a throwaway catalog.
What does not work yet is listed under [Known limits today](#known-limits-today).

---

## 1. Use your own catalog

Most commands that read the catalog take `--catalog-dir <dir>` and `--packs <file>`
(`build`, `validate`, `add`, `status`, `update`, `prune`, `sync`, … — see
`src/cli.ts`; `list`, `search`, `get` and `check` take only `--catalog-dir`). Without them they default to the catalog **bundled with the installed sigil
package** (`resolveDefault` in `src/cli-helpers.ts`), so a team catalog must always pass them:

```bash
sigil validate --catalog-dir ./catalog --packs ./packs.yaml
```

A consumer project passes them once, to `sigil add`. The manifest records the catalog each
artifact came from (relative to the project, e.g. `../team-catalog`), so later `status`, `update`
and `prune` runs find it with no flags and print `Using catalog ../team-catalog (recorded in
.sigil/manifest.json)`. Keep the catalog at the same place relative to the project on every machine
(a sibling checkout works), or pass `--catalog-dir` and `--packs` again.

Catalog layout, artifact frontmatter and `packs.yaml` format: [authoring.md](authoring.md) and
[spec.md](../reference/spec.md). The minimum is one artifact plus one pack:

```
acme/
├── packs.yaml                          # packs: [{ name: acme-starter, artifacts: [shared/hello] }]
└── catalog/shared/skills/hello/SKILL.md   # id: shared/hello, kind: skill
```

---

## 2. Build and host a Claude marketplace

```bash
sigil build --target claude --catalog-dir ./catalog --packs ./packs.yaml --out-dir ./out
```

Real output for the catalog above (the marketplace root is `out/claude/`):

```
out/
├── registry.json
└── claude/
    ├── .claude-plugin/marketplace.json
    └── plugins/acme-starter/
        ├── .claude-plugin/plugin.json
        └── skills/hello/SKILL.md
```

`marketplace.json` (verbatim, built with the `marketplace:` block shown under
[Name your marketplace](#name-your-marketplace)):

```json
{
  "name": "acme-ai",
  "owner": {
    "name": "Acme Platform",
    "url": "https://github.com/acme/ai-catalog",
    "email": "platform@acme.example"
  },
  "description": "Acme's internal skills for Claude Code.",
  "plugins": [
    {
      "name": "acme-starter",
      "displayName": "Acme Starter",
      "description": "Demo pack for the publishing guide.",
      "source": "./plugins/acme-starter"
    }
  ]
}
```

One plugin is emitted per pack in `packs.yaml`; `plugin.json` carries `version` = the sigil
package version, not your catalog's. The output passes
`claude plugin validate --strict out/claude` (`✔ Validation passed`).

### Name your marketplace

Claude Code keeps one marketplace per `name`. Without configuration a build uses sigil's own
identity (`name: sigil`, owner and author `Sigil`, license `MIT`), so a fork added next to
upstream sigil collides with it. Give your marketplace its own identity with a top-level
`marketplace:` block in your `packs.yaml`:

```yaml
marketplace:
  name: acme-ai # required
  owner: { name: Acme Platform, email: platform@acme.example } # owner.name required
  description: Acme's internal skills for Claude Code.
  license: Apache-2.0
  homepage: https://github.com/acme/ai-catalog
packs:
  - name: acme-starter
    # …
```

| Field         | Written to                                          | When left out                     |
| ------------- | --------------------------------------------------- | --------------------------------- |
| `name`        | `marketplace.json` `name`                           | required                          |
| `owner`       | `marketplace.json` `owner` (`name`, `url`, `email`) | required (`owner.name`)           |
| `description` | `marketplace.json` `description`                    | omitted                           |
| `author`      | every `plugin.json` `author`, same shape            | `owner` is used                   |
| `license`     | every `plugin.json` `license`                       | omitted                           |
| `homepage`    | the `url` of `owner` and `author`                   | they keep only the `url` they set |

With the block present, a field you leave out is left out of the output; it is never filled with
sigil's value. `name` must start with a letter or digit and hold only letters, digits, `.`, `-` and
`_`, with no `..` (Claude's rule; `sigil build` rejects anything else and names the file). Names
Claude reserves are left to `claude plugin validate --strict`. `version` in `plugin.json` stays the
sigil package version.

`sigil build` warns when the packs file is not the bundled one and has no `marketplace:` block:

```
Warning: no marketplace: block in packs.yaml; the marketplace keeps the name 'sigil' and collides with upstream sigil when both are added. Set marketplace.name (see docs/guides/publishing.md).
```

**Publish:** copy the _contents_ of `out/claude/` to the root of a git repository (the folder
that contains `.claude-plugin/`), commit and push. `dist/` and your `--out-dir` are not
committed or published by sigil; nothing automates this today.

**Install (users):**

```
/plugin marketplace add <owner>/<repo>
/plugin install acme-starter@<marketplace-name>
```

The `<marketplace-name>` is the `name` in `marketplace.json` (`acme-ai` above). To verify
against Claude's docs: the command also exists as `claude plugin marketplace add <owner>/<repo>`
and accepts a repository URL or a local directory
([Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)). Plugins carry
skills and agents only; rules are inlined into skills; prompts, hooks, MCP and settings are not
packaged — install those with `sigil add` ([capabilities.md](../reference/capabilities.md)).

---

## 3. Copilot: commit the generated `.github/` files

There is no Copilot plugin or marketplace output. Today's route is per-project:

```bash
sigil add --target copilot --catalog-dir ./catalog --packs ./packs.yaml   # wizard, or skill:shared/hello --yes
```

A skill lands at `.github/skills/<name>/SKILL.md` (verified), agents at
`.github/agents/<name>.agent.md` (`src/targets/copilot/spec/agent.ts:57`), and
`.sigil/manifest.json` records what was written. Commit those files so every clone gets them.

To verify (GitHub docs, not tested here): org-wide custom agents go in an `agents/` folder at the
root of the org's `.github` or `.github-private` repository
([Create custom agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents)).
sigil does not write that layout.

---

## Known limits today

- No Copilot plugin channel: [copilot-plugin-channel](../ideas/copilot-plugin-channel.md).
- `sigil build --target copilot` emits agents as one `.github/AGENTS.md`, while `add` writes
  `.github/agents/*.agent.md`; the two layouts differ (same brief).
- Nothing publishes the marketplace for you: [publish-claude-marketplace](../ideas/publish-claude-marketplace.md).
- No settings for Copilot. Hooks install with `sigil add --target copilot` since #102
  ([decision](../decisions/copilot-hooks-2026-10.md)).
