# Catalog Deep Review — July 2026

This document records decisions, rationale, and rejected alternatives for the
full catalog remediation performed in the 2026-07 session.

---

## Scope

The session addressed four broad concerns:

1. **Naming standardization** — prefix alignment, python rename, csharp dedupe (Phase 1)
2. **`language.yaml` glob corrections** — add missing file extensions per language (Phase 2)
3. **Cross-reference / Boundary redesign** — eliminate dangling catalog IDs from installed files (Phase 3)
4. **`uses` / `extends` wiring + title/description polish** (Phase 4)
5. **Import-tool hardening** — validate-before-write, prefix configurable, acronym map (Phase 5)
6. **Generated catalog registry** — `dist/registry.json` + `sigil index` command (Phase 6)

Phases 7–9 (expanded validator, `sigil doctor`, docs/tests sync) are deferred.

---

## Phase 3 — Cross-reference / Boundary redesign

### Problem

Every agent embedded a `## Boundary` section in its body naming sibling catalog IDs
(`cs-security-auditor`, `cs-architecture-reviewer`, …). When a user installed one agent
without its siblings, the installed `.claude/agents/` file referenced artifacts that do
not exist — internal catalog IDs leaking into the consumer project as dangling references.
Renaming an agent required hand-editing prose in N other files.

### Decision: structured `relatedArtifacts` + conditional rendering

Three alternatives were considered:

| Alternative                             | Pros                                                  | Cons                                                  | Decision   |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ---------- |
| Keep hard-coded body prose              | Zero change                                           | Dangling refs; ID leakage; manual maintenance         | Rejected   |
| Remove Boundary entirely                | Simplest; self-contained                              | Loses specialist-routing intelligence for multi-agent | Rejected   |
| `relatedArtifacts` + conditional render | Machine-readable; no dangling refs; routing preserved | More schema surface                                   | **Chosen** |

**Design implemented:**

1. **Schema** (`src/schema/index.ts`): optional `relatedArtifacts?: { id, relation, reason }[]`
   added to `AgentSchema`, `RuleSchema`, `SkillSchema`. `relation ∈ { escalates-to, complements, see-also }`.

2. **Adapters render conditionally** (`src/targets/claude-code/`, `src/targets/copilot/`):
   - Plugin build: all pack artifacts are co-present → Boundary always renders for co-present siblings.
   - Scaffold (`sigil add`): `coInstallSet?: Set<string>` threaded through `ScaffoldOptions` →
     Boundary rendered only for artifacts in the co-install set. No `coInstallSet` → no Boundary section.
   - This eliminates dangling refs by construction.

3. **Body migration** (`scripts/migrate-related-artifacts.mjs`): 22 agents migrated.
   `## Boundary` sections stripped from bodies; sibling IDs moved to `relatedArtifacts` frontmatter.
   Descriptions cleaned of inline catalog ID references.

4. **Reference integrity**: `src/authoring/check-source.ts` validates every `relatedArtifacts[].id`
   exists in the catalog — same checker used for `uses.rules` / `uses.agents`.

### Relationship graph encoded

Three relation types:

- `escalates-to` — delegate this category of work to the sibling (primary specialist)
- `complements` — distinct scope, same peer tier
- `see-also` — cross-kind reference (agent → skill, e.g. `cs-security-auditor` → `csharp/cs-audit-deps`)

---

## Phase 4 — `uses` / `extends` wiring + polish

### `extends`

`shared/clean-code` wired as `extends` base on all language `*-code-quality` rules
(`cs-code-quality`, `ts-code-quality`, `ng-code-quality`). This ensures the DRY resolution
in `resolve.ts` prepends the shared clean-code body to language-specific quality rules.

### `uses` wiring

All `*-generate-tests` skills already had `uses.rules` wired at import time. In this session:

- `uses.agents` confirmed wired: `cs-generate-tests` → `cs-code-reviewer`, similarly for ts/ng.
- `*-audit-deps` skills confirmed: `uses.rules` + `uses.agents` already fully wired.

### Title fixes

- `ng-rxjs` rule: `title: Rxjs (Angular)` → `title: RxJS (Angular)` (pre-existing in catalog;
  the importer now produces this correctly via the ACRONYM_MAP added in Phase 5).
- `cs-api-compat-reviewer` / `ts-api-compat-reviewer` / `ng-api-compat-reviewer`:
  `Api Compat Reviewer` → `API Compatibility Reviewer`.

---

## Phase 5 — Import-tool hardening

### Validate-before-write (`src/authoring/import/execute.ts`)

**Problem**: the old flow was write → validate. If validation found issues, the file was
already on disk. The user had to manually delete it, fix the source, and re-run.

**Fix**: render content in memory → parse with gray-matter → construct virtual `Artifact`
(using `destPath` as the filePath, which `checkSourceArtifact`'s path analyzer needs) →
run `checkSourceArtifact` → only write to disk if clean. Error items are now skipped without
touching disk; the exit code is non-zero only if items failed validation.

**Old helper** `makeArtifactFromFile(filePath)` (reads from disk) replaced by
`makeArtifactFromContent(content, filePath)` (parses in memory).

### `sigil move` serialization bug (`src/authoring/frontmatter.ts`)

**Bug**: `serializeYamlEntry(key, val)` when `val` is an object calls `serializeScalar(iv)` on
each entry value. `serializeScalar` calls `String(array)` for array values, which produces
comma-joined CSV (`'csharp/cs-testing'` for a single-element array, `'a,b'` for two). This
corrupted `uses.rules` / `uses.agents` whenever `sigil move` rewrote a referrer with a
single-item array.

**Fix**: in the object branch of `serializeYamlEntry`, check if `iv` is an array before calling
`serializeScalar`. Arrays render as indented block sequences (`- item`), empty arrays as `[]`.

### Configurable prefix stripping (`src/authoring/import/translate.ts`)

**Old**: `slug.replace(/^(cs|ng|ts)-/, '')` hard-coded in both `slugToTitle` and `tagsFromSlug`.

**Fix**: `LANGUAGE_PREFIXES` map + `stripLanguagePrefix(slug, language)` function.
`slugToTitle` now accepts an optional `language` parameter; when provided, uses `stripLanguagePrefix`
instead of the fallback regex (kept for backward compatibility).

**Benefit**: adding a new language (e.g. `go`) requires only one entry in `LANGUAGE_PREFIXES`,
not two regex changes. Also surfaces a prefix mismatch (slug prefix ≠ language canonical prefix)
via natural fallback behavior.

### Acronym map (`src/authoring/import/translate.ts`)

New `ACRONYM_MAP` in `slugToTitle` applies before Title-Casing:

| Slug word | Output  |
| --------- | ------- |
| `rxjs`    | `RxJS`  |
| `api`     | `API`   |
| `http`    | `HTTP`  |
| `https`   | `HTTPS` |
| `cli`     | `CLI`   |
| `sql`     | `SQL`   |
| `ui`      | `UI`    |
| `ux`      | `UX`    |
| `nuget`   | `NuGet` |
| `sdk`     | `SDK`   |
| `orm`     | `ORM`   |

The `ng-rxjs` title regression (`Rxjs` → `RxJS`) is now fixed at the importer level.

### `descriptionSynthesized` flag (`src/authoring/import/translate.ts`)

`TranslateResult` now carries `descriptionSynthesized?: boolean`. Set to `true` when the
source had no description and a generic fallback was used. Propagated through `ImportItem`.
The coverage report in `cli.ts` marks these with `⚠ generic description` and prints a
summary count with a `sigil patch` hint.

### Cross-language overlap report (`src/cli.ts` import command)

After building the plan, the import command loads the catalog and compares each incoming
artifact's topic slug (prefix-stripped) against existing catalog artifacts in other languages.
Same-topic matches are surfaced under `── Cross-language overlaps ──` so authors know when
they're importing something that parallels a ts- artifact into csharp, for example.

### Inline `require('fs')` fix (`src/authoring/import/plan.ts`)

Replaced `require('fs').existsSync(destPath)` with a top-level `import fs from 'fs'`.

### Dry-run validation (`src/cli.ts` import command)

In `--dry-run` mode, after printing the frontmatter preview, the importer now also runs
`checkSourceArtifact` on the rendered content (in memory, same path as validate-before-write)
and prints any violations as `✗ validation: <problem>`. This closes the gap where dry-run
would show correct-looking YAML that would fail validation at write time.

---

## Phase 6 — Generated catalog registry

### Design

New module `src/registry.ts` — pure function `buildRegistry(catalog, version, timestamp)` →
`Registry` object. No I/O in the module; I/O in callers.

Per-artifact record:

```json
{
  "id": "csharp/cs-generate-tests",
  "kind": "skill",
  "language": "csharp",
  "title": "Generate Tests (.NET / C#)",
  "description": "...",
  "tags": [...],
  "relatedArtifacts": [...],
  "uses": { "rules": [...], "agents": [...] },
  "platforms": ["claude", "copilot"],
  "version": "0.1.0",
  "sha256": "<sha256-of-source-file>"
}
```

Facet sidecar: sorted deduplicated lists of `kinds`, `languages`, `tags`.

`sha256` is computed from the artifact's source file content (`fs.readFileSync` → sha256).
Stable across builds for unchanged files.

### Integration

- `sigil build` now always emits `dist/registry.json` after building all targets.
- `sigil index` command added as a standalone way to regenerate without a full build.
  Supports `--json` to print to stdout (for piping into `jq`).

### Platforms field

If `frontmatter.platforms` is declared explicitly, it is respected verbatim. Otherwise,
`artifactTargetsPlatform(artifact, name)` is called for every registered target to derive
which platforms the artifact targets. This mirrors the behavior of `sigil build`'s
`filterForTarget` call.

---

## Verification

All sessions ended with:

- `npm run validate` → ✓ All 94 artifact(s) valid
- `npm run catalog:build` → ✓ 70 + 65 + registry.json (94 artifacts)
- `npm test` → 347/347 passing, 0 failures
- `npm run lint` → no issues in modified files
