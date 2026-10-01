# Record the catalog source in the manifest

## Objective

`.sigil/manifest.json` records which catalog (bundled, or a team catalog identified by name and
version or path/URL) installed each artifact, so `status`, `update` and `prune` read the right
catalog by default and a fork's artifacts are never reported as orphaned. Used implicitly by every
consumer verb; output is unchanged per target.

## Evidence

- `src/manifest/types.ts:40` `ManifestEntry` has `sigilVersion` ("pkg.version at install time")
  and no catalog identity field; the `orphaned` status is documented as "id no longer exists in the
  bundled catalog" (`src/manifest/types.ts:70`).
- `src/commands/update.ts:168` and `src/commands/prune.ts:124` call
  `loadAndValidate(opts.catalogDir, opts.packs)`; `catalogDir` defaults to the package's own
  `catalog/` (`resolveDefault`, `src/cli-helpers.ts:48-50`).
- `src/commands/update.ts:101-102` prints "orphaned - no longer in catalog" when the id is absent;
  `src/commands/prune.ts:84` says "no longer in the bundled catalog"; `status` does the same
  (`src/commands/status.ts:119,128`).
- Verified by running it: `sigil add skill:shared/hello --target copilot --catalog-dir <team>`
  then `sigil status` and `sigil prune` with no `--catalog-dir` both report `shared/hello`
  `[orphaned]`; `prune --apply` would remove it.

## Out of scope

- Multi-catalog layering or merging catalogs at install time.
- Marketplace identity ([own-marketplace-metadata](own-marketplace-metadata.md)).
- Changing drift classification.

## Success criteria

- New optional manifest field written by `add`; older manifests (without it) still load and
  `manifestVersion` is handled explicitly.
- `status`/`update`/`prune` without `--catalog-dir` use the recorded source when it is reachable,
  and say so; an unreachable source gives a clear error rather than "orphaned".
- Regression test: install from a team catalog, run `prune` with no flags, nothing is orphaned.
- `docs/guides/consuming.md`, `docs/guides/publishing.md` and manifest docs updated.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That a catalog can be identified stably: a local path breaks across machines, and a committed
manifest is shared across a team (see the manifest-trust note in
[distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) section 7).

## Open questions

- Store a path, a git URL, a package name, or only a label plus fingerprint?
- Is a recorded path in a committed manifest a trust or privacy problem?
- Should `prune` refuse to run when the catalog differs from the recorded one?
