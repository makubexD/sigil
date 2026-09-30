# Decision Log: Skill-Dispatch Audit (August 2026)

**Date:** 2026-08-04
**Scope:** Why `.claude/` skills never dispatched, pipeline defects that caused it, and the
TypeScript-catalog fix — first pass; other languages deferred to a follow-up.
**Trigger:** `/plugin` reported all 9 project skills as "never used." User asked for a per-artifact
verdict — bad artifacts, or a prompting problem?

---

## What changed and why

### Root-cause finding

Transcript analysis across this project (4 transcripts, 159 real user messages) showed **0
`Skill`-tool dispatches and 0 command invocations, versus 50 `Agent`/`Task` dispatches** in the
same window. Same repo, same sessions, same model — the asymmetry is the finding: agents carry
trigger-shaped descriptions ("Use to… Use proactively when…"); skills carried feature blurbs.
Claude Code's own docs name the fix directly: a dedicated `when_to_use` frontmatter field exists
specifically to carry trigger phrases, separate from `description`, and the sigil skill schema had
no field for it — so no catalog skill could ever emit one.

### F1 — No `whenToUse` field (root cause)

**Problem:** `SkillSchema` had no way to express trigger phrases. `catalog/languages/python/skills/py-pytest-testing`
was the one skill written in trigger style ("Use when adding or reviewing…") — coincidentally
already close to what the field now formalizes.

**Fix:** Added `whenToUse` (+ `userInvocable`, `skillContext` for `context: fork`) to `SkillSchema`
(`src/schema/index.ts`); emit `when_to_use:`/`user-invocable:`/`context:` from
`plugin-build.ts buildOptionalSkillFrontmatterLines`; authored `whenToUse` on all 7 TypeScript
skills with real trigger phrasings.

### F2 — `paths:` emitted for skills, an unsupported field

**Problem:** Skills have no `paths:` equivalent — Claude Code dispatches by description relevance,
not file path. `plugin-build.ts` emitted `paths:` from `appliesTo` anyway (defaulting to
`['**/*']`), and `validate.ts`'s no-op-scope warning explicitly excluded skills
(`if (artifact.kind !== 'rule') return`), so 21 of 23 catalog skills accumulated the no-op
unnoticed. `docs/reference/spec.md` documented the wrong behavior as intended.

**Fix:** Removed `appliesTo` from `SkillSchema` entirely (no valid use existed on either Claude or
Copilot's skill output — confirmed by reading both adapters and their tests); stopped emitting
`paths:` for skills; updated `spec.md`, `authoring.md`, `header.ts`'s scaffold template, and the
import-translation path (`translate-kinds.ts` — `when_to_use` now round-trips into the `whenToUse`
frontmatter field, not into a body section, since it's routing metadata, not prose).

### F3 — Rule bodies duplicated into scaffolded skills

**Problem:** `scaffold.ts`'s own comment said "Rules are NOT inlined… loaded natively," then called
`buildPluginSkillMd(skill)`, which unconditionally appended `## Applied Rules`. Verified on disk:
the inlined section in `ts-generate-tests/SKILL.md` was byte-for-byte the same 5KB as the natively
loaded `ts-testing.md` rule — a real duplicate, re-injecting content already resident, and nesting
an H2 rule body under an H3 heading.

**Fix:** `buildPluginSkillMd(skill, inlineRules: boolean)` — plugin-build path (`dist/claude/`)
passes `true` (plugins can't ship loose rules), scaffold path (`.claude/`) passes `false`. Fixed
both false doc comments.

### F4 — Toolchain prescribed, not discovered

**Problem:** Every skill had a "discover the runner from `package.json`" step that its own worked
examples then contradicted — hardcoded Vitest throughout. Proven concretely: **this repo has no
Vitest anywhere** (`npm test` runs `node --test`, 35/35 test-file imports are `node:test`), yet
`ts-generate-tests/SKILL.md` — installed into this exact repo — said "Generate a Vitest suite" with
a `vi.mock`/`expect().toBe()` worked example. Had it ever fired, it would have written tests this
repo cannot run. 26 catalog source files hardcoded Vitest, including `ts-dependencies.rule.md` and
`ts-git.rule.md` naming `vitest run` as _the_ quality gate in a repo whose gate is `npm run check`.

**Fix:** Titles/descriptions dropped the runner name; worked examples got an explicit
"Example shown with Vitest — mirror whatever the repo actually uses" framing; discovery steps
gained `node:test`/`jest` alongside Vitest; `ts-dependencies`, `ts-git`, `ts-npm`, `ts-testing`,
`ts-project-layout` rules and the `ts-release` skill stopped naming `vitest run` as _the_ gate.
Added `validate` §7: warns when a skill body imports a specific runner without the framing nearby.

### F5 — Skill bodies re-taught what the model already knows

**Problem:** `ts-generate-tests` was 9.1 KB of "one behavior per test," "AAA with labeled
comments," "mock only at I/O boundaries" — content a competent model does unprompted, and content
already covered by the natively-loaded `ts-testing` rule. Meanwhile the one fact a model _can't_
derive (tests import from `../dist-cli/…`; a source edit needs `npm run build` before `npm test`
sees it) was absent. `ts-scaffold-project` was 19.3 KB, the largest artifact in the repo.

**Fix:** Trimmed generic craft advice from all 7 skills (target ≤4 KB); kept discovery steps,
guardrails (e.g. `ts-sync-tests`'s pre-deletion confirmation), and report formats. Split
`ts-scaffold-project` — its four code templates moved to `references/templates.md` (progressive
disclosure, already supported by the pipeline via `scaffold.ts`'s `references/` handling, but used
by only one other catalog skill before this). Result: 19,347 → 3,752 bytes always-resident + 2,404
bytes loaded on demand.

### F6 — `shared/clean-code` loaded twice on every `.ts` edit

**Problem:** `ts-code-quality` and `ts-conventions` both `extends: [shared/clean-code]`, both
scoped `**/*.ts` — editing any TS file loaded the same 8-bullet block twice.

**Fix:** Dropped the `extends` from `ts-conventions` (kept on `ts-code-quality`, the closer fit).
Added `validate` §6: warns when two rules of the _same language_ extend the same ancestor into an
identical `appliesTo` scope. Deliberately scoped to same-language pairs — cross-language siblings
like `angular/ng-git` and `csharp/cs-git` never co-install, so an early unscoped version of this
check false-positived on them; fixed before landing.

### F7 — Command names bury the verb

**Problem:** `shared-author-artifact`, `shared-explain-diff` — the meaningless `shared-` prefix
sorts first.

**Fix:** Reworded descriptions to lead with the verb and added trigger phrasing (not a rename —
renaming breaks manifest entries and installed paths for a benefit F1 may already deliver;
deferred pending F1's measured result).

### F8 — Schema missing `user-invocable` / `context: fork`

Added both (`userInvocable`, `skillContext`) alongside `whenToUse` — `ts-audit-deps` and
`ts-scaffold-project` now use `skillContext: fork` since their intermediate work is long but the
caller only needs the final report.

---

## Lint fallout from the fix itself

The project's own `max-params`/`max-lines-per-function`/`max-lines`/`complexity` rules caught two
of my own additions: `translate-kinds.ts buildSkillFrontmatter` (bundled 3 params into a
`SkillFields` object) and `plugin-build.ts buildPluginSkillFrontmatterLines` (split the optional-
field logic into `buildOptionalSkillFrontmatterLines`). `validate.ts` grew past its 200-line cap
once §6/§7 were added — split into `src/validate/{index,types,schema-checks,scope-checks,
runner-check,platform-checks,cycles}.ts`, mirroring the existing `src/authoring/update/` split
pattern. All public exports (`validateCatalog`) unchanged — importers needed no edits.

---

## Verification

- `npm run check` — 415/415 tests, lint, format, doc-comments all green.
- `npm run validate` — 95/95 catalog artifacts valid, **zero warnings** (confirms F6's fix and the
  language-scoping fix; confirms F4's framing on the two remaining worked-Vitest-example skills).
- Regenerated this repo's own `.claude/` via the real CLI (`sigil update` — never hand-edited;
  `.claude/` is generated output) — 15 artifacts updated, `sigil status` shows 29/29 up-to-date.
- Uninstalled `shared/code-reviewer` (`sigil uninstall`, dry-run verified first) — redundant with
  the installed `ts-code-reviewer`, which already covers the same dispatch intent for this repo.
- Mechanical checks on the regenerated `.claude/skills/`: zero `## Applied Rules` sections, zero
  `paths:` fields, all 7 skill files 3.4–4.3 KB (down from up to 19.3 KB).
- **Not yet verified:** whether dispatch actually improves in a live session. That requires a fresh
  Claude Code session asking "add tests for src/release.ts" and confirming `ts-generate-tests`
  fires unprompted and writes `node:test` (not Vitest) code — the acceptance criterion the original
  plan named. Everything above is a hypothesis about _why_ dispatch never happened; only that test
  proves it.

## Not in scope (deferred)

- angular/csharp/python/react catalogs — second pass once the TypeScript pass's dispatch
  improvement is confirmed in a live session. `py-pytest-testing` already follows the trigger-style
  convention and can serve as a control.
- Merging `ts-sync-tests` into `ts-generate-tests` (flagged as a candidate, not executed).
- Renaming skill/command files for F7 (descriptions only, per above).
