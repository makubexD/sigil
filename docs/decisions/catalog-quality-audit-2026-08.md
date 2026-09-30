# Catalog quality audit — 2026-08-20

## What prompted this

The user dogfooded sigil against its own repo: `npm run build; node dist-cli/cli.js add --project-dir .`,
which installed 32 artifacts into `.claude/` via a 35-selector command. That raised the actual
question worth asking about a growing artifact catalog: not "does it build," but is it any good —
which artifacts fire correctly, which are ambiguous to Claude, which are redundant across the
catalog's three built-out language namespaces (typescript/csharp/angular, 25–27 artifacts each),
and which should be kept, edited, merged, or deleted. The request explicitly asked for an SME
audit combined with empirical evidence, applied end-to-end rather than left as a report.

## What the audit found

Full per-artifact verdicts are in `docs/audits/2026-08-20/register.md`. Four scripted analysis
lanes (`docs/audits/2026-08-20/tools/lane-{a,b,c,d}-*.js`, outputs in `analysis/`) supplied the
empirical half; direct reading of every installed artifact plus a representative sample of the
rest supplied the SME half.

**F1 — the premise correction.** The approved plan assumed ts/cs/ng bodies were near-identical
copies, worth templatizing wholesale. Lane D's shingle-overlap analysis proved that wrong: max
cross-language overlap in the whole catalog is 0.44 (`rule:code-quality`), most families sit at
0.02–0.25, several are 0. These are independently-authored, language-idiomatic bodies covering the
same topic, not copy-paste duplicates. Flagged to the user mid-audit; scope corrected to templatize
only the two families that actually cleared a real-duplication threshold
(`rule:code-quality` at 0.42, `skill:release` at 0.41) rather than force artificial slot
granularity onto 19 families that don't warrant it.

**F2 — real duplication, found by SME reading, missed by the shingle detector.** Every
`*-code-quality` rule that `extends: shared/clean-code` also re-stated one of clean-code's own
bullets ("No dead code…") as a full closing section, verbatim in intent, in all three language
copies. The 5-word-shingle automated detector (Lane E) didn't catch this — the wording differs
enough (bullet vs. section, "delete commented-out code" vs. "delete dead code instead of
commenting it out") to score below its overlap threshold. This is exactly why the plan combined
empirical detection with SME reading rather than relying on either alone. Fixed by deleting the
duplicating section from all three files — the underlying point is already inherited via `extends`.

**F3 — a semantic dispatch collision invisible to lexical matching.** `shared/code-reviewer` and
`typescript/ts-code-reviewer` were both installed together. Trigram-Jaccard similarity between
their descriptions: 0. Real semantic overlap: both fire on "review this code, catch bugs" with no
signal for Claude to prefer one. Fixed by rescoping `shared/code-reviewer`'s description to its
actual two consumers (`python/py-pytest-testing`, `react/component-testing` both name it in
`uses.agents`) and explicitly deferring to a language-specific reviewer when one is installed.
First fix attempt added a `whenToUse` field to the agent frontmatter — the new
`declared-but-unemitted` conformance rule caught this immediately at `sync --check` time: agents
have no `whenToUse` channel, only `description`. Folded back in correctly.

**F4 — two hypothesized cross-rule duplications, investigated and found not to be bugs.** The
original plan suspected `ts-async`'s error-context guidance duplicated `ts-code-quality`'s Error
Handling section, and that secrets guidance was triplicated across `ts-security`/`ts-git`/
`ts-logging`. Direct reading showed both are complementary, correctly-scoped content — the logging
rule already states "`ts-security` owns the full invariant." No edit made; noted as a corrected
hypothesis rather than silently dropped.

**F5 — a real install bug, independently confirmed by the tool itself.** The manifest recorded
`shared/protect-config`'s `PreToolUse` hook as merged into `.claude/settings.json`; the file had no
`hooks` key. `sigil status` independently reported this artifact `[drifted]`, confirming it wasn't
a misreading. Separately, the hook's `command:` was POSIX `sh` (`grep -qiE "$PROTECTED" && exit 2`)
— inert on this Windows host regardless of the merge bug. Both fixed: the command rewritten as a
portable `node -e` one-liner, and the entry uninstalled + reinstalled in this repo (plain `update`
intentionally replays the fragment recorded at install time rather than re-deriving from current
catalog source, since config files are user-owned — reinstall was the correct restoration path).
`sigil status` now reports it `[up-to-date]`.

> **Superseded 2026-09-27** (install audit, `docs/decisions/distribution-channels-2026-09.md` §7): replaying
> only the recorded fragment meant a fixed hook could never reach an existing install, and a
> reinstall appended a second copy beside the old one. `update` now replaces a fragment the catalog
> changed, and `add` replaces its own earlier fragment (`replaceMerge`). The user-ownership concern
> still holds: only values still exactly as sigil wrote them are removed, and an edited
> `object-spread` value needs `--force` (`docs/reference/config-kinds.md`).

**F6 — a genuine catalog symmetry gap**, confirmed by the new `catalog-symmetry` conformance rule:
angular is missing `ng-async`, `ng-project-layout`, and `ng-scaffold-project`, all present in both
typescript and csharp. `csharp/cs-api-architect` is a singleton with no ts/ng counterpart, reachable
only by description dispatch (no `uses.agents`/`relatedArtifacts` reference) — recommended for
merge into `cs-architecture-reviewer` rather than triplication. Both are backlogged (see register)
rather than hastily authored in this pass.

**F7 — python/react are 3-artifact stubs against ts/cs/ng's 25–27.** Real gap, explicitly scoped
out of this pass rather than rushed: bringing them to parity means authoring ~19 new artifacts each
using the templates this audit built, which is real, multi-session work — not something to complete
carelessly just to close the checklist.

## The regression net

Following the `catalog-conformance-audit-2026-08` precedent, the mechanizable findings became a
new conformance rule rather than a one-time fix:

- **`catalog-symmetry`** (`src/commands/sync/conformance/rules/catalog-symmetry.ts`) — flags an
  agent/rule/skill family present in most fully-built language namespaces (derived live: any
  language with ≥15 artifacts, never hand-listed) but missing from one. Report-only (`class:
editorial`, no `editorialTask` — whether a gap should be filled is a human call). Registered in
  `registry.ts`; currently surfaces the three real angular gaps from F6.

The three other rules the plan sketched (`description-collision`, `untemplatized-family`,
`context-budget-aggregate`) were **not** built this pass — see "Still open" below. `declared-but-
unemitted` (pre-existing, not new) is what actually caught the `whenToUse`-on-agent mistake in F3,
which is itself a good demonstration of why the regression net matters: a rule built for a prior
audit caught a mistake made during this one.

A related fix landed in `sigil check` itself (not the catalog): `requireTwoPartId`
(`src/authoring/check-source-conventions.ts`) rejected `shared/templates/mcp-note` — the
**existing** template's id — because it only accepted 2-part ids, never anticipating the
`templates/` sub-namespace CLAUDE.md's own docs describe. Fixed with a `kind: 'template'`
exception accepting `<prefix>/templates/<name>`. Found only because this audit's new template ids
were checked with `sigil check` before anyone had ever run it against the one template that existed.

## Templatization: what shipped

Two new templates, `catalog/shared/templates/{code-quality,release-skill}.template.md`, each with
a `docs:` citation and `revision: 1`. Six consumer artifacts converted
(`{typescript,csharp,angular}/{ts,cs,ng}-{code-quality.rule,release/SKILL}.md`). Verified
end-to-end through the real build, not just `sigil validate`: `sigil build` composed output was
read directly from `dist/copilot/.github/instructions/typescript-ts-code-quality.instructions.md`
and `dist/claude/plugins/dotnet-tooling/skills/cs-release/SKILL.md` and diffed by hand against the
pre-templatization body — byte-identical except the deliberate F2 dedup and a step-numbering
normalization in the release checklist (unnumbered "## Output Release Checklist" instead of a
step count that differed 5 vs. 6 between languages).

## Verification

- `npm run build` — clean after every phase; `schema/*.schema.json` regenerated and unchanged
  (no schema edits this pass).
- `sigil validate` — 98/98 artifacts valid throughout (started at 96; +1 template, +1 after a
  content fix required re-validation, ending at 98).
- `sigil sync --check` — 0 conformance errors at every checkpoint except one deliberately-caught
  intermediate error (the `whenToUse`-on-agent mistake, self-corrected within the same pass).
  Warning count dropped from 9 to 6 body-density warnings (the two templatized skill families
  shrank below the exemplar threshold) plus 3 new, accurate `catalog-symmetry` warnings.
- `sigil status --project-dir .` — all 32 installed artifacts `[up-to-date]`, including
  `shared/protect-config` which started this audit `[drifted]`.
- `npm run check` (tsc + lint + format + test) — green both before and after all changes.
- Composed template output verified against actual `sigil build` output (see above), not just
  schema validation.

## Still open (deliberately out of scope this session)

- **python/react parity** (F7) — scoped out explicitly rather than rushed; ~19 artifacts per
  language, real multi-session authoring work using the two new templates as a starting shape.
- **`cs-api-architect` merge into `cs-architecture-reviewer`** (F6) — recommended in the register,
  not executed; needs careful content-preserving merge of ASP.NET-specific guidance, not a
  mechanical move.
- **angular's three symmetry gaps** (`ng-async`, `ng-project-layout`, `ng-scaffold-project`) — now
  tracked live by `catalog-symmetry`, left for a maintainer to triage (whether `ng-scaffold-project`
  is even needed given `ng generate` already covers it is a real open question, not an oversight).
- **`description-collision`, `untemplatized-family`, `context-budget-aggregate` conformance rules**
  — sketched in the original plan, not built. `catalog-symmetry` was judged the highest-value single
  addition given the actual findings; the other three would mostly re-detect what Lane B/D/C's
  scripts already do ad hoc (`docs/audits/2026-08-20/tools/`), which are re-runnable but not wired
  into `sigil sync`'s gate. A future session should decide whether to promote them.
- **`tags:` flow-vs-block YAML style inconsistency** (part of the original F11) — the `extends:`
  half was fixed (3 files normalized to block-sequence form); the `tags:` half is purely cosmetic
  (doesn't affect parsing, dispatch, or emitted output) and was left for a future `sigil sync
--apply` mechanical pass rather than hand-edited here.
- **`workflow` kind** — zero catalog instances, an orphan JSON schema, and (per the existing
  `catalog-conformance-audit-2026-08`) previously shipped with no Copilot emit spec at all. Neither
  authoring a real instance nor removing the kind was attempted this pass — removing a kind touches
  `src/schema/index.ts`, `src/kinds.ts`'s `KIND_REGISTRY`, every emit spec, and tests; that's a
  separate, deliberate decision for whoever owns the kind's roadmap, not a quality-audit side effect.
- **Stale `dist/` artifacts** — the build does not clean `dist/` before writing (`dist/claude/plugins/
dotnet-pack/skills/xunit-testing/` was found during verification with no matching catalog source,
  presumably left over from an earlier catalog structure). Noted, not fixed — `npm run build`'s
  `clean` step only clears `dist-cli/`/`test-compiled/`, not `dist/`. Worth a one-line fix in a
  future session (`fs.rmSync('dist', ...)` alongside the existing clean step).
