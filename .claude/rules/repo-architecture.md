---
paths:
  - 'src/**'
---

# Architecture

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

## 4-stage pipeline

```
catalog/      →  [1] load.ts      →  LoadedCatalog
              →  [2] validate/    →  ValidationResult (exits on errors)
              →  [3] resolve.ts   →  ResolvedCatalog  (extends/uses expanded)
              →  [4] targets/<x>  →  FileMap (relative path → content)
                                         ↓ written to dist/<target>/
```

The registry lives in `src/targets/index.ts` — adding a platform is one new file plus one `registerTarget()` call (see
`docs/reference/architecture.md` § Extension model for the steps).

## DRY resolution (resolve.ts)

- **`extends` (rules only):** walks the `extends` graph and prepends each ancestor's body oldest-first.
  `csharp/cs-conventions extends shared/clean-code` → emitted body is `clean-code body \n\n dotnet-style body`. Never
  duplicate rule text in source.
- **`uses` (skills only):** maps `uses.rules` IDs to fully-resolved rule bodies (`resolvedRules[]`) and records
  `uses.agents` as `resolvedAgentIds[]`. Adapters consume these.

## Two Claude delivery modes

Claude Code plugins cannot ship loose rules, so `build` (`dist/claude/`) inlines rules into each SKILL.md while `add` /
`init` write `.claude/rules/<slug>.md`; the per-adapter table is in
[docs/reference/spec.md](docs/reference/spec.md#uses-skills-only) (Reuse mechanisms).

## Templates + emit specs (the source-of-truth layer)

Body structure is never hand-copied across sibling artifacts. A `kind: template` artifact
(`catalog/shared/templates/*.template.md`) holds shared prose with `<!-- slot: key -->` markers; an artifact opts in
with `template: <id>` and supplies only slot content. `src/templates.ts` composes it in `resolve.ts`, before
`extends`, producing `ResolvedArtifact.resolvedBody` plus unflattened `resolvedSlots` /
`resolvedAncestorBodies`. Never paste template prose back into an artifact body — `validate` flags it.

Every (provider, kind) rendering is a data-only `KindEmitSpec` (`src/targets/<provider>/spec/<kind>.ts`) run through
the one `renderArtifact()` (`src/targets/emit.ts`) and written by the one `emit-files.ts` (`emitFile` / `scaffoldArtifact`).
**A whole-file path comes only from `spec.outputPath`** — never build one in a target (`test/targets/emit-files.test.ts`). **`contracts.ts` under each `targets/<provider>/` is derived from
that provider's `KindEmitSpec[]` via `deriveContracts()`, never hand-written.** A `docs:` citation must name the
provider's canonical home for the artifact, and cite both consumers when two products read the same emitted file.
`KindEmitSpec.supersededBy` is an advisory `sigil sync` notice, never a `--check` failure. Shipped targets do not use
`Target.frontmatterExtensions`, which is known debt (the list is in
[architecture.md](docs/reference/architecture.md#extension-model)). `settings` stays flagged
`KindDescriptor.ownedBy` until a second target supports it. Mechanics:
[architecture.md](docs/reference/architecture.md).

**`sigil sync`** (`src/commands/sync/`) is catalog-author tooling: `--check` for CI, `--apply` for mechanical fixes
(new, renamed, or reordered slots, and hoisted-prose deletion). Drift detection is live in `analyze.ts` (filled slots
against the template's current `slots:` and prose). There is no stored hash or per-artifact revision bookkeeping.

**Artifact retirement is `deprecated:` on `BaseFields`** (`src/schema/shared.ts`): `{ since, reason, supersededBy? }`,
never a hard delete. A deprecated artifact stays resolvable so existing `uses:` / `extends:` references and installs
keep working. `validate` warns, and never errors, when a live artifact depends on one. **`sigil prune`**
(`src/commands/prune.ts`) previews by default; `--apply` removes orphaned manifest entries (ids gone from the catalog)
and reports deprecated-but-installed ones with `supersededBy`. Removal reuses `removeEntries`
(`src/manifest/mutate-remove.ts` — the same function `uninstall.ts` calls), plus `reverseMergeConfigEntries` and the
same drifted-file protection.

**`outdated` means "`sigil update` would rewrite this", in every view.** `src/freshness.ts` holds the one
render (`renderFresh`: the overlaid catalog plus the installed set, without which a Boundary section drops) and
the config ops `update` writes with (`catalogConfigOps`, `changedCatalogOp`). `staleEntries` applies update's checks
and is the only source of `outdated` in `sigil status` and the install states (`add`, the wizard), besides a moved
config file. It skips entries whose overlay was refused, as `update` does. A template revision alone is never
outdated (`update` writes nothing when the render is unchanged); it only names the reason (`template <id> rev
<old>→<new>`, stamped at install from `currentTemplateOf` in `src/manifest/template-of.ts`). `status` never writes. Propagation is `sigil update`. `sigil sync` is the catalog-author command, not the consumer one.

`errors.ts` / `cli-error.ts` are the single error type and the one `process.exit`. `kinds.ts` holds `KIND_REGISTRY`.
`wizard/` has its own guide, `src/wizard/CLAUDE.md`.
