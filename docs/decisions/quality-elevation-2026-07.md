# Decision Log: Codebase Quality Elevation (July 2026)

**Date:** 2026-07-31
**Scope:** Full SME-level audit of `src/`, `catalog/`, build/test pipeline, and CI, followed by a
13-phase remediation pass
**Commits:** e8bb9e4 → ea2df2f

---

## Why this pass happened

The user asked for a codebase-wide review "as if you were an SME using SonarQube or similar" —
looking for clean-code/DRY/SOLID/YAGNI violations, real bugs, and structural risk, ahead of a
stated goal: making it easy to add new catalog artifacts without relying on "if-blocks or junior
code." Three parallel Explore agents audited `src/`, `commands/`+`wizard/`, and `catalog/`+`test/`+
build config; a Plan agent then designed the two highest-risk refactors (wizard step registry,
`runAdd` plan/execute split) before any code was touched. The user chose to batch through the full
plan autonomously rather than review phase-by-phase.

**Governing constraint carried through every phase:** behavior-preservation. Each workstream ended
with the full check suite (`tsc --noEmit && eslint && prettier --check && node --test`) green, and
the A0 characterization tests (added specifically to give the later phases something to break)
stayed green throughout A3–A7.

---

## Workstream B — Build & test integrity (e8bb9e4)

**Problem:** `npm run build` had no clean step. 5 pre-refactor `dist-cli/*.js` barrel files
(`manifest.js`, `select.js`, `wizard.js`, `query.js`, `config-merge.js`, plus 3 more under
`trust/`/`authoring/`) survived every rebuild from before those modules were split into
directories. Tests imported them extensionless, and CommonJS resolves `foo.js` before
`foo/index.js` — so roughly 190 of 352 test blocks were silently validating 8-day-old code on any
local run. CI was unaffected (fresh checkout has no stale files), which is exactly why nobody had
noticed.

**Fix:** `npm run build` now runs a `clean` step first (portable `fs.rmSync`, no new dependency);
test imports were also made explicit (`../dist-cli/manifest/index`) as a second line of defense.
Also: `eslint src` → `eslint src test` (the test tree was configured for linting but never
actually linted); `no-unused-vars` raised from `warn` to `error`; `tsconfig.test.json` raised to
match `tsconfig.json`'s strictness (this alone surfaced ~90 `noUncheckedIndexedAccess` violations,
fixed with `!` where a preceding `assert.ok` already guaranteed non-emptiness); `test/pipeline.test.js`
untracked (a stale compiled duplicate of the `.ts` source, committed by accident).

Two scoped exceptions, both documented inline in `eslint.config.js`: `no-floating-promises` and
`no-explicit-any` are turned off for `test/**/*.ts` only. `node:test`'s `describe()`/`it()`
intentionally return a promise the runner awaits internally (not a fire-and-forget bug), and test
fixtures legitimately construct malformed objects to exercise runtime validation, where `unknown`
would just force a no-op cast back. Both rules stay `error` for `src/`.

**Why logged:** this was the prerequisite for trusting every later phase's `npm test` output.

---

## A0 — Characterization tests (800d648)

`src/commands/` had zero unit coverage — every handler called `process.exit` directly, which kills
the test runner. Before touching any command code, pinned current behavior by spawning
`dist-cli/cli.js` as a subprocess for: `add --dry-run`, `add` (real install + reinstall), `delete`
on an unknown id, `status` (empty + populated). These 9 tests were the actual regression net for
every phase from A3 onward — not a formality.

---

## Two real bugs found during the audit, fixed before the refactor (9859e43, ab35975)

1. **7 Angular skills had double-quoted `argumentHint`** (`"\"<value>\""`), which round-trips
   through gray-matter and every adapter's `yamlScalar()` into visibly broken emitted frontmatter.
   Fixed the 7 files; added a `checkSourceArtifact` rule so this class of mistake fails `sigil
check`/`sigil new` instead of reaching output silently.

2. **`sigil update` never handled config-kind (hook/settings/mcp) entries.** This is the actual
   root cause behind this repo's own `.claude/settings.json` going missing (an earlier audit had
   wrongly blamed the `add` command's merge logic — the manifest entries were correct; the file
   had simply been deleted from disk after install, and `update` had no code path for it at all,
   failing with "Scaffolding not supported for kind 'hook'"). Added `updateConfigEntry()`, which
   restores/re-merges straight from the manifest's own recorded fragment (not a fresh
   `scaffoldConfig()` call — config files are user-owned, so re-applying what was actually
   installed is the correct source of truth). Used the fix to restore this repo's own
   `.claude/settings.json` (gitignored, not part of the diff).

**Deliberately not fixed:** `.claude/settings.local.json` grants blanket `Bash(*)`/`Write(*)`/
`Edit(*)`, defeating the catalog's own `shared/protect-config` hook and `shared/allow-dev-tools`
settings artifacts. This file is this session's own active permission grant — overwriting it
mid-session risked losing tool access before the batch run finished. The user explicitly chose
"skip it, flag in report" when asked. **Still open.**

---

## A1 — Kind capability flags (330f36b)

`kind === 'skill'` literals were scattered across 6 sites to check 3 distinct capabilities
(declares `uses:`, is directory-backed, requires a language) that all happened to be true only for
`skill` today. Added `hasUsesClosure`/`isDirectoryBacked`/`requiresLanguage` to `KIND_REGISTRY`
(`src/kinds.ts`), following the existing `isConfig` precedent — the `Record<ArtifactKind, …>`
constraint makes omitting a new kind a compile error. This is the concrete mechanism behind "add
artifacts easily without junior code": a new kind's capabilities are now declared once, not
re-derived by literal-matching at each call site.

## A2 — Engine-layer dedupe (4526b20)

Three lift-and-share extractions, all behavior-preserving and covered by existing suites:
`targets/shared/boundary.ts` (the `## Boundary` renderer was triplicated verbatim across both
adapters), `src/refs.ts` (the `extends`/`uses.*` dangling-reference walk existed independently in
`validate.ts` and `check-source.ts` — the same rule stated in two places is a latent-divergence
risk), `src/paths.ts` (`normPath`/`basenameOfId`, previously redeclared inline at 7+ sites in two
spellings).

## A3 — `SigilError` + single exit point (cac3144)

45 `process.exit(1)` calls across 22 files — including inside `cli-helpers.ts`'s
`loadAndValidate()`, a shared helper imported by 9 modules — converted to `throw new SigilError(...)`.
`src/errors.ts` (one class, one factory) and `src/cli-error.ts` (`handleFatal`, the only
`process.exit` left) replace all of them; `cli.ts` now ends with
`program.parseAsync(process.argv).catch(handleFatal)`. Deliberately minimal: `EXIT.VALIDATION = 2`
exists in the taxonomy but every site still uses `EXIT.USER = 1` — the 1→2 split for validation
failures was proposed and the user chose to defer it rather than change observable exit-code
behavior in this pass.

**This is what made A4 possible:** shared helpers can now throw instead of killing the process,
which is exactly what had prevented 14 commands from adopting the shared catalog-loading helper.

## A4 — Shared command helpers (8a04861)

`src/commands/shared/` — `requireArtifact` (killed 5 copies of "not found → list available"),
`requireManifest` (3 copies), `renderViolations` (2 copies). Migrated 6 _mutating_ commands
(delete/edit/patch/retarget/move/new) from bare `loadCatalog()` to a new `requireValidCatalog()`
(extracted from `loadAndValidate`, minus the packs requirement most of these commands don't need).
Deliberately left 5 _read-only_ commands (get/search/list/check/complete) on bare `loadCatalog()`:
forcing whole-catalog validation onto "just look up one artifact" has a real UX cost — an unrelated
broken file elsewhere would block them — that outweighs the DRY win for pure inspection paths.

## A5 — Wizard step registry (2bfd5a1)

The highest-risk phase. `wizard/add.ts` (867 lines) and `wizard/new.ts` (321 lines) were hand-rolled
`while (true) { if (step === 'x') {...} }` state machines where every arm manually called
`history.push(step)`. This pattern had already caused a real shipped bug (documented in CLAUDE.md
before this pass): a pass-through arm rendered no prompt but still pushed a history frame, producing
an unescapable "← Back" loop.

`src/wizard/engine.ts` (~55 lines) replaces both machines with a linear `WizardStep[]` list gated
by an optional `shouldShow(state)` predicate per step. `history.push` now exists in exactly one
place — inside the driver, only on the `'next'` outcome, only for a step that actually ran. A
skipped step never executes, so the bug class is structurally unrepresentable, not just patched.
Deliberately no `next(state)` jump primitive (YAGNI) — every branch in both wizards is expressible
as `shouldShow` on the downstream step.

**A real regression was caught by the existing test suite during this conversion**, not avoided by
care alone: the original `narrow` step's `all`-scope branch did two things — set
`s.selectors = ['all']` _and_ jump to `language` — and the step-by-step conversion initially
preserved only the jump. `test/wizard/add.test.ts`'s back-navigation test failed with `TypeError:
selectors is not iterable`, exactly pinpointing the missed assignment. This is the argument for A0
and for converting logic nearly verbatim rather than rewriting from a blank page.

One deliberate behavior delta, confirmed against the two tests that encoded the old behavior
(updated accordingly): the "Include dependencies?" prompt is now skipped when the selection has no
`uses:` closure at all (e.g. a config-kind-only pick) — previously it rendered as a no-op prompt
with nothing to include either way. `includeDeps` defaults to `true` so a skip behaves identically
to answering "Yes".

The `new` wizard's text-entry + confirm menu (`steps/new/fields-confirm.ts`) is modeled as ONE step
with its own internal loop, not two registry steps — the original never gave that transition its
own history frame ("← Edit fields" re-enters it directly; "← Back to language/platform" must skip
over it entirely), and splitting it would have broken that invariant.

## A6 — `runAdd` plan/execute/render split (09fae33)

`runAdd` (416 lines) mixed target/selection resolution, fs reads, scaffold calls, manifest writes,
config-JSON merges, and console output — and dry-run was a _separate_ branch
(`printDryRunSummary`, 7 positional params) that recomputed config ops independently of the real
install path. Split into `plan.ts` (`buildAddPlan` — pure through conflict detection),
`execute.ts` (`executeAddPlan` — writes, only called for a real install), `render.ts`
(`renderDryRun`/`renderOutcome` — both read the same `AddPlan`), `index.ts` (15-line orchestrator).
Dry-run is no longer a code path that could drift from reality — it's a renderer over the exact
plan a real install executes.

## A7 — Close 4 platform-knowledge leaks (a15b646)

CLAUDE.md's own rule ("platform knowledge lives only in `src/targets/`") was violated at 4 sites:
`cli.ts` hardcoded 4 `--claude-*` authoring flags (now `Target.authoringFields`, looped over in
`cli.ts`); `cli-helpers.ts`'s `mergeOpSection()` re-derived the mcp section string from the fragment
shape, duplicating `configScopes()`'s own computation (deleted; added `ConfigMergeOp.section`, set
directly by each target using the identical derivation); `wizard/types.ts`'s `TARGET_META` static
map (replaced with `Target.displayName`/`installHint`); `cli-helpers.ts`'s `?? 'claude'` fallback
(replaced with `targets/index.ts`'s `defaultTargetName()`, which fails fast on an empty registry
instead of hardcoding a name). Verified against a real `~/.claude.json` write (local-scope mcp
install), then restored from the `.sigil.bak` that run created.

---

## Catalog content quality (e4c678f)

- Extracted `catalog/shared/rules/git.rule.md`: the three language `*-git` rules were 51–55%
  identical (5-gram Jaccard) — commit-message format, atomic commits, branch naming, secrets-history
  steps, merge strategy, and PR-size guidance were near-verbatim triplicated. All three now
  `extends: [shared/git]`, keeping only genuinely language-specific additions. Verified via a real
  `sigil add rule:csharp/cs-git` scaffold: shared sections render first, then the .NET-specific
  ones, no duplication.
- Normalized `extends`: `ts-conventions`/`ng-conventions` now `extends: [shared/clean-code]`,
  matching `cs-conventions` (same rule shape, previously the only one declaring it).
- Migrated the 4 legacy `claude:`-block-only agents to also declare `tools: [Read, Grep, Glob,
Bash]`, matching the other 22. The `claude:` hints are an independent schema field and stay.
- Graded severity: the 3 `*-security` rules are now `severity: required`; everything else stays
  `recommended`. Previously all 38 rules carried the same severity — the field carried no signal.
- Added the missing `shared` tag to 2 config artifacts + 4 MCPs.

**Deliberately left open** (flagged for the user, not decided here): the 3 orphan MCPs
(ado/context-mode/maku-jam) mirror the user's own untracked `_Others/mcp.json`, which contains
org-specific values (an Azure DevOps org name, a personal PAT env-var reference) — packing them
into a shared bundle is a product call. Whether to author a first `workflow`-kind example or drop
the kind (zero artifacts exist despite a full schema + registry entry). Minor tag-vocabulary
unification (test/tests/testing).

---

## CI (ea2df2f)

Added `npm audit --omit=dev` as a CI gate (the project's own `ts-npm` rule requires this). Running
it once, locally, surfaced a real pre-existing high-severity vulnerability: `js-yaml` (transitively
via `gray-matter`, pinned at 3.14.2) was in the vulnerable range for a quadratic-complexity DoS via
YAML merge-key alias chains. `npm audit fix` resolved it with zero `package.json` changes — only
`package-lock.json` moved. Verified the full suite stayed green after the bump.

**Deliberately left open:** version-controlling `.claude/` so the project's own dogfooding is
reproducible in CI. That changes what's tracked in the repo — a call for the user, not something to
bundle into an unrelated CI/dependency-fix commit.

---

## Verification summary

Every phase from Workstream B onward ended with: `npm run build` (clean), `npm run lint`,
`npm run format:check`, and the full `node --test` suite (359 tests at the end, up from 352 —
9 characterization tests + 1 config-kind-update test added). `npm run validate` and
`npm run catalog:build` were re-run after every catalog-content change. Several manual CLI
invocations (`sigil add all --yes`, `sigil retarget`, `sigil move --dry-run`, `sigil patch`,
`sigil add mcp:... --scope local`) cross-checked behavior the automated suite doesn't cover;
one of these (`retarget`) made a real, unintended catalog-source mutation that was caught via
`git diff --stat` and reverted before commit, and another (`add mcp:...`) wrote to the real
`~/.claude.json`, restored from its own `.sigil.bak` immediately after.
