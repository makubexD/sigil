# Catalog benchmark + project-health audit — round 3 (2026-08-22)

## What prompted this

Rounds 1 (`docs/decisions/catalog-quality-audit-2026-08.md`) and 2
(`docs/decisions/catalog-usage-audit-2026-08-21.md`) built a measurement harness — 8 re-runnable
lane scripts plus a diffable `summary.json` shape — but left three things only a new round could
move: the organic-usage signal stayed confounded (F17, every scanned transcript was meta-work on
sigil itself), Lane P remained a proxy rather than a live session, and nothing had ever exercised
`sigil uninstall`'s actual round-trip (both prior rounds cleaned up with `rm -rf`). The user asked
for a full cycle — teardown through sigil, fresh reinstall, re-measure, benchmark against round 2 —
plus a new lane: **project health**, evaluated twice and compared. Explicit instruction: dogfood the
installed review agents, but _also_ do an independent SME pass and compare/argue the two, because a
shallow or wrong agent finding is itself catalog feedback (the agent's own definition needs work),
not just a proxy for code quality.

## Decisions made before executing

1. **Method for the project-health lane**: dogfood the four installed TypeScript review agents
   (`ts-architecture-reviewer`, `ts-code-reviewer`, `ts-security-auditor`, `ts-api-compat-reviewer`)
   against sigil's own `src/`, _and_ do a blind SME pass first — order matters, since reading the
   agents first would anchor my own judgment and destroy the comparison's value.
2. **Selector set**: identical 27 selectors to round 2, so every per-artifact metric stays a true
   like-for-like diff rather than conflating "catalog changed" with "install set changed."

## What was measured

**Teardown through sigil (new this round, F20).** All 32 manifest entries uninstalled in one call —
29 files removed, 4 JSON reverse-merges applied, 0 required `--force`. Verified byte-for-byte: the
`permissions.allow` array (entirely sigil-contributed) was removed completely; a hand-edited
`hooks.PreToolUse` entry left over from a prior session's F14 verification was correctly preserved
(array-item-level `deepEqual`, not whole-key removal proves `reverseMerge` distinguishes sigil's own
contribution from a user edit exactly as designed, not just in the abstract). `.mcp.json` (emptied)
was deleted outright. No defect found — this is the strongest evidence yet that `reverseMerge`
(the machinery the F14 fix depends on) is correct in practice, not just under unit tests.

**Fresh reinstall — identical to round 2.** Same 27-selector command, same 27 files, same 26 tracked
entries (1 rule inlined via `extends`), all up-to-date. Cleaner than round 2's post-install state
(which carried 5 stale entries from an earlier install and one `[drifted]` from F14) precisely
because this round tore down first.

**All 8 lanes re-run** (`docs/audits/2026-08-22/register.md` has the full table). None showed
catalog drift — expected, since no catalog content changed. One correction surfaced: F19's "~1,540
lines" in round 2 was always an approximation; the actual re-measured number (1644) exactly matches
round 1's real figure. Not a regression, just an imprecise prior citation now corrected.

**`docs/audits/tools/benchmark.js`** — new. Reads two `summary.json` files, flattens numeric fields,
prints a delta table. Turns "compare with our previous information" into a command
(`node docs/audits/tools/benchmark.js .sigil/audit-local/2026-08-21/summary.json
.sigil/audit-local/2026-08-22/summary.json`) rather than a manual re-read, which is what makes round
4 cheap.

## Project health: SME pass vs. dogfooded agents

The comparison the user asked for, done in the stated order (SME first, blind):

**SME pass** (before reading any agent output): confirmed `CLAUDE.md`'s stated size discipline is
real, not gamed (0 `max-lines-per-function` disables anywhere in `src/`; the two largest files,
`types.ts` at 492 raw lines and `schema/index.ts` at 403, both lint clean under the 200-line cap
once blanks/comments are excluded, confirmed by running eslint directly on them). Found one
readability nit (`config-merge/reverse.ts`'s recursive key-deletion helper is correct — proven by
the Phase 1 teardown — but denser than it needs to be) and one real documentation gap: **F21** —
`docs/reference/config-kinds.md`, the doc `CLAUDE.md` names as the config-kind reference, never
documented the `missing`/`modified`/`--force` drift-repair model at all, even after F14 made it
load-bearing behavior. This was outside all four agents' stated `src/`-only scope.

**Dogfooded agents**, all four completed successfully with on-scope, verifiable output:

- **`ts-architecture-reviewer`**: independently re-verified every `CLAUDE.md`-stated invariant
  (platform-neutral pipeline stages, single `serialize()` writer, `KindEmitSpec`-derived contracts,
  `KIND_ORDER` derivation, target-registry extension model) against the actual code and confirmed
  each holds. Found two genuine value-level circular-import clusters (F28) — real, but the agent's
  own verdict called the codebase otherwise "structurally healthy."
- **`ts-code-reviewer`**: found **F23** (Critical) — `.sigil.bak`'s home-directory backup guarantee
  was implemented only in `sigil add`'s write path, so `update`/`uninstall` silently skip it for the
  exact files the audit's task description flagged as highest-risk. Also found a `FORBIDDEN_KEYS`
  prototype-pollution guard inconsistency (Major) and an overly-broad `catch {}` in `uninstall.ts`
  (Major, F27).
- **`ts-security-auditor`**: found **F22** (Critical) — `id`/`name` frontmatter fields are
  interpolated directly into output file paths with zero containment check, and the only existing
  guard (`checkNameConsistency`) is wired into authoring-only commands, never into the actual
  `sigil validate`/`sigil build` gate. Also converged independently on the same `FORBIDDEN_KEYS` gap
  `ts-code-reviewer` found (F24 — two agents, two different lanes, same defect: strong signal), plus
  four trust-scanner gaps (F26).
- **`ts-api-compat-reviewer`**: correctly scoped itself given no prior git tag exists (nothing here
  is SemVer-breaking), and found a real accidental-surface issue (F25) — no `exports` map means the
  whole compiled `dist-cli/` tree, including internals, is deep-importable despite `package.json`
  declaring only `bin`.

**Every Critical/High finding was independently re-verified by direct code reading before being
trusted** — grepped for `ensureHomeBackup`/`.sigil.bak` usage (confirmed F23's scope exactly), read
`validate/index.ts` and the schema files directly (confirmed F22's gap precisely, including which
specific check is and isn't wired into the real gate).

**The comparison verdict, stated plainly per the plan's own instruction not to average disagreements
away**: the four agents outperformed the SME pass on this round's most consequential findings. The
SME pass caught one thing outside the agents' scope (F21) and a minor style nit; it missed both
Critical findings and every Major/High one. No agent report was found shallow, wrong, or
scope-creeping after verification — this round's evidence does not indicate any installed reviewer
agent's `description` or body needs a content fix. This also directly answers round 2's F17 organic-
usage confound: this is the first round with real, successful, verifiably-correct live dispatch
evidence for the installed agent set, not just an SME-read proxy (Lane P) or a confounded transcript
scan (Lane U).

## Fixes shipped this round

**F22 (path traversal, Critical).** `src/schema/shared.ts` gained `KEBAB_NAME_RE`/`KEBAB_ID_RE` and
a `.regex()` constraint on `BaseFields.id`; `src/schema/index.ts`'s Skill/Agent `name` fields gained
the same. All 98 existing catalog ids and 49 existing `name` values already conform — this is purely
additive validation, zero catalog source needed to change. `src/cli-helpers.ts`'s `writeFilesSync`/
`partitionFiles` also gained `resolveContained()`, a defense-in-depth containment check, in case a
future target's own path template is ever wrong independent of frontmatter. 5 new tests
(`test/validate.test.ts`: 2 schema-rejection cases; `test/cli-helpers.test.ts`, new file: 3
containment cases).

**F23 (missing home-write backup, Critical).** `ensureHomeBackup`/`isHomeScopedRoot` extracted from
`commands/add/execute-config.ts` into shared `src/config-utils.ts`, called from all three config-JSON
writers (`add`, `update`, `uninstall`) before any home-scoped write or delete. 1 new test
(`test/commands/update-config.test.ts`) that redirects `os.homedir()` via `USERPROFILE`/`HOME` into
a temp dir and confirms `.sigil.bak` is written before `update` overwrites a home-scoped file.

**F21 (docs gap).** `docs/reference/config-kinds.md` gained "Drift and repair" and ".sigil.bak
home-directory backup" sections documenting the model F14/F23 established.

**F24–F28 — initially backlogged, then addressed in a same-day follow-up** once the user asked to
proceed with what was missing. All four turned out to be cheaply scoped once isolated:

- **F24 (prototype-pollution guard, convergent finding).** `FORBIDDEN_KEYS` exported from
  `config-merge/primitives.ts` and applied at every merge/assign loop in `apply.ts`/`reverse.ts`/
  `drift.ts` that lacked it. `isPlainObject` (independently duplicated 3×, per `ts-code-reviewer`'s
  Minor DRY note) hoisted to `primitives.ts` in the same pass. 4 new tests — built with
  `JSON.parse('{"__proto__":...}')`, not an object-literal `{ __proto__: ... }`, since the literal
  form sets the prototype at construction rather than creating an own enumerable key and would
  never have exercised the guard at all.
- **F26 (trust-scanner hardening, 4 parts).** Inline `<!-- sigil-allow: ... -->` comments now only
  suppress `warn`-severity rules — an `error` rule can only be silenced via `.sigil/allow.json`'s
  out-of-band entries. All 5 `injection/*` rules moved from per-line `pattern` to whole-content
  `globalPattern`, reusing the scanner's existing infrastructure unchanged — each pattern's `\s+`
  already matches a literal newline once scanned as one block, so the per-line split was the entire
  gap. `.svg` removed from `BINARY_EXTENSIONS` (it's plain-text/XML, not binary). `secret/github-token`
  broadened from `ghp_` only to `gh[oprsu]_…`/`github_pat_…`. 5 new tests.
- **F27 (`catch{}` narrowing).** `uninstall.ts`'s `deleteWholeFiles` now narrows `unlinkSync`
  failures to `ENOENT` (tolerated silently); anything else warns with the real error. The
  best-effort empty-directory cleanup was split into `removeIfEmptyDir`, which tolerates
  `ENOENT`/`ENOTEMPTY` (both expected outcomes) and warns on anything else.
- **F28 (circular imports, 2 clusters).** New leaf modules `authoring/update/patch-types.ts`
  (`UpdateOps`/`PatchCtx`/`patchList`) and `authoring/import/translate-shared.ts`
  (`TranslateOptions`/`CatalogFrontmatter`/`TranslateResult`/`stripLanguagePrefix`/`slugToTitle`) —
  every former hub-and-satellite pair now imports one-directionally from its leaf instead of each
  other. `patch-build.ts` and `translate.ts` re-export what their external callers
  (`authoring/update/index.ts`, `authoring/import/index.ts`) already expected, so no import outside
  the two clusters changed. `npx madge --circular` confirms both clusters are gone; the 8 remaining
  cycles are the type-only ones the agent already classified Minor/harmless and this pass left alone.

**F25 (packaging, resolved by explicit user decision).** Asked directly: CLI-only, also-a-library,
or defer. The user chose **also a supported library** — sigil's config-merge primitives
(`applyMerge`/`reverseMerge`/`detectConfigDrift`/`classifyConfigDrift`/`deepEqual`/`pruneEmpty`/
`canonicalize`/`serialize`, plus the `ConfigMergeOp`/`MergeStrategy`/`DriftClass` types) are pure
functions with no filesystem/process side effects and were the exact module the audit flagged as
accidentally exposed — the natural, minimal-scope promotion. New `src/index.ts` re-exports only
those; `package.json` gained `"main"`/`"types"`/`"exports"` (`"."` and `"./package.json"` only,
`"type": "commonjs"` added per `publint`'s own suggestion). Everything else under `dist-cli/` —
pipeline stages, target adapters, wizard, commands — is no longer reachable via package-name
resolution. Verified two ways: `require('sigil/dist-cli/config-merge/drift.js')` now throws
`ERR_PACKAGE_PATH_NOT_EXPORTED` (confirmed via self-reference resolution, which walks the same
`exports` map an external consumer would), while `require('sigil')` still resolves the curated
surface correctly. 3 new tests (`test/public-api.test.ts`) guard both directions so a future change
can't silently re-widen the surface.

## Verification

- `npm run build`, `npm run check` (tsc + lint + format + test) — exit 0 after every fix, including
  the F24/F26/F27/F28 follow-up pass and the F25 packaging fix.
- `npm test` — 551/551, 0 failures (18 new cases total across all three passes: 2 schema-rejection +
  3 path-containment + 1 home-backup from F22/F23; 4 prototype-pollution + 5 trust-scanner from the
  F24/F26 follow-up; 3 public-surface guards from F25).
- `sigil validate` — 98/98, byte-identical output to the pre-fix baseline
  (`.sigil/audit-local/2026-08-22/baseline/validate.txt`).
- `sigil sync --check` — 0 errors, same 9 pre-existing advisory warnings, unchanged throughout.
- `sigil status --project-dir .` — 26/26 up-to-date, re-confirmed after every fix pass.
- `npx madge --circular --extensions ts src` re-run after F28 — both Major clusters confirmed gone.
- `npx publint` — clean (no errors, no suggestions) after adding `"type": "commonjs"`.
- Teardown (F20) and reinstall (Phase 2) were both run for real against this repo's actual
  `.claude/` install, not just in test fixtures.

## Still open

- **Copilot-side behavioral probing** — unchanged from round 2's stated next expansion.
- **Round-1 backlog** (python/react parity, `cs-api-architect`, angular symmetry gaps) — unchanged,
  no new evidence this round bears on any of them.
- **Documenting the new library surface**: `src/index.ts`'s header explains the intent, but nothing
  in `docs/` (a README "Library usage" section, or a dedicated reference page) tells an external
  consumer this surface exists or how to use it yet — a natural next step now that it's real,
  versioned API rather than an internal implementation detail.
- **Round 4's natural next step**: re-run `benchmark.js` against this round's `summary.json`, to
  measure whether the project-health score — not yet a tracked numeric metric — should become one.
  This round established the _method_ (SME-vs-agent comparison); a future round could quantify it
  (e.g. findings-per-lane, verified-vs-unverified rate) the way Lane P quantified proxy-vs-SME
  dispatch accuracy in round 2.
