# Plan: generated artifact index

Branch: `feat/artifact-index`. Brief: [docs/ideas/artifact-index.md](ideas/artifact-index.md); decision:
[ui-beyond-terminal-2026-11.md](decisions/ui-beyond-terminal-2026-11.md). Evidence re-checked on master `145ccdf`.

## Decisions (the brief's open questions)

| Question                  | Decision                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One page or one per kind? | One page, `docs/reference/artifacts.md`, one H2 per kind with a contents line at the top. Per-kind tables keep the width down; split later only if it grows past about 100 KB.                                                                                                                                                                |
| A fork's own index?       | Only sigil's catalog. A `sigil index --markdown` flag is out of scope until someone asks; the renderer is pure, so it could be wired later.                                                                                                                                                                                                   |
| Which targets column?     | The tools `add` would install to, not the registry's `platforms`. No render is needed: `add` decides at selection time with `resolveSelection` plus the target's skip reason (`src/commands/add/plan-ids.ts:28-41`). The index calls the same function once per target with selector `all`, so the page and an install agree by construction. |
| Which pack expansion?     | `add`'s (`expandPackSelector`, `src/select/selector-resolve.ts:31`), not `getPackArtifacts`: that one drops `pluginExclude` ids, which `add` still installs (`packs.yaml:10`).                                                                                                                                                                |
| What install command?     | `sigil add <kind>:<id>`. The page says once, above the tables, that it installs for the tool set up in the folder, and to add `--target <name>` otherwise (`fixedTargetFor`, `src/commands/add/resolve-inputs.ts:66-86`).                                                                                                                     |

## Regression guards (every step)

`npm run check` passes. No step changes `src/index.ts`, a target's output, or catalog source. `src/cli.ts` is not touched
(no new command).

## Step 1 `[worker:medium]`: one pack-membership function, the one `add` uses

Files: `src/select/selector-resolve.ts`, `src/select/index.ts`, new `test/select/pack-members.test.ts`.

Add and export `packMemberIds(pack: Pack, catalog: ResolvedCatalog): string[]`: the ids of `catalog.artifacts`, in
catalog order, for which `matchesPackMembership(a, new Set(pack.languages ?? []), new Set(pack.artifacts ?? []))` is
true. `expandPackSelector` calls it (`packMemberIds(pack, catalog).forEach(addId)`) instead of filtering inline; its
unknown-pack error stays as is. Re-export `packMemberIds` from `src/select/index.ts`. Doc comment: this is the expansion
`sigil add pack:<name>` uses; `pluginExclude` does not apply (it is plugin-only).

Test (real catalog and `packs.yaml` through the existing test helpers, `test/helpers/catalog.ts`):

- `dotnet-tooling` (`languages: [csharp]`) → exactly the ids of every artifact with `frontmatter.language === 'csharp'`,
  non-empty.
- `essentials` → contains `shared/author-artifact` (listed under `pluginExclude`).
- `essentials` → the same ids, in the same set, as `resolveSelection({ selectors: ['pack:essentials'], filters: {}, catalog, packs })`.
- `resolveSelection` with `pack:no-such-pack` still throws `Unknown pack 'no-such-pack'`.

## Step 2 `[worker:medium]`: the "why add leaves this out" check lives in the targets layer

Files: new `src/targets/install-skip.ts`, `src/wizard/steps/add/state.ts`, `src/commands/add/plan-ids.ts`, and the two
wizard files that import `installSkipReason` (`src/wizard/steps/add/options.ts`, `plan-preview.ts`).

Move `installSkipReason(target, artifact)` from `state.ts` to `src/targets/install-skip.ts` unchanged (body:
`target.configSkipReason?.(artifact) ?? wholeFileSkipReason(target, artifact)`, same doc comment). The wizard files
import it from there; `state.ts` no longer exports it. `plan-ids.ts:37` becomes `skipReason: a => installSkipReason(ctx.target, a)`.
No behaviour change: no new test; the existing wizard and add tests must pass unchanged.

## Step 3 `[worker:medium]`: build the index rows and render the page (pure)

Files: new `src/artifact-index.ts`, new `test/artifact-index.test.ts`.

Exports:

- `interface ArtifactIndexRow { id; kind; title; description; sourcePath; packs: string[]; targets: string[]; deprecated?: string }`.
- `buildArtifactIndex(catalog: ResolvedCatalog, packs: Pack[], targets: Target[], repoRoot: string): ArtifactIndexRow[]`.
  Rows for every artifact whose kind is not `template`, sorted by `KIND_ORDER` then id. `sourcePath` is
  `artifact.filePath` relative to `repoRoot`, with `/` separators. `packs`: names of the packs whose
  `packMemberIds` (step 1) holds the id, in `packs.yaml` order. `targets`: for each target in `targets` (the caller
  passes `getAllTargets().filter(t => t.scaffold)`), one `resolveSelection({ selectors: ['all'], filters: {}, catalog,
packs, supportedKinds: installableKinds(t), carriedKinds: carriedKinds(t), targetName: t.name, skipReason: a =>
installSkipReason(t, a) })` call; the target is listed for every id in its `ids`. Target order is the order passed
  in. `deprecated` is `frontmatter.deprecated.reason` when set.
- `renderArtifactIndex(rows: ArtifactIndexRow[], targets: Target[]): string`. Output, with no timestamp so it is
  deterministic:
  - `# Artifact index`, a generated-file notice (`<!-- Generated by npm run build (src/emit-artifact-index.ts). Do not edit. -->`),
    a back-link line like `docs/reference/capabilities.md`'s, one sentence on what the page lists, the install note from
    the Decisions table, a line naming the tools by `displayName ?? name`, and a contents line linking each kind's H2.
  - Per kind present: `## <kindPlural>` (from `src/select/vocabulary.ts`) and a table
    `| Artifact | Description | Packs | Tools | Install |`. Artifact: ``[`<id>`](../../<sourcePath>)``.
    Description: the description, with `|` escaped as `\|` and any newline replaced by a space, prefixed with
    `**Deprecated:** <reason>. ` when deprecated. Packs: names joined with `, `, or `—`. Tools: target names joined with
    `, `, or `—`. Install: `` `sigil add <kind>:<id>` ``, or `—` when `targets` is empty.
  - Ends with one newline.

Test (`test/artifact-index.test.ts`, real catalog through `test/helpers/catalog.ts`):

- Every non-template artifact has exactly one row; no `template` row.
- Every row's `sourcePath` exists on disk under the repo root.
- A `dotnet-tooling` member has `dotnet-tooling` in `packs` (a `languages:` pack is listed).
- `shared/author-artifact` has `essentials` in `packs`.
- Every `rule` with `language: csharp` lacks `antigravity` in `targets` when its `appliesTo` is not repo-wide
  (matches the cleanup plan's item 7: `add` skips them), and has `claude-code` in `targets`.
- For every target and row: the target is listed iff `resolveSelection` for `<kind>:<id>` alone on that target returns
  the id (a cross-check of the `all` shortcut against a single-artifact install).
- Render of a hand-built row whose description is `a | b\nc` gives the cell `a \| b c`; a row with no targets renders
  `—` in Tools and Install; a deprecated row starts its description with `**Deprecated:**`.
- Two renders of the same rows are byte-identical.

## Step 4 `[worker:medium]`: `npm run build` writes and commits `docs/reference/artifacts.md`

Files: new `src/emit-artifact-index.ts`, `package.json` (`build` script), `.prettierignore`,
`docs/reference/artifacts.md` (generated), `test/artifact-index.test.ts`.

`src/emit-artifact-index.ts` follows `src/emit-catalog-readme.ts`: resolve the catalog dir and `packs.yaml` from the
package root, load and validate them the way `src/commands/index.ts:23-24` does (`loadAndValidate`, `resolveCatalog`),
call `buildArtifactIndex` + `renderArtifactIndex` with the scaffold targets, write `docs/reference/artifacts.md`, and
print `  ✓ docs/reference/artifacts.md`. Append `&& node dist-cli/emit-artifact-index.js` to the `build` script. Add the
file to `.prettierignore` under the generated-files comment beside `capabilities.md`. Run `npm run build` and commit the
generated page.

Test, added to `test/artifact-index.test.ts`: the committed `docs/reference/artifacts.md` equals a fresh render
(message: run `npm run build` to regenerate), as `test/catalog-readme.test.ts` does.

Check: `npm run build` prints the new line; `npm run format:check` passes; the page is under 100 KB.

## Step 5 `[inline: user-facing copy and doc close-out]`: link the page and close the brief

Files: `README.md`, `src/catalog-readme.ts` (and regenerated `catalog/README.md`), `docs/index.md`, `CHANGELOG.md`,
`docs/decisions/ui-beyond-terminal-2026-11.md`, `docs/ideas/README.md`, `docs/ideas/artifact-index.md` (deleted).

- `README.md`: link the index where it points at capabilities (`README.md:199`).
- `catalog/README.md`: a link line generated by `renderCatalogReadme`; `npm run build` regenerates it.
- `docs/index.md`: a reference-table row for `reference/artifacts.md` (generated), and row S8 links it instead of the
  brief.
- `CHANGELOG.md` `[Unreleased]` `### Added`: the index.
- Close-out per `docs/ideas/README.md`: the decisions above go into the decision record as a short "Built" section; the
  brief is deleted and its row removed.

Check: `npm run ci:local` green; every new link resolves (`npm run validate` and a grep for `ideas/artifact-index`
returning nothing outside `CHANGELOG.md`).
