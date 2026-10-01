# Configurable marketplace and plugin identity

## Objective

A team or fork sets its marketplace name, owner, plugin author, license and homepage in
`packs.yaml` (or a small catalog config file) and `sigil build` emits those instead of sigil's.
Used by anyone following [publishing.md](../guides/publishing.md). Output per target: Claude
`marketplace.json` and each `plugin.json` carry the configured identity; the default (no config)
stays byte-identical to today.

## Evidence

- `src/targets/claude-code/target-helpers.ts:92-93` hardcodes `name: 'sigil'` and
  `owner: { name: 'Sigil', url: marketplaceUrl }`; `:88` falls back to
  `https://github.com/makubexD/sigil#readme` when no homepage is passed.
- `src/targets/claude-code/plugin-assemble.ts:28-29` hardcodes `author: { name: 'Sigil', url }` and
  `license: 'MIT'`; `:19` has the same homepage fallback.
- `src/commands/build.ts:72` passes `homepage: pkg.homepage` (sigil's own `package.json`), so a
  `--catalog-dir` build still takes sigil's homepage; there is no option to override it.
- Confirmed by building a throwaway catalog with `--catalog-dir`: the output `marketplace.json` has
  `"name": "sigil"` and owner `Sigil`.
- Copilot `target-helpers.ts` has no marketplace identity (no hits for owner/author/license there).

## Out of scope

- Publishing automation ([publish-claude-marketplace](publish-claude-marketplace.md)).
- A Copilot marketplace manifest ([copilot-plugin-channel](copilot-plugin-channel.md)).
- Per-plugin version independent of the sigil package version.

## Success criteria

- A documented, schema-validated place for `marketplace.name`, `owner`, `author`, `license`,
  `homepage` (zod in `src/schema/index.ts`; regenerated `schema/*.schema.json` committed).
- Built output uses the configured values; the name obeys Claude's naming rules (to verify below).
- With no config the `dist/claude/` output is unchanged (test compares before/after).
- `docs/guides/publishing.md` "Known limits" entry removed and replaced by the new instructions.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That a fork wants these in `packs.yaml`; `packs.yaml` is a pack list today and a catalog-level
config file may be the cleaner home.

## Open questions

- Does the default marketplace name `sigil` collide when a user adds both upstream and a fork
  (to verify against the Claude plugin docs)?
- Validate the name against Claude's marketplace name rules at build time?
- Should `version` also come from the catalog instead of `pkg.version`?
