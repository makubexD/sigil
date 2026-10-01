# First npm publish and package name

## Objective

Publish sigil to npm so `npx sigil` and `npm install -g sigil` work without a clone, then rely on
the existing tag-triggered Trusted Publishing workflow for later releases. Output: a public
package whose `bin` is `sigil`; no per-target output.

## Evidence

- `package.json:2` name `sigil`; `:27` `bin` -> `./dist-cli/cli.js`; `:40` `files` includes
  `catalog/`, `schema/`, `dist-cli/`, `packs.yaml`, `docs/`; `:50` `publishConfig.access: public`;
  `prepack` runs `npm run build`.
- `.github/workflows/release.yml:8` and `:41-45` say: publish once manually, then add a Trusted
  Publisher (repo, `release.yml`, no environment); `:54-55` run
  `npm publish --provenance --access public` on `v*.*.*` tags.
- `README.md:44-45` says `npx sigil` and `npm install -g sigil` work "once Sigil is published".
- `npm view sigil` (run 2026-10-01, read-only) returns E404: "Unpublished on 2024-10-09". So the
  name is not currently served, but a previous owner unpublished it. Whether npm lets this
  account republish that name is not verified (npm's unpublish policy must be checked).

## Out of scope

- Marketplace publishing ([publish-claude-marketplace](publish-claude-marketplace.md)).
- Changing the release workflow beyond what the first publish needs.
- Renaming the CLI binary.

## Success criteria

- Package name decided and recorded (unscoped `sigil` if allowed, else a scoped name).
- `npm pack --dry-run` file list reviewed; no test or scratch files shipped.
- First manual `npm publish --access public` done; Trusted Publisher configured; a tagged release
  publishes with provenance.
- `npx <name> --version` works from an empty directory; README install lines match the real name.
- If renamed, `package.json` `name`/`bin`, README and docs install strings updated.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That the name `sigil` is obtainable; the unpublish record suggests it may be blocked or disputed.

## Open questions

- Should the package be scoped (for example `@<owner>/sigil`) to avoid the name question? A scope
  changes the `npx` command users type.
- Does a scoped name affect the `sigil` bin name and the manifest or docs strings?
- Who owns the npm account long term (personal or an org)?
