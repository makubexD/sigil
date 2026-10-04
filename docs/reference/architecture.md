# Architecture

> **Back to:** [README](../../README.md) · [Documentation index](../index.md)
> **Specification:** [spec.md](spec.md)

## Extension model

Three independent axes, each with exactly one owner. Scaling to a new language, a new platform, or a
new kind is additive in every case — none of them requires editing another axis's files.

| Axis                                       | Owner                                                                     | Scales by                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Kind** (what an artifact _is_)           | `KIND_REGISTRY` (`src/kinds.ts`) + one zod schema (`src/schema/index.ts`) | one registry entry per new kind                                                                   |
| **Provider** (where it goes)               | `registerTarget()` + `src/targets/<provider>/`                            | one directory per new provider                                                                    |
| **Kind × Provider** (how it renders there) | `src/targets/<provider>/spec/<kind>.ts`                                   | one small file per `native` (kind, channel) pair; support itself is declared in `capabilities.ts` |

Two extension points keep the axes from leaking into each other — see them worked through below:
**frontmatter namespaces** (a provider's own fields never touch the neutral schema) and **template
slots** (a provider can rearrange a body without a catalog-side change).

### Adding a language

1. Create `catalog/languages/<lang>/language.yaml`.
2. Add skills, rules, and agents under `catalog/languages/<lang>/`.
3. Add a pack entry to `packs.yaml`.
4. Run `sigil validate && sigil build`.

Where an artifact sits is read relative to the catalog root (`src/catalog-layout.ts`):
`shared/<kindDir>/…` or `languages/<lang>/<kindDir>/…`, with `<kindDir>` and the file name taken
from the kind's `sourceDir` / `sourceSuffix`. Folders above the root never count, so a catalog can
live under any path. `loadCatalog` records that root on `LoadedCatalog.root`. The `catalog-layout`
conformance rule fails `sigil sync --check` (CI) on an artifact placed off this layout or a skill folder
carrying content that never ships. It needs that root, so a catalog built in memory is not checked.

### Adding a platform target

1. Create `src/targets/<platform>/index.ts` implementing the `Target` interface. The snippet is
   abridged; the full interface is [`src/types.ts`](../../src/types.ts) (it also has
   `scaffoldConfig`, `vocabulary`, `configScopes`, `outputContracts`, `initDirs`, `projectMarkers`,
   `displayName`, `installHint`, `authoringFields`, and `frontmatterExtensions`):
   ```typescript
   export interface Target {
     name: string;
     capabilities: TargetCapabilities; // see step 4
     compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap>;
     scaffold?(artifactId, catalog, options): Promise<FileMap>; // optional
   }
   ```
2. Register in `src/targets/index.ts` with `registerTarget(new YourTarget())`.
3. The `--target <name>` CLI flag and `dist/<name>/` output directory work automatically.
4. Declare kind support once, in `src/targets/<platform>/capabilities.ts`: a `TargetCapabilities`
   (`src/targets/capability-types.ts`) with one row per kind for each channel the platform has
   (`scaffold`, and `plugin` if it ships marketplace plugins) — `native`, `via` (carried inside
   another artifact, with a doc citation), or `none` (warn-and-skip on `sigil add`, with a
   reason rendered in the generated matrix). The `Record<ArtifactKind, …>` type makes a missing kind a compile error. Nothing else
   hand-lists kinds: selection's warn-and-skip, `validate`'s platform checks, the wizard and the
   plugin assembler all read the table through `src/targets/capabilities.ts`, and `npm run build`
   regenerates the matrix in [capabilities.md](capabilities.md) from it.
5. For each kind the platform emits `native`, add one `KindEmitSpec` under
   `src/targets/<platform>/spec/<kind>.ts` (see § Emit specs below) and list it in that directory's
   `index.ts` export array. `provider-kind-coverage` fails `sigil sync --check` when a `native`
   whole-file kind has no spec for its channel (a spec with no `variant`, or `variant` equal to the
   channel id).
6. `Target.frontmatterExtensions` is the extension point `src/validate/schema-checks.ts` already
   composes (each target's shape is nested under `<target.name>:`). **Shipped targets do not use
   it.** The only declaration is the unregistered test fixture
   (`src/targets/test-fixture/index.ts`, `test-fixture: { priority }` on `skill`). Current reality,
   which is known debt relative to that extension point:

   - `claude:` (`model`, `effort`, `maxTurns`, `isolation`, `skills`) is a nested object on the
     neutral `AgentSchema` in `src/schema/index.ts`, not a `frontmatterExtensions` entry.
   - Six Claude-oriented skill fields are still top-level on `SkillSchema`: `allowedTools`,
     `argumentHint`, `disableModelInvocation`, `whenToUse`, `userInvocable`, `skillContext`. They
     were not moved into a `claude:` namespace.
   - `COPILOT_PROMPT_SPEC` hardcodes `tools:` to `codebase` and `github`. There is no
     `copilot: { tools }` override.

   Do not describe either of those as if the namespace migration had already landed. A new
   provider-only field can be declared on `frontmatterExtensions` (the fixture is the worked
   example); adding another bare field to `SkillSchema` or `AgentSchema` extends the debt.

7. If a kind's vocabulary is genuinely owned by one provider today (Claude's `hook`/`settings`
   lifecycle enums are Claude Code's own vocabulary, not a cross-provider standard), that is declared
   on `KindDescriptor.ownedBy` (`src/kinds.ts`) rather than pretended-neutral. `validate` warns the
   moment a second target's capability table supports an `ownedBy`-nonempty kind — that warning is
   the signal the vocabulary must move into per-provider namespaces before a second provider ships it.
8. Add one **body lexicon** table: `src/targets/<platform>/lexicon.ts` exporting a `ProviderLexicon`
   (`src/targets/lexicon.ts`) with a `{value, doc}` entry for every term in `LEXICON_TERMS`. Wire it
   onto every `KindEmitSpec`'s `lexicon:` field — `renderArtifact()` (`src/targets/emit.ts`) applies
   it unconditionally, so a body written once (`Read {sigil:conventions-file}...`) resolves to each
   provider's own literal (`CLAUDE.md` / `AGENTS.md`) at render time. This is what keeps catalog
   _bodies_ provider-neutral the same way `FieldMapping` already keeps _frontmatter_ neutral — see
   `src/targets/lexicon.ts` and
   [`docs/decisions/provider-neutral-body-lexicon-2026-08.md`](../decisions/provider-neutral-body-lexicon-2026-08.md).
   Also add each of your
   provider's `bodyForbids` entries: `UNTRANSLATED_TOKEN_FORBID` (a `{sigil:}` token surviving to
   output means an unknown term or a spec that forgot step 8) on every spec, plus
   `CLAUDE_LITERAL_FORBIDS_ON_COPILOT`-style entries for any OTHER provider's literal your provider
   must never see (`src/targets/lexicon-forbid.ts`) — this is the second net that catches a
   hardcoded literal an author typed instead of using the lexicon token in the first place.
   **Any hand-rolled aggregate that assembles an artifact's body without going through
   `renderArtifact()`** (Copilot's `AGENTS.md`/`copilot-instructions.md` — see
   `copilot/build-helpers.ts`) must call `applyLexicon()` directly; it does not get the pass for
   free just by existing in the same target.

### Adding a kind

1. Add the kind to `ArtifactKind` (`src/types.ts`) and one entry to `KIND_REGISTRY`
   (`src/kinds.ts`) — `selectorOrder`/`displayOrder` place it in pickers and generated docs
   automatically, and `sourceDir`/`sourceSuffix` decide where its source files live (loading,
   `sigil check`, `new` and `move` all derive from them); there is no second hand-maintained list
   to update.
2. Add its zod schema to `SCHEMAS` in `src/schema/index.ts`; `npm run build` regenerates
   `schema/<kind>.schema.json` from it — commit both.
3. Each provider that supports the new kind adds a `KindEmitSpec` for it (see below). A provider
   that doesn't support it adds no spec and marks the kind `none` in its `capabilities.ts` — every
   target's table must gain a row for the new kind, or the build fails to compile.

### Emit specs: how a kind renders on one provider

`src/targets/spec-types.ts` defines `KindEmitSpec` — a declarative, data-only description of one
(provider, kind) pairing: its output path, which frontmatter fields map to which provider keys, which
body sections wrap the artifact body, and which contract (required/forbidden keys, forbidden body
patterns) the emitted file must satisfy. `renderArtifact(spec, artifact, ctx)`
(`src/targets/emit.ts`) is the single renderer every spec runs through — there is one emission
function in the whole codebase, not one per platform.

Two consequences of this being data rather than code:

- **Contracts are derived, not hand-written.** `deriveContracts(specs)`
  (`src/targets/output-contract.ts`) builds each platform's `ContractEntry[]` straight from its
  `KindEmitSpec[]` — `requiredKeys` from mappings marked `required: true`, `forbiddenKeys` and
  `bodyForbids` passed through, `match` from `outputPath`. A spec and its contract cannot drift,
  because the contract no longer exists as separate hand-maintained state.
- **Per-provider body rearrangement without touching the catalog.** A spec's `BodySectionSpec`
  receives `ResolvedArtifact.resolvedSlots` / `resolvedAncestorBodies` (see § Templates below), so a
  provider that needs a different section order, a split into multiple files, or extra wrapping
  material builds it from the composed parts — the catalog author never writes anything
  platform-specific, and `resolvedBody` (the default, slot-concatenated string) stays available for
  every provider that doesn't need to diverge.

### Templates: one body structure, many artifacts

`kind: template` artifacts (`catalog/shared/templates/*.template.md`) hold a kind's shared body
structure exactly once. A template's body is ordinary Markdown with `<!-- slot: key -->` markers;
everything outside a marker is shared prose emitted for every artifact that uses the template. An
artifact opts in with `template: <template-id>` in its frontmatter and then supplies **only** slot
content — one or more `<!-- slot: key -->` markers followed by that slot's Markdown, nothing else at
the top level:

Shipped templates (all under `catalog/shared/templates/`): `code-quality` (the per-language `*-code-quality`
rules), `mcp-note` (the four `shared/*.mcp.md` artifacts), and `release-skill` (the per-language `*-release`
skills). Each was added only after measuring real body overlap; see
[template-extraction-evidence-2026-08.md](../decisions/template-extraction-evidence-2026-08.md) and
[catalog-quality-audit-2026-08.md](../decisions/catalog-quality-audit-2026-08.md).

The template (`shared/templates/release-skill`, abridged; the real file also carries `title`, `description`,
`tags`, and a `docs:` citation):

```markdown
---
id: shared/templates/release-skill
kind: template
appliesToKind: [skill]
revision: 1
slots:
  - {
      key: quality-gates,
      required: true,
      description: "Step 1: how to discover and run this language's full quality gate.",
    }
  - {
      key: version-determination,
      required: true,
      description: 'Step 3: where the version lives and the commit-type-to-bump rules.',
    }
  - {
      key: changelog-format,
      required: true,
      description: 'Step 4: the changelog headings this language groups commits into.',
    }
  - { key: api-compat-step, required: false, description: 'Optional standalone api-compat step.' }
  - {
      key: checklist-and-next-steps,
      required: true,
      description: 'Final checklist plus the publish commands.',
    }
---

# Release Preparation

**Target version:** {sigil:arguments}

## Step 1 — Verify quality gates

<!-- slot: quality-gates -->

## Step 2 — Check the working tree

(shared prose: `git status --porcelain`, stop on a dirty tree)

...
```

An artifact that uses it (`typescript/ts-release`, abridged) supplies only slot content:

```markdown
---
id: typescript/ts-release
kind: skill
name: ts-release
template: shared/templates/release-skill
...
---

<!-- slot: quality-gates -->

Discover the combined gate from `package.json` scripts and run it; stop and report if any gate fails.

<!-- slot: version-determination -->

1. Read the current version from `package.json`.
2. Suggest a bump from the commit types since the last tag.

<!-- slot: changelog-format -->

...
```

Composition (`src/templates.ts`, invoked from `resolve.ts` before `extends`) validates the artifact's
slots against the template's declared `slots:` and substitutes each marker, producing
`ResolvedArtifact.resolvedBody` (the default rendering every provider gets for free) plus the
unflattened `resolvedSlots` / `templateId` fields consumed by provider specs that need to diverge.
An artifact without `template:` is unaffected — hand-authored bodies remain valid for one-offs.
Templates are never emitted to `dist/` — every provider's capability table marks `template` as `none`.

**Propagating a template change** — when a template's shared prose or slot list changes, every
artifact built against it needs its output regenerated. `sigil sync` is the command for that; see the
[CLI reference](spec.md#cli-reference) and `docs/guides/authoring.md` § Keeping artifacts in sync with their template.

**Doc citations are staleness-tracked, not continuously verified.** Every `docs:` entry — on a
template, or in a provider's `KindEmitSpec.docs` (`src/targets/doc-refs.ts`) — carries a
`verifiedOn` date. `sigil sync --stale <months>` (default 6) walks both: template citations via
`findStaleDocs` and every provider spec's (plus the two hand-written aggregates',
`copilot-instructions.md`/`AGENTS.md`) citations via `findStaleProviderDocs`
(`src/targets/all-emit-specs.ts` flattens the input; `src/commands/sync/analyze.ts` does the date
check). `--check` fails CI when any entry is stale — wired into `.github/workflows/ci.yml`. What
stays manual: nothing re-fetches a URL or confirms the page still describes the cited structure —
a person does that and then updates `verifiedOn`.

**What "verified" means** (`src/targets/doc-refs.ts`'s header is the canonical statement): a citation
must name the provider's canonical home for the artifact — the page that provider's own navigation
or file-reference table points to, anchored to the specific section when the artifact is a
subsection — not merely a page that happens to mention the format. When two products read the same
emitted file (every `.github/*` output is read by both GitHub's cloud agent and VS Code's local
agent, and their docs genuinely diverge — see `COPILOT_RULE_SPEC`'s citation for a concrete
example), cite both; `docs` is an array for exactly this. A `KindEmitSpec` can also carry
`supersededBy` when a provider has signaled the whole output format is being retired (e.g. VS Code
steering `.prompt.md` toward agent skills) — `sigil sync` surfaces it as an advisory notice that
never fails `--check`, since acting on it is a deliberate, reviewed migration, not an automatic one.

### Conformance engine

`sigil sync`'s second analyzer (`src/commands/sync/conformance/` — see
[`docs/decisions/catalog-conformance-audit-2026-08.md`](../decisions/catalog-conformance-audit-2026-08.md))
answers a
different question than template drift: not "does this artifact match its template" but "does this
artifact match the current provider standard, on every provider it emits to." A `ConformanceRule`
(`conformance/types.ts`) is data plus `detect()`/optional `fix()`/optional `editorialTask()` — the
same philosophy as `KindEmitSpec`: adding a rule is one file in `conformance/rules/` plus one line
in `conformance/registry.ts`, never a change to the runner.

Each rule is `mechanical` (a finding has a deterministic `fix()` — e.g. `when-to-use-lift`, which
extracts a skill's `## When to Use` body prose into `whenToUse:` frontmatter) or `editorial` (the
right answer needs judgment — e.g. `body-density`, `platform-path-leak`, `applies-to-rationale`,
`related-artifacts`). A `mechanical` rule can also be detect-only when even its class of finding
has no safe auto-fix (`provider-kind-coverage` — closing a spec gap means authoring code;
`deprecated-hygiene` — naming the right replacement artifact is judgment). Findings carry
`severity: 'error' | 'warning'`: errors are structural gaps (missing spec coverage, un-lifted
`whenToUse`) and fail `--check`; warnings are advisory, same precedent as `supersededBy`.

`--apply` writes every `mechanical` fix. `--apply --editorial` additionally runs a model-backed pass
(`fix-editorial.ts`, model call in `editorial-model-client.ts` — a raw `fetch` to the Anthropic
Messages API, no SDK dependency) for `editorial` findings, reading `ANTHROPIC_API_KEY`. Every
proposal must clear four rails (`editorial-rails.ts`) before it is written:

1. Re-parses as valid frontmatter + body.
2. Passes the artifact kind's zod schema.
3. Passes `checkOutputContract()` for every provider `KindEmitSpec` matching the kind.
4. Only touches the frontmatter keys (or `body`) its task declared ownership of — identity fields
   (`id`/`kind`/`name`/`language`/`uses`/`extends`/`platforms`/`deprecated`) are never touched by
   any task, regardless of what it claims to own.

A failed rail drops the edit and reports why; it never writes a partial result. `--rule <id>`,
`--kind <k>`, `--language <l>`, and `--provider <p>` scope both detection and `--apply` — the
mass-change controls: bring one language up to standard, or one rule across the whole catalog,
reviewing each as its own diff (the clean-tree guard on `--apply` makes this the natural workflow).

**Lifecycle scenarios the engine (plus existing mechanisms) covers:**

| Scenario                 | Mechanism                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New artifact authored    | `sigil sync` flags it against every applicable rule; `shared/author-artifact` scaffolds frontmatter                                                                                  |
| New artifact kind added  | `KIND_REGISTRY` entry + spec per provider; `provider-kind-coverage` errors until every supporting target has a spec or aggregate                                                     |
| Provider changes a field | edit the `KindEmitSpec`, refresh the `DocRef`, add a rule if catalog source must change; `--apply` propagates                                                                        |
| Standard tightened       | one new file in `conformance/rules/`, one registry line, one `--apply`                                                                                                               |
| Artifact deprecated      | `deprecated: { since, reason, supersededBy? }` — stays resolvable; `deprecated-hygiene` enforces `supersededBy`; `validate` warns on live dependents; `sigil prune` cleans consumers |
| Citation goes stale      | `sync --stale` (6-month default) fails `--check`; a human re-verifies against the canonical-home standard and bumps `verifiedOn`                                                     |
