# Publishing Your Own Catalog as a Marketplace

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) · [Consuming guide](consuming.md) · [Operations guide](operations.md)

For teams that keep their own catalog (or a fork of this one) and want to hand it to colleagues.
This guide covers only what works today; every command below was run against a throwaway catalog.
What does not work yet is listed under [Known limits today](#known-limits-today).

---

## 1. Use your own catalog

Every command that reads the catalog takes `--catalog-dir <dir>` and `--packs <file>`
(`build`, `validate`, `add`, `status`, `update`, `prune`, `list`, `sync`, … — see
`src/cli.ts`). Without them they default to the catalog **bundled with the installed sigil
package** (`resolveDefault` in `src/cli-helpers.ts`), so a team catalog must always pass them:

```bash
sigil validate --catalog-dir ./catalog --packs ./packs.yaml
```

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

`marketplace.json` (verbatim; note `name`, `owner` and the plugin `author` — see limits):

```json
{
  "name": "sigil",
  "owner": { "name": "Sigil", "url": "https://github.com/makubexD/sigil#readme" },
  "description": "Vendor-neutral AI skills, agents, and rules for multiple languages.",
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
package version, not your catalog's. The output passes `claude plugin validate out/claude`
(`✔ Validation passed`).

**Publish:** copy the _contents_ of `out/claude/` to the root of a git repository (the folder
that contains `.claude-plugin/`), commit and push. `dist/` and your `--out-dir` are not
committed or published by sigil; nothing automates this today.

**Install (users):**

```
/plugin marketplace add <owner>/<repo>
/plugin install acme-starter@<marketplace-name>
```

The `<marketplace-name>` is the `name` in `marketplace.json`, currently always `sigil`. To verify
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

- Marketplace `name`/`owner` and plugin `author`/`license` are hardcoded to sigil:
  [own-marketplace-metadata](../ideas/own-marketplace-metadata.md).
- The manifest does not record which catalog installed an artifact, so `status`/`update`/`prune`
  without `--catalog-dir` report a team artifact as `orphaned`:
  [manifest-catalog-source](../ideas/manifest-catalog-source.md). Always pass the same
  `--catalog-dir` and `--packs`.
- No Copilot plugin channel: [copilot-plugin-channel](../ideas/copilot-plugin-channel.md).
- `sigil build --target copilot` emits agents as one `.github/AGENTS.md`, while `add` writes
  `.github/agents/*.agent.md`; the two layouts differ (same brief).
- Nothing publishes the marketplace for you: [publish-claude-marketplace](../ideas/publish-claude-marketplace.md).
- No hooks or settings for Copilot: [copilot-hooks](../ideas/copilot-hooks.md).
