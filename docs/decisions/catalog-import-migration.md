# Decision Log: `_Others` Catalog Import Migration

**Date:** 2026-07-24  
**Status:** Complete (mechanical import done; content-refinement pending)  
**Artifacts produced:** 77 new catalog entries (25 csharp · 25 typescript · 27 angular)

---

## Background

Three portable Claude Code template directories lived under `_Others/` — `.ClaudeDotNet` (`cs-`
prefix), `.ClaudeTypescript` (`ts-`), `.ClaudeAngular` (`ng-`). Each follows the standard
portable-template layout (`rules/*.md`, `agents/*.md`, `skills/*/SKILL.md`) and was used by copying
directly into a project's `.claude/`. The goal was to fold them into the structured `catalog/`
source tree as first-class, schema-validated, installable artifacts, and in the process to validate
and ship a reusable `sigil import` command for future similar migrations.

---

## Locked Decisions

### D1 — Keep the author prefix in IDs and names

**Decision:** `cs-debugger` → `id: csharp/cs-debugger`, `name: cs-debugger`. The prefix is
preserved in the name-segment, not stripped.

**Rationale:** Stripping the prefix (→ `csharp/debugger`) risks install collisions when a user
installs multiple languages. Installing `typescript/debugger` and `csharp/debugger` would both write
to `.claude/agents/debugger.md` and clobber each other. Keeping `cs-debugger` / `ts-debugger` /
`ng-debugger` ensures each language's artifacts have distinct file names on disk. This is
schema-valid: the `name` field on agents and skills must equal the id's name-segment, and
`cs-debugger` is valid kebab-case.

**Alternative rejected:** Strip prefix for cleaner IDs. Rejected because install-collision
prevention outweighs ID aesthetics. Polish is a content-refinement concern.

---

### D2 — Extend the skill schema losslessly

**Decision:** Add three optional fields to `SkillSchema` in `src/schema/index.ts`:
`allowedTools?: string[]`, `argumentHint?: string`, `disableModelInvocation?: boolean`. The Claude
Code adapter emits these as `allowed-tools`, `argument-hint`, and `disable-model-invocation`. The
Copilot adapter ignores them (namespace-skip pattern).

**Rationale:** Source skills carry `allowed-tools` / `argument-hint` / `disable-model-invocation`
frontmatter. Dropping these would silently lose behavioral metadata (tool restrictions, usage hints,
the no-invocation flag used by `cs-release` / `ts-release` to force scaffolding-only mode). Lossless
import is the baseline contract. The schema fields are optional so every existing skill continues to
validate unchanged.

**Alternative rejected:** Fold `when_to_use` into `description` as a joined string. Rejected because
multi-line YAML string values embedded in a double-quoted scalar (`"...\n\nWhen to use: ..."`) break
YAML parsers. Fix applied: `when_to_use` is prepended to the body as a `## When to Use` section via
`bodyPrefix` in `TranslateResult`, keeping `description` single-line.

---

### D3 — Angular = framework, TypeScript = language; distinct catalog dirs

**Decision:** Angular lives at `catalog/languages/angular/` with globs `**/*.ts`, `**/*.html`,
`**/*.component.ts`, `**/*.directive.ts`. TypeScript lives at `catalog/languages/typescript/` with
globs `**/*.ts`, `**/*.tsx`, `**/*.mts`, `**/*.cts`. They are modeled as separate languages in the
catalog even though Angular is technically a TypeScript framework.

**Rationale:** Angular's rule set covers Angular-specific concepts — `ng-components`, `ng-rxjs`,
`ng-signals`, `ng-templates` — that have no equivalent in generic TypeScript. Its agents include
`ng-template-reviewer` and `ng-api-compat-reviewer` scoped to Angular's public API and template
compilation model. Its skills include `ng-generate-component` (scaffolds `.component.ts` /
`.html` / `.spec.ts` triads). These are genuinely Angular-specific, not TypeScript sub-cases.

**Overlap acknowledged:** Both language sets share the same topic structure (async, code-quality,
conventions, dependencies, documentation, git, logging, security, testing). This structural
similarity is intentional (the template author designed them in parallel) but the content is
specialized per language/framework. Assessing and possibly deduplicating topic-level overlap (e.g.
`ng-testing` vs `ts-testing`) is deferred to the content-refinement stage — see Open Follow-ups.

**Alternative rejected:** Nest angular artifacts under `typescript/`. Rejected because the Angular
runtime, compiler, and ecosystem differ enough from vanilla TypeScript that a unified namespace would
mislead consumers installing a "typescript" pack and receiving Angular-only rules. The catalog's
`language` axis is the only namespacing mechanism; it must represent the actual constraint.

---

### D4 — Import is mechanical; content quality is a separate concern

**Decision:** `sigil import` is a deterministic translator — it discovers files, classifies by kind,
translates frontmatter field-by-field, assigns catalog IDs, and runs schema validation. It makes no
AI-assisted judgments about titles, dependencies, or deduplication. Dep wiring (`uses.rules/agents`),
title polish, `extends` chain connections, and topic overlap review are content-refinement work
handled afterward with `sigil patch`.

**Rationale:** Mixing deterministic translation with heuristic judgment in one command:

- Makes dry-run output unpredictable (different inference runs → different results)
- Breaks the "CI-safe" property (non-deterministic)
- Conflates schema validity (testable) with content quality (subjective)

The `--dry-run` coverage report is the probe: if it shows 0 unclassified files and 0 dropped fields,
the mechanical mapping is complete and the import is ready to execute. Any remaining quality concerns
(prose, deps, overlap) are addressed with the existing CRUD commands.

**Alternative rejected:** AI-driven import that infers `uses` deps and rewrites titles. Rejected for
the reasons above. This capability is better implemented as a thin `import-catalog` Claude skill that
calls `sigil import --dry-run`, reads the coverage report, then applies judgment via `sigil patch` —
quality on top of a validated base. Not shipped now; marked as future work.

---

## Bugs Found and Fixed During Import (Autonomous Self-Review)

The import was first run in `--dry-run` mode. Three bugs were found and fixed before the real write.
Two additional bugs emerged during real-write execution (YAML compliance issues not visible in
dry-run preview because the preview didn't re-parse output through gray-matter).

### Bug 1 — `appliesTo` glob values had extra inner quotes

**Symptom:** Source files list `paths:` items as `- "**/*.cs"` (YAML-quoted). The discover parser
preserved the surrounding quotes, so values became `"**/*.cs"` (string with inner quotes).
`serializeYamlEntry` then double-quoted the already-quoted string, producing `- """**/*.cs"""`.

**Fix (discover.ts):** After collecting list items, strip surrounding single or double quotes:

```
if (item.startsWith('"') && item.endsWith('"')) item = item.slice(1, -1);
```

### Bug 2 — `uses: { rules: [], agents: [] }` serialized as empty lines

**Symptom:** `serializeScalar([])` calls `String([])` → `""` (empty string). The object branch of
`serializeYamlEntry` produced `uses:\n  rules: \n  agents: ` (blank values) which is invalid YAML.

**Fix (plan.ts):** Special-cased the `uses` block in `renderArtifactFile` with a hardcoded renderer:

```
uses:\n  rules: []\n  agents: []
```

For non-empty deps (content-refinement stage), uses an indented block sequence:

```
uses:\n  rules:\n    - <ref>\n  agents:\n    - <ref>
```

### Bug 3 — `when_to_use` folded into description as multi-line string

**Symptom:** `translateSkill` joined `sourceDescription` and `when_to_use` with `\n\n`. The result
was a string with literal newlines, which `serializeScalar` tried to double-quote as
`"text\n\nWhen to use: ..."` — YAML double-quoted scalars cannot contain literal unescaped newlines.

**Fix (translate.ts):** Description stays single-line (catalog `description` is a short inline
summary). `when_to_use` is prepended to the body as a `## When to Use` section via a new
`bodyPrefix?: string` field in `TranslateResult`.

### Bug 4 — Unquoted glob patterns in YAML (`**/*.cs` reads as YAML alias)

**Symptom:** Real-write `checkSourceArtifact` failed with `unidentified alias "*/*.cs"`. The YAML
spec treats `*` at the start of a scalar value as an alias anchor reference.

**Fix (frontmatter.ts — `serializeScalar`):** Added `val.startsWith('*')` to the quoting predicate.
Globs like `**/*.cs` are now emitted as `"**/*.cs"`, matching the style already used in hand-authored
catalog files (e.g. `catalog/languages/csharp/rules/dotnet-style.rule.md`).

### Bug 5 — `[file-or-class]` argument hint read as YAML flow sequence

**Symptom:** After the `*` fix, gray-matter failed with `"can not read a block mapping entry"` on
files whose `argumentHint` started with `[`. The YAML spec treats `[` at the start of a scalar as a
flow sequence literal.

**Fix (frontmatter.ts — `serializeScalar`):** Added `val.startsWith('[')` and `val.startsWith('{')`:

```
val.startsWith('*') ||  // glob: **/*.cs → YAML alias
val.startsWith('[') ||  // flow sequence: [optional] → YAML array
val.startsWith('{')    // flow mapping
```

### Bug 6 — Duplicate-id false positive on `--overwrite` (path separator mismatch)

**Symptom:** When re-importing with `--overwrite`, `checkSourceArtifact` reported
`Duplicate id 'csharp/cs-api-compat-reviewer'` for the agent that was being overwritten. The file
path in the catalog used forward slashes (from the `path.normalize` in `loadCatalog`) while
`item.destPath` used backslashes (from `path.join` on Windows). String equality check failed:
`"C:/WorkspaceMaku/…"` ≠ `"C:\WorkspaceMaku\…"`.

**Fix (check-source.ts):** Normalize both paths to forward slashes before comparing:

```typescript
const normExisting = existing.filePath.replace(/\\/g, '/');
const normArtifact = artifact.filePath.replace(/\\/g, '/');
if (normExisting !== normArtifact) {
  /* report duplicate */
}
```

---

## Source→Catalog Frontmatter Mapping

| Source field                          | Catalog field                     | Notes                                                         |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `description` (rule)                  | `description`                     | Single-line                                                   |
| `paths` (rule)                        | `appliesTo`                       | Default `['**/*']` if absent                                  |
| _(synthesized)_                       | `severity: recommended`           | All imported rules                                            |
| _(synthesized)_                       | `extends: []`                     | Empty; `extends: [shared/clean-code]` wired in quality stage  |
| `name` (agent)                        | `name`                            | Kept verbatim incl. prefix                                    |
| `tools` (agent, comma string)         | `tools` (array)                   | Split on `,` + trim                                           |
| `description` (agent/skill)           | `description`                     | Single-line only                                              |
| `when_to_use` (skill)                 | _(body prefix)_                   | Prepended as `## When to Use` section                         |
| `allowed-tools` (skill, comma string) | `allowedTools` (array)            | New schema field                                              |
| `argument-hint` (skill)               | `argumentHint`                    | New schema field                                              |
| `disable-model-invocation` (skill)    | `disableModelInvocation`          | New schema field                                              |
| _(synthesized)_                       | `uses: { rules: [], agents: [] }` | Empty; wired in quality stage                                 |
| _(synthesized)_                       | `id: <lang>/<slug>`               | Language prefix + source slug                                 |
| _(synthesized)_                       | `title`                           | slugToTitle: strip prefix, Title Case, append `(DisplayName)` |
| _(synthesized)_                       | `tags`                            | Language + slug words                                         |

**Files with no frontmatter** (body-only markdown): `cs-code-quality.md`, `cs-git.md`. These
received synthesized descriptions (`".NET / C# coding conventions and style guidelines."`). The body
is correct. Descriptions should be refined in the quality stage.

---

## Import Command Decisions

### `sigil import` vs. `import-catalog` Claude skill

**Recommendation adopted:** Layered, command-first. The deterministic `sigil import` is the contract
(schema-valid, CI-safe, `--dry-run` coverage report). A Claude skill can be layered on top later to
add judgment (title polish, dep inference, dedup) via `sigil patch` on the validated base. This
mirrors the wizard-vs-flags split in `add`/`new`.

**Why not skill-first:** A skill that produces file writes is non-deterministic and untestable. An
import that fails silently on malformed source (no schema validation) provides no confidence. The
mechanical baseline is the contract; quality is optional additional work.

### `--create-language` flag

**Decision:** When the target language dir doesn't exist, `--create-language` creates a minimal
`language.yaml` with the correct `displayName` and `globs`. Without this flag, import fails if the
language dir is missing. This is intentional: most imports will be to existing languages; the flag
makes the new-language case explicit.

### Source files with no frontmatter

**Decision:** Files with no `---` frontmatter block (like `cs-code-quality.md`, `cs-git.md`) are
imported with synthesized frontmatter. Their body is preserved verbatim. This is correct because:
the source files use a body-only style for some rules (all content is markdown, no YAML header).
The importer's fallback descriptions are placeholder text for the quality stage.

---

## Open Follow-ups (Content-Refinement Stage)

These are explicitly not part of the mechanical import. They require human/AI judgment:

1. **Wire `uses` dependencies** via `sigil patch <id> --set-uses.rules=[...] --set-uses.agents=[...]`.
   For example: `cs-generate-tests` → `uses.rules: [csharp/cs-testing]`,
   `uses.agents: [csharp/cs-code-reviewer]`.

2. **Set `extends: [shared/clean-code]`** on base rules like `cs-code-quality`, `ts-code-quality`,
   `ng-code-quality` via `sigil patch`.

3. **Polish `title` values** for any slugToTitle outputs that are awkward (e.g. `Rxjs (Angular)` →
   `RxJS (Angular)`).

4. **Fix fallback descriptions** for `cs-code-quality`, `cs-git` (no source description available).

5. **Review Angular/TypeScript overlap.** Both have matching rule topics (async, testing, security,
   etc.). After reading both, delete any that are genuine copies and keep only the Angular-specific
   version. Use `sigil delete` + update pack references if any rules are removed.

6. **Review `ng-api-compat-reviewer` scope.** Angular's API compat context (component inputs,
   signals, lifecycle hooks) differs from generic TypeScript's (exports map, module types). Confirm
   the body is sufficiently Angular-specific.

7. **Add `typescript-starter` to `dotnet-starter`-style `uses` wiring** once dep wiring (item 1)
   is complete, so the wizard's deps preview shows the correct rule/agent closure.

---

## Files Changed

**Schema + adapters:**

- `src/schema/index.ts` — added `allowedTools`, `argumentHint`, `disableModelInvocation` to `SkillSchema`
- `src/targets/claude-code/plugin-build.ts` — emit new skill fields in plugin SKILL.md
- `schema/skill.schema.json` — regenerated (auto, `npm run build`)

**Import command:**

- `src/authoring/import/discover.ts` — custom frontmatter parser (tolerates unquoted colons in descriptions)
- `src/authoring/import/translate.ts` — pure per-kind frontmatter translator; `bodyPrefix` for `when_to_use`
- `src/authoring/import/plan.ts` — destination path + file renderer; fixed `uses` block serialization
- `src/authoring/import/execute.ts` — write + per-file `checkSourceArtifact`
- `src/authoring/import/index.ts` — barrel exports
- `src/cli.ts` — `sigil import <source-dir>` command wiring

**Bug fixes in shared utilities:**

- `src/authoring/frontmatter.ts` — `serializeScalar`: quote `*`, `[`, `{` at start of value
- `src/authoring/check-source.ts` — duplicate-id check: normalize path separators before comparing

**New catalog content:**

- `catalog/languages/typescript/language.yaml`
- `catalog/languages/angular/language.yaml`
- `catalog/languages/csharp/rules/cs-*.rule.md` (×11)
- `catalog/languages/csharp/agents/cs-*.agent.md` (×7)
- `catalog/languages/csharp/skills/cs-*/SKILL.md` (×7)
- `catalog/languages/typescript/rules/ts-*.rule.md` (×11)
- `catalog/languages/typescript/agents/ts-*.agent.md` (×7)
- `catalog/languages/typescript/skills/ts-*/SKILL.md` (×7)
- `catalog/languages/angular/rules/ng-*.rule.md` (×12)
- `catalog/languages/angular/agents/ng-*.agent.md` (×8)
- `catalog/languages/angular/skills/ng-*/SKILL.md` (×7)

**Packs:**

- `packs.yaml` — added `dotnet-tooling`, `typescript-starter`, `typescript-tooling`, `angular-starter`, `angular-tooling`
