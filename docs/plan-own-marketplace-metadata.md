# Plan: configurable marketplace and plugin identity

Source brief: `docs/ideas/own-marketplace-metadata.md`. Branch: `feat/own-marketplace-metadata`. One PR.

## Context

`sigil build --target claude` hardcodes sigil's identity: `buildMarketplaceJson`
(`src/targets/claude-code/target-helpers.ts:74-91`: `name: 'sigil'`, `owner: { name: 'Sigil' }`, a fixed
description, homepage fallback `https://github.com/makubexD/sigil#readme`) and `buildPluginJson`
(`src/targets/claude-code/plugin-assemble.ts:18-35`: `author: { name: 'Sigil' }`, `license: 'MIT'`).
`runBuild` passes `homepage: pkg.homepage` (`src/commands/build.ts:73`). A fork that keeps the name
`sigil` cannot be added next to upstream: Claude Code allows one marketplace per name
(code.claude.com/docs/en/plugins/marketplace-reference, Top-level fields).

## Decisions (owner, 2026-10-30)

- **Home: an optional top-level `marketplace:` block in `packs.yaml`**, parsed by `parsePacksConfig`
  (`src/packs-config.ts`, the one reader). Packs already are the marketplace's plugins, and a team build
  already passes `--packs`. No JSON schema is emitted for `packs.yaml` (none exists today).
- **Shape:**
  ```yaml
  marketplace:
    name: acme-ai # required
    owner: { name: Acme Platform, url: https://…, email: … } # owner.name required
    description: … # optional
    author: { name: …, url: …, email: … } # plugin.json author; absent → owner
    license: Apache-2.0 # optional
    homepage: https://… # optional; default url for owner/author when they set none
  ```
- **Block present:** a field left out is omitted from the output, never filled with sigil's value.
- **Block absent:** output byte-identical to today (`test/targets/output-snapshot.test.ts` baseline
  unchanged).
- **Name check:** Claude's character rule only (`^[A-Za-z0-9][A-Za-z0-9._-]*$`, no `..`). Reserved names
  stay with `claude plugin validate --strict`.
- **Collision warning:** `build` warns when the packs file is not the bundled one and has no
  `marketplace:` block. Building sigil itself never warns.
- `version` stays `pkg.version` (out of scope).

## Steps

1. `[worker:medium]` RED tests.
   - `test/packs-config.test.ts`:
     - the bundled `packs.yaml` parses with `marketplace` `undefined`;
     - a block `{ name: 'acme-ai', owner: { name: 'Acme' } }` parses and round-trips the fields;
     - each of these throws a `SigilError` whose message names the source file: `name: 'acme ai'`,
       `name: '-acme'`, `name: 'a..b'`, `owner: { name: '' }`, a block without `owner`.
   - `test/targets/claude-code.test.ts` (compile with `marketplace` in the `CompileOptions`):
     - full block (name, owner with url and email, description, author, license `Apache-2.0`, homepage):
       `marketplace.json` has `name: 'acme-ai'`, that owner, that description; every `plugin.json` has
       that author and `license: 'Apache-2.0'`;
     - minimal block `{ name: 'acme-ai', owner: { name: 'Acme' } }`: `marketplace.json` has no
       `description`, owner is exactly `{ name: 'Acme' }`; each `plugin.json` has
       `author: { name: 'Acme' }` and no `license` key;
     - block with `homepage: 'https://acme.dev'` and owner/author without url: owner and author get
       `url: 'https://acme.dev'`;
     - no block: `marketplace.name === 'sigil'`, owner name `Sigil`, `license: 'MIT'` (today).
   - `test/commands/build-identity.test.ts` (new, `runBuild` like `foreign-literal-gate.test.ts`, capture
     `console.warn`):
     - bundled catalog and packs: no warning containing `marketplace`;
     - a copied packs file without a block: one warning matching `/marketplace name 'sigil'/` and
       `/marketplace:/`;
     - the same file with a block: no warning, and `dist/claude/.claude-plugin/marketplace.json` has the
       configured name.
       Test: `npm test -- --test-name-pattern="parsePacksConfig|marketplace|identity"` fails for the missing
       field/option, not a syntax error.
2. `[worker:medium]` Types and parsing: `MarketplaceIdentity` (`name`, `owner: { name; url?; email? }`,
   `description?`, `author?` same shape as owner, `license?`, `homepage?`) and
   `PacksConfig.marketplace?` in `src/types.ts`; the zod block in `src/packs-config.ts` (name regex plus
   a `..` refine, `owner.name` `min(1)`, urls as `z.string()`). Test: step 1's packs-config cases pass.
3. `[worker:medium]` Emit: `CompileOptions.marketplace?: MarketplaceIdentity` (`src/types.ts`);
   `buildMarketplaceJson` and `buildPluginJson` take it (absent → today's literal output, unchanged code
   path); `ClaudeCodeTarget.compile` and `buildOnePackPlugin` pass it through
   (`src/targets/claude-code/index.ts`, `plugin-assemble.ts`, `target-helpers.ts`); `runBuild` sets
   `marketplace: packsConfig.marketplace` (`src/commands/build.ts`). Omitted fields are left out of the
   object, not written as `undefined`. Test: step 1's compile cases pass; `output-snapshot` passes with
   the baseline untouched; `npm test`.
4. `[worker:medium]` Collision warning in `runBuild` (`src/commands/build.ts`): when
   `path.resolve(opts.packs) !== resolveDefault('packs.yaml')` and `packsConfig.marketplace` is undefined,
   `console.warn` once:
   `Warning: no marketplace: block in <packs path relative to cwd>; the marketplace keeps the name 'sigil' and collides with upstream sigil when both are added. Set marketplace.name (see docs/guides/publishing.md).`
   Test: step 1's build cases pass; `npm test`.
5. `[inline: user-facing docs + close-out]` `docs/guides/publishing.md`: replace the first "Known limits"
   bullet with a section on the `marketplace:` block (fields, defaults, the name rule, the collision);
   `packs.yaml` header comment: one line pointing at that section; `CHANGELOG.md` Unreleased → Added;
   delete `docs/ideas/own-marketplace-metadata.md` and its row in `docs/ideas/README.md`. Live check:
   build a temp fork with a block and run `claude plugin validate --strict` on it. `npm run ci:local`.

## Verification

Per step: the listed tests, then `npm test`. End: `npm run ci:local` green; the live fork build passes
`claude plugin validate --strict`; `workflow-report .`; `/agent-skills:review`; PR, merge on green CI;
delete this plan after merge.
