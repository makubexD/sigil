# Catalog audit round 7 — harden the benchmark, close the parity gap (2026-08-26)

Scope: rebuild the Lane P dispatch benchmark to be genuinely hard (all languages, full-catalog
scoring, margin requirement, adversarial/negative probes), report the pre-fix crash honestly, fix
what's real; execute the full python/react rule+agent+skill parity buildout (44 new artifacts +
4 renames); add a pairwise trigger-collision lane; fix all 6 backlogged `src/` performance findings
from round 6; re-measure everything after a clean teardown/reinstall. Full methodology in the
approved plan (`docs/decisions/catalog-parity-and-benchmark-round-2026-08-26.md`).

## Lane P2 (new) — hardened dispatch benchmark

**Pre-fix score, scored against the full 143-artifact catalog with a required ≥1 margin: 15/45.**
This is the round's central finding: the old Lane P's 14/14 (round 4→6, unchanged) was a real
number on a weak test — 14 probes, TypeScript-only, scored against only the 26 artifacts installed
in this project, with a 0-margin tie counting as a PASS. Lane P2 (`docs/audits/tools/lane-p2-probe.js`)
fixes all four weaknesses: 45 probes across every language, scored against the whole catalog, a
required margin (a tie is a FAIL), and deliberate adversarial near-miss / cross-language-confusion /
negative probes. The old script is untouched so the round 1–7 trend line stays comparable.

**Root-caused, not guessed:** the dominant failure mode was Angular's 7 agents + 5 skills never
mentioning "Angular" literally anywhere in `description`/`whenToUse` — a real, mechanically
verifiable gap (confirmed by scripting a language-name-presence check across every language-scoped
artifact), not a proxy-metric artifact. Every other language's own artifacts already name their
language somewhere. Fixed all 12 files.

**Two probes were themselves wrong**, found while diagnosing failures: probe #42 expected
`python/py-architect`, an id round 7 itself renamed to `python/py-architecture-reviewer` earlier in
this same round; probe #37 expected `shared/code-reviewer` for a Python-diff prompt, stale now that
`python/py-code-reviewer` exists (mirrors probes #40/#41's own established pattern of preferring a
language-specific reviewer). Both corrected.

**Post-fix score: 18/45** (15 → 18 after the Angular fix + 2 probe corrections; re-verified after a
clean reinstall). The honest remaining gap: **most of the other ~27 failures are near-ties between
2-5 language-parallel siblings sharing generic vocabulary** ("review a diff... bugs, correctness...
quality... severity-ranked report" appears in some form in all 5 languages' code-reviewer). This is
a structural ceiling of the bag-of-words-without-stemming proxy method itself, documented in Lane
P2's own header comment: a real dispatching model reads "TypeScript project" and "NuGet package" as
unambiguous _semantic_ language signals; an exact-token scorer treats "npm" (which several
descriptions mention incidentally) as equally strong a signal as the literal language name. Chasing
45/45 by keyword-stuffing 30+ more descriptions to win an exact-match arms race would degrade real
prose quality for a proxy-metric number — declined. Lane U (real historical dispatch) remains this
project's source of truth for actual routing correctness, exactly as the original Lane P's header
comment already states.

## Lane K (new) — pairwise trigger-collision matrix

`docs/audits/tools/lane-k-collision.js` created: computes Jaccard token overlap of
`description + whenToUse` for every skill/agent pair, surfacing the same structural collision Lane
P2's near-ties exposed, as a standing, re-runnable diagnostic for future rounds rather than a
one-time read.

## Parity buildout — python and react now match csharp/typescript/angular's shape

Round 1's estimate ("~19 missing artifacts") was stale; measured against the actual csharp family
set (11 rules + 7 agents + 7 skills = 25), python and react each held only 3. True parity was
**44 new artifacts + 4 renames**, executed in full:

| Kind   | Per language            | Families                                                                                                                                             |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules  | 11 (10 new + 1 renamed) | async, code-quality, conventions, dependencies, documentation, git, logging, project-layout, security, testing, + one ecosystem rule (packaging/npm) |
| Agents | 7 (6 new + 1 rewritten) | api-compat-reviewer, architecture-reviewer, code-reviewer, debugger, performance-profiler, refactor-specialist, security-auditor                     |
| Skills | 7 (6 new + 1 renamed)   | add-package, audit-deps, document, generate-tests, release, scaffold-project, sync-tests                                                             |

Renames (via `sigil move`, reference-graph-safe): `py-style`→`py-conventions`,
`react-style`→`react-conventions`, `py-pytest-testing`→`py-generate-tests`,
`component-testing`→`react-generate-tests`, `py-architect`→`py-architecture-reviewer` (extended
with a design-vs-review mode selector, matching round 5's `cs-architecture-reviewer` merge
pattern), `react-architect`→`react-architecture-reviewer` (same). `packs.yaml`, `README.md`, and
`docs/guides/consuming.md` updated to the new ids; `README.md`'s artifact count and per-language
skill/agent/rule tables updated (96 → 143 artifacts).

**Content is genuinely idiomatic, not mechanically ported** — the same bar round 5's `ng-async`/
`ng-project-layout` were held to. Python: `asyncio.TaskGroup`, `ruff`/`mypy`, `uv`/`pyproject.toml`,
`pytest` fixtures/`parametrize`, `pip-audit`, `hmac.compare_digest`, `warnings.deprecated`. React:
Server vs. Client Components, TanStack Query over raw `fetch`-in-`useEffect`, `dangerouslySetInnerHTML`
sanitization, bundle-size vetting via bundlephobia, Testing Library's role-priority queries,
`next/dynamic`/`React.lazy` code-splitting.

**`catalog-symmetry`'s family-matching had a latent bug, caught before it could bite**: its
language-prefix regex (`/^[a-z]{2,3}-/`) strips `cs-`/`ts-`/`ng-`/`py-` but never matches `react-`
(5 characters) — every react artifact would have landed in its own singleton family, silently
defeating the whole symmetry check for react the moment it crossed the 15-artifact "fully-built"
threshold this round. Fixed in `src/commands/sync/conformance/rules/catalog-symmetry.ts`:
`familyOf()` now tries the artifact's own `${language}-` prefix first (covers `react-`), falling
back to the short-code regex for languages whose id prefix isn't their language name. Verified live:
`sync --check` now correctly reports a real `npm` rule-family asymmetry (react + typescript only,
by design — csharp has `nuget`, python has `packaging`, different names) that was mechanically
undetectable before this fix.

## Sync-check delta

|                         | Before (round 6 end) | After (round 7)               |
| ----------------------- | -------------------- | ----------------------------- |
| Artifacts               | 99                   | 143                           |
| `sync --check` warnings | 4                    | 4 (different set — see below) |
| Errors                  | 0                    | 0                             |

The 4 warnings are individually explained, none silently carried:

- `body-density` — `csharp/cs-scaffold-project` (151 lines) and `react/react-generate-tests`
  (107 lines, trimmed from 122 this round) remain over the ~90-line target. Measured whether a
  second, higher exemplar band for "scaffold"/"multi-pattern" skill shapes was actually warranted
  (Phase 5's original plan) by pulling real body-line counts across the whole `scaffold-project`
  and `generate-tests` families first: `typescript/ts-scaffold-project` sits at 76 lines and
  `typescript/ts-generate-tests` at 74 — **the exemplar's own siblings stay lean**, which
  contradicts the "this family structurally needs more space" hypothesis. Declined to add a second
  exemplar band; instead trimmed `python/py-scaffold-project` (103→~90, cleared),
  `react/react-scaffold-project` (98→~90, cleared), `python/py-generate-tests` (108→~90, cleared),
  and `react/react-generate-tests` (122→107, reduced but not cleared) using the same
  redundancy-only cutting discipline rounds 5–6 established. `cs-scaffold-project` remains the one
  genuine long-tail outlier, tracked across 4 rounds now (186→162→151, unchanged this round —
  out of this round's python/react scope).
- `catalog-symmetry` (2) — both deliberate, both newly _visible_ only because of this round's
  `familyOf()` fix: `npm` exists for react+typescript only (csharp/python have their own
  differently-named ecosystem rule by design), `scaffold-project` still absent from angular
  (documented since round 1 — `ng generate` already covers it).

## Perf fixes — round 6's 6 backlogged findings, all closed

| Finding                             | File                                                   | Fix                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High: quadratic catalog re-scan     | `commands/sync/conformance/rules/related-artifacts.ts` | Indexed agents by language once (`groupAgentsByLanguage`) instead of a full-catalog `.filter()` inside the per-artifact loop, in both `detect()` and `candidateSiblings()` |
| High: quadratic catalog re-scan     | `commands/import-report.ts`                            | Indexed artifacts by topic once (`groupArtifactsByTopic`) instead of a full-catalog `.filter()` per imported item in `computeOverlapLines`                                 |
| Medium: duplicate `find()`-in-loop  | `commands/uninstall.ts`                                | `findDriftedPaths` now indexes `removedEntries.flatMap(...)` once into a `Map<path, file>` instead of re-flattening per path                                               |
| Medium: duplicate `find()`-in-loop  | `commands/prune-apply.ts`                              | Same fix as `uninstall.ts` (identical pre-existing duplicate helper)                                                                                                       |
| Medium: duplicate `find()`-in-loop  | `commands/update-stale.ts`                             | `rebuildEntryFiles` now indexes `entry.files` once into a `Map<path, sha256>` instead of `.find()` per fresh file                                                          |
| Medium: quadratic sibling-set build | `targets/claude-code/plugin-assemble.ts`               | `computeSharedAgentIds` now checks a `Set<agentId>` instead of `agents.some()` per (skill, resolvedAgentId) pair                                                           |

All behavior-preserving; `npm run check` confirms 564/564 with no regressions.

## Verification (clean teardown → reinstall → re-measure, not inferred from the edits)

```
npm run check              → lint clean, format clean, doc-comments clean, 564/564 tests
sigil validate             → ✓ All 143 artifact(s) are valid.
sigil sync --check         → 0 errors, 4 warnings (all explained above)
sigil uninstall <26 ids>   → 0 manifest entries after (clean)
sigil add <26 ids>         → 26/26 reinstalled
sigil add pack:python-starter → 3 new files (py-generate-tests + fixtures ref + py-conventions dep)
sigil add pack:react-starter  → 3 new files (react-generate-tests + testing-library ref + react-conventions dep)
sigil status                → 33 artifact(s): 33 up-to-date
lane-p-probe.js (original) → 13/14 (see "Multi-language install" note below — not a regression, a new real scenario)
lane-p2-probe.js (new)     → 18/45 (up from 15/45 pre-fix)
```

**Note — original Lane P's 14/14→13/14 is a genuinely new, honest data point, not a regression to
paper over.** Round 7 is the first round to install typescript, python, and react artifacts into
this same project simultaneously (via `pack:python-starter`/`pack:react-starter`, testing the
parity buildout end-to-end). Probe #1 ("Add the lodash-es package to this project") now ties
`typescript/ts-add-package(2)` against `python/py-generate-tests(2)` — a real collision that only a
genuinely multi-language install surfaces, and one the original 14-probe TypeScript-only lane was
structurally incapable of ever catching. This is exactly the kind of gap Lane P2 exists to catch
systematically; the original lane is kept unmodified for trend continuity per its own stated design.
