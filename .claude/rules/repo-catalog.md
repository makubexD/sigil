---
paths:
  - 'catalog/**'
  - 'packs.yaml'
  - 'src/catalog-standard.ts'
  - 'src/catalog-readme.ts'
  - 'src/catalog-vocabulary.ts'
  - 'src/load-references.ts'
  - 'src/stack-index.ts'
  - 'src/commands/sync/conformance/**'
---

# Catalog families and layout

Moved from the root `CLAUDE.md`, which keeps a one-line hard rule for each; this file loads only for the paths above.

- **One family, one skeleton.** Every agent, rule and skill (shared ones too, except the `bases` other rules
  extend) belongs to exactly one family in `catalog/standard.yaml` (explicit members, optional ordered H2 `sections`,
  the exact `keys`, a `title`, the `references` members carry by role, `absent` gaps, one `severities` scale for
  report tier headings). Members also load rules and agents from the same families (`uses`). A skill is `SKILL.md`
  only unless its family declares references; a skill's `stack-<id>.md` files share one H2 skeleton. The data is read
  only through `src/catalog-standard.ts` by `sync --check` rules (and rewritten as text by `sigil move`) — never by
  consumer commands. Structure is
  data there, not a template: `family-skeleton` fails `--check` when a member drifts. A `template:` holds shared prose
  only, added after measuring real overlap with at least three concrete duplicates (three ship:
  `mcp-note`, `code-quality`, `release-skill`). Never rename an id to fit a family; list it as a member. Each
  `language.yaml` names its `prefix` and `stack`; stacks are declared once in `standard.yaml` (`catalog-layout`
  checks both). `catalog-symmetry` reads families from the data. `catalog/README.md` is generated from it by
  `npm run build` (`src/catalog-readme.ts`); `test/catalog-readme.test.ts` fails when it is stale. (see
  `docs/decisions/family-skeleton-standard-2026-10.md`)
- **Where an artifact goes is one rule**: no language variation → `shared/`; varies with the project's language →
  `languages/<lang>/` (the only option for a language-varying agent or rule — neither loads references on demand);
  varies with a stack the task chooses → one neutral shared skill, its per-stack text in stack parts
  (`languages/<home>/stack-parts/<skill>.md`, `home` per stack in `standard.yaml`) that the loader turns back into
  `references/stack-<stack>.md` (`stackPartsBySkill` in `src/load-references.ts`, also what `import` must use;
  `sigil move` renames them). `shared/` never holds stack text; `SKILL.md` lists the parts with `<!-- stack-index -->`,
  which resolve fills from each part's H1 (`src/stack-index.ts`). Tie → per-language. Group with `packs.yaml`, never topic folders; references stay one level deep. `catalog-layout`
  (`src/commands/sync/conformance/rules/catalog-layout.ts`) fails `sync --check` on placement and skill-folder
  violations, and on the vocabulary checks in `src/catalog-vocabulary.ts`; it is author-only and adds nothing to `validateCatalog`. (see
  `docs/decisions/catalog-layout-standard-2026-10.md`)
