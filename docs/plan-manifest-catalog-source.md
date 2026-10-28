# Plan: record the catalog source in the manifest

Source brief: `docs/ideas/manifest-catalog-source.md`. Branch: `feat/manifest-catalog-source`. One PR.

## Context

A project that installs from a team catalog (`sigil add … --catalog-dir ../team-catalog`) has its
artifacts reported `orphaned` by `status`, `update` and `prune` run without the flag, because they
default to the bundled catalog; `prune --apply` would delete them. Re-verified 2026-10-28:
`ManifestEntry` (`src/manifest/types.ts:36`) has no catalog field; `runStatus`, `runPrune` and
`prepareUpdateRun` each call `loadAndValidate(opts.catalogDir, opts.packs)` once
(`status.ts:228`, `prune.ts:189`, `update.ts:199`); the wizard hardcodes the bundled catalog
(`wizard/home-actions.ts:22`, `bundledCatalogIds` at `:49`).

## Decisions (owner, 2026-10-28)

- **Identity: a relative path.** An entry installed from a non-bundled catalog records
  `catalog: { dir, packs }`, both relative to the project folder with `/` separators
  (`../team-catalog`, `../team-catalog/packs.yaml`). A bundled install records nothing (absent =
  bundled), so a committed manifest never holds `/home/<user>`.
- **Per entry.** Each entry is judged only against its own catalog. A command loads every distinct
  recorded catalog (usually one or two).
- **`MANIFEST_VERSION` 2 → 3.** An older sigil refuses a v3 manifest instead of pruning team
  entries as orphaned. A v2 manifest loads unchanged and is saved as v3.

## Design

- New module `src/manifest/catalog-source.ts` (pure apart from `existsSync`):
  - `type CatalogSource = { dir: string; packs: string }`.
  - `sourceToRecord(projectDir, catalogDir, packs): CatalogSource | undefined`: `undefined` when
    `catalogDir` is the bundled one (`resolveDefault('catalog')`, compared after `path.resolve`);
    otherwise both paths `path.relative(projectDir, …)` with `\` → `/`.
  - `isExplicitCatalog(opts)`: true when `opts.catalogDir` is not the bundled default. Commander
    fills the default, so "explicit" means "differs from it"; passing the bundled path is the same
    as passing nothing.
  - `groupBySource(entries, opts): SourceGroup[]` where `SourceGroup = { source?: CatalogSource;
catalogDir: string; packs: string; entries: ManifestEntry[] }`. With an explicit
    `--catalog-dir`, one group with every entry (today's behavior: the flag wins). Otherwise one
    group per distinct recorded source, plus the bundled group; paths resolved against
    `projectDir`. Group order: bundled first, then by `dir`.
  - `assertReachable(groups, projectDir)`: a recorded `dir` that does not exist throws
    `SigilError("Catalog '../team-catalog' recorded in .sigil/manifest.json for 3 artifacts was not found.", { hint: 'Restore it or pass --catalog-dir <path>.' })`
    before anything is read or written. Never reported as orphaned.
- `ManifestEntry.catalog?: CatalogSource | undefined` (doc comment: absent = bundled).
  `upsertEntries` / `upsertConfigEntry` take `catalog` in their context and set it on new and
  refreshed entries (re-adding from another catalog moves the entry). `update` never changes it.
- Commands: `status`, `prune`, `update` run their current per-catalog logic once per group, the
  group's entries in a view `{ manifestVersion, entries: group.entries }` that shares the entry
  objects, so mutations land in the real manifest, which is saved once. Results are merged in one
  report. Each non-bundled group prints one line first: `Using catalog ../team-catalog (recorded
in .sigil/manifest.json)` (not in `--json`, where the group's `catalog` is a field instead).
  `update`'s co-install set (`installedIdsFor`) stays project-wide, as today.
- Wizard: `HomeDeps.catalogIds` becomes `(dir: string) => Promise<Set<string> | undefined>`,
  returning the union of the ids of each catalog that folder's manifest records (bundled always).
  Consumer handlers keep `bundled()`, which `isExplicitCatalog` treats as "not explicit", so the
  recorded sources apply.
- Trust: an edited manifest can point `update` at another catalog; the printed `Using catalog …`
  line makes that visible, and anyone who can edit the committed manifest can already commit hook
  files directly. Recorded `files` paths keep their existing containment checks.

## Steps

1. `[worker:medium]` RED unit tests, `test/manifest-catalog-source.test.ts` (new):
   - `sourceToRecord('/p', resolveDefault('catalog'), resolveDefault('packs.yaml'))` → `undefined`.
   - `sourceToRecord('/w/p', '/w/team', '/w/team/packs.yaml')` → `{ dir: '../team', packs: '../team/packs.yaml' }`.
   - `sourceToRecord('/w/p', '/w/p/catalog-fork', '/w/p/catalog-fork/packs.yaml')` → `{ dir: 'catalog-fork', … }`.
   - `groupBySource` with 2 bundled + 1 team entry and default opts → 2 groups (bundled with 2
     entries first, then team with `catalogDir` = `path.resolve(projectDir, '../team')`).
   - `groupBySource` with the same entries and `catalogDir: '/x/other'` → 1 group, 3 entries.
   - `assertReachable` with a group whose dir does not exist → throws `SigilError`; message
     contains `../team` and `1 artifact`; hint contains `--catalog-dir`.
   - `test/manifest.test.ts`: a v2 manifest file loads and `saveManifest` writes
     `manifestVersion: 3`; `manifestVersion: 4` throws "newer version"; an entry's `catalog` field
     survives load → save.
     Test: `npm test -- --test-name-pattern="catalog source|manifest"` fails on the missing module /
     version.
2. `[worker:medium]` Manifest v3: `MANIFEST_VERSION = 3` and `ManifestEntry.catalog`
   (`src/manifest/types.ts`), `io.ts` loads ≤3 (comment: v2 differs only by the absent field);
   `src/wizard/installed-picker.ts:52` uses `MANIFEST_VERSION` instead of the literal `2`. Update
   the frozen-fixture tests only if they assert the version number. Test: step 1's manifest cases
   pass; `npm test`.
3. `[worker:medium]` `src/manifest/catalog-source.ts` as designed. Test: step 1 passes.
4. `[worker:medium]` RED command tests, `test/commands/catalog-source.test.ts` (new) and helper
   `test/helpers/team-catalog.ts` (`makeTeamCatalog(root)`: `cpSync` of `catalog/` and
   `packs.yaml` into `<root>/team-catalog`, plus one rule `shared/team-only` copied from an
   existing shared rule with `id`/`title` changed). Project at `<root>/project`, target `claude`:
   - `add rule:shared/team-only --catalog-dir <team> --packs <team>/packs.yaml` → its manifest entry
     has `catalog: { dir: '../team-catalog', packs: '../team-catalog/packs.yaml' }`.
   - `add rule:shared/clean-code` with no flags → entry has no `catalog` field.
   - After both: `status --json` with no catalog flags → no entry `orphaned`.
   - `prune --json` with no flags → no candidates; `prune --apply --yes` removes nothing.
   - `update --json` (or the summary) with no flags → 0 orphaned; team file unchanged.
   - Rename `<root>/team-catalog` away → `status`, `prune`, `update` each throw `SigilError`
     matching `/not found/` with hint `--catalog-dir`; manifest bytes unchanged.
   - `status --catalog-dir <bundled path>` behaves as no flag; `status --catalog-dir <team>` judges
     every entry against the team catalog (bundled entry still present there, so not orphaned).
     Test: the new file fails (entries lack `catalog`, team entry orphaned).
5. `[worker:medium]` `add` records the source: `UpsertContext` and the config upsert context get
   `catalog` (`src/manifest/mutate.ts`, `src/manifest/mutate-config.ts`), set from
   `sourceToRecord(plan.opts.projectDir, plan.opts.catalogDir, plan.opts.packs)` in
   `src/commands/add/execute.ts` and `execute-config.ts`. Test: step 4's two `add` cases pass.
   (4 files, one concern.)
6. `[worker:medium]` `status` and `prune` per group (`src/commands/status.ts`,
   `src/commands/prune.ts`): `groupBySource` → `assertReachable` → per group `loadAndValidate` +
   current logic on the group view → merged output; the `Using catalog …` line. Prose "bundled
   catalog" → "its catalog" (`status.ts`, `prune.ts:113`, `cli.ts:243` help text). Test: step 4's
   status and prune cases pass; `npm test`.
7. `[worker:medium]` `update` per group (`src/commands/update.ts`, `update-guided.ts` only if its
   orphan wording changes): `prepareUpdateRun` builds one setup per group, `applyUpdate` runs
   `updateAllEntries` per group, sums totals, saves once. Test: step 4's update cases pass;
   `npm test`.
8. `[worker:medium]` Wizard header orphan count per folder (`src/wizard/home.ts`,
   `src/wizard/home-actions.ts`): `catalogIds(dir)` per the design; update the injected fakes in
   `test/wizard/*` that pass `catalogIds`. Test: `npm test` (the home matrix and journeys still
   pass); add one case in `test/wizard/home.test.ts`: a folder whose manifest records a team entry
   shows no orphaned count.
9. `[inline: user-facing docs + close-out]` `docs/guides/consuming.md` (manifest description, the
   `orphaned` row, "the recorded catalog is used unless --catalog-dir is passed"),
   `docs/guides/publishing.md` (drop the "Known limits" bullet; say a team installs once with the
   flags, later commands find the catalog), `docs/reference/spec.md:439`, `CHANGELOG.md` (Changed:
   manifest v3, older sigil refuses it; Fixed: team artifacts no longer orphaned), delete the brief
   and its row in `docs/ideas/README.md`. Live check against a temp team catalog. `npm run ci:local`.

## Verification

Per step: the listed tests, then `npm test`. End: `npm run ci:local` green; live run of add from a
team catalog, then `status` / `prune` / `update` with no flags; `workflow-report <repo>`;
`/agent-skills:review`; PR, merge on green CI; delete this plan after merge.
