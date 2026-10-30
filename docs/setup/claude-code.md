# Claude Code: install Sigil packs as plugins

> **Back to:** [README](../../README.md) · [Documentation index](../index.md) ·
> [consuming.md](../guides/consuming.md)

Sigil's packs are published as a Claude Code plugin marketplace, so you can install them without
cloning Sigil or installing its CLI. Each release builds the marketplace from its tag and pushes it to
the `marketplace` branch of [makubexD/sigil](https://github.com/makubexD/sigil).

## Add the marketplace

In a Claude Code session:

```
/plugin marketplace add makubexD/sigil#marketplace
```

From a shell, the same command is `claude plugin marketplace add makubexD/sigil#marketplace`. The
marketplace is named `sigil`.

To stay on one release, add its tag instead: `makubexD/sigil#marketplace-v<version>`, for example
`#marketplace-v0.2.0`. A pinned marketplace never changes.

## Install a pack

Each pack in [`packs.yaml`](../../packs.yaml) is one plugin with the same name:

```
/plugin install spec-driven@sigil
/plugin install typescript-starter@sigil
```

A pack whose artifacts are all MCP servers, hooks or prompts, such as `essentials`, has no plugin
yet: plugins can't carry those kinds. Install it with `sigil add` instead.

Browse the full list on the **Discover** tab of `/plugin`, or in the published
`.claude-plugin/marketplace.json`. Plugins load in the next session, or after `/reload-plugins`.

**What a plugin carries.** Skills and agents. Each rule a skill uses is inlined into that skill.
MCP servers, hooks, settings and prompts are not packaged into plugins. Install those with
[`sigil add`](../guides/consuming.md), which also suits you better when you want files you can read
and edit in your project. The per-kind table is in [capabilities.md](../reference/capabilities.md).

## Update

Third-party marketplaces do not auto-update by default. Run `/plugin`, open the **Marketplaces**
tab and select `sigil`. There, **Enable auto-update** keeps it current from then on, and **Update
marketplace** updates now: it refreshes the listing and the plugins you installed from it. From a
shell, update one plugin with `claude plugin update spec-driven@sigil`.
([Keep plugins updated](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated).)

Every plugin's `version` is the Sigil release that built it. A marketplace pinned to
`#marketplace-v<version>` stays on that release until you add a newer tag.

## Remove

```
/plugin uninstall spec-driven@sigil
/plugin marketplace remove sigil
```

## Build it yourself

To try unreleased catalog changes, or to publish your own catalog, build the marketplace locally with
`sigil build --target claude`. See [consuming.md](../guides/consuming.md#install-a-pack-as-a-claude-plugin)
and [publishing.md](../guides/publishing.md).
