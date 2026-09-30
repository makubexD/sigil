# Catalog audit round 6 — follow-through register (2026-08-25)

Scope: round 5's own evidence-driven candidate pool — a second editorial pass on the 3 remaining
body-density warnings, and a re-measurement of round 5's Lane R agent-body instruction fixes
against the same seeded-defect scratch copy round 4 used, to check whether those fixes actually
moved recall rather than just being applied. Full methodology:
`docs/decisions/catalog-content-improvement-round-2026-08-24.md`'s "Is this significant enough to
run round 6?" section.

## Lane E1 (continued) — second body-density pass

**Result: further reductions on all 3 remaining artifacts; none newly fully resolved, all now
closer to the exemplar target than round 5 left them.**

| Artifact                     | Round 4 | Round 5 | Round 6 | Total reduction  |
| ---------------------------- | ------- | ------- | ------- | ---------------- |
| `csharp/cs-scaffold-project` | 186     | 162     | **151** | -35 lines (-19%) |
| `react/component-testing`    | 141     | 131     | **122** | -19 lines (-13%) |
| `python/py-pytest-testing`   | 123     | 113     | **107** | -16 lines (-13%) |

Edits this round: compressed `cs-scaffold-project`'s Step 1 discovery checklist from 5 bullets to
one paragraph, dropped the placeholder test's unused AAA-comment scaffolding (the pattern is
already taught in full in `cs-generate-tests` — `cs-scaffold-project`'s seed test doesn't need to
re-teach it); removed `py-pytest-testing`'s unused `AsyncMock, MagicMock` import (dead code in the
example — nothing in the snippet used them) and merged the async-setup TOML block into prose;
compressed `component-testing`'s provider-wrapping example to remove now-redundant import lines
already established earlier in the file. All three still carry genuinely distinct real content
(confirmed again this round by re-reading before cutting) — none of these three are expected to
fully close without either losing real teaching value or the exemplar target itself being
reconsidered for skills with a structurally different shape (scaffolding, multi-pattern testing
guides) than the read-only report skill (`ts-audit-deps`) the target derives from.

## Lane R — recall-control re-measurement (round 5's own recommended next step)

Round 5 applied two body-instruction fixes recommended by round 4's recall control
(`ts-security-auditor`: check every `FORBIDDEN_KEYS`-style guard call site individually, don't
sample; `ts-performance-profiler`: sweep every source file, don't limit to files that look
"central") but did not re-verify them. This round rebuilt the exact seeded-defect scratch copy
(round 4's seed #2 — a removed `FORBIDDEN_KEYS` guard in `config-merge/apply.ts`'s top-level loop —
and seed #6 — an O(n²) `findDuplicates` in a small, non-central `seed-quality.ts` file) against the
**current** `src/` (carrying both round-5 body-instruction fixes) and re-dispatched both agents.

**Result: both instruction-depth fixes worked — both previously-missed seeds are now caught.**

- `ts-security-auditor` caught seed #2 explicitly (High, exact file/line, correct mechanism —
  bracket assignment on a plain object triggering the inherited `__proto__` setter) — a clean miss
  → catch, confirming the "check every call site individually" instruction closed the gap.
- `ts-performance-profiler` caught seed #6 explicitly (Critical, correct complexity class and fix),
  explicitly noting it swept every file rather than only "central"-looking ones — the exact
  behavior the round-5 instruction asked for.

**Bonus finding — a real, unseeded, previously-undiscovered vulnerability.** Sweeping exhaustively
(the same instruction-depth fix that closed seed #2) also surfaced a genuine gap in the real
codebase, not a planted one: `src/authoring/import/parse-markdown.ts`'s `parseFrontmatterLines` —
the tolerant frontmatter parser behind `sigil import`, the one real path where an externally
authored file's frontmatter keys reach a plain object — had **no `FORBIDDEN_KEYS` guard at all**,
unlike every merge/assign site in `config-merge/`. A frontmatter key literally named `__proto__`
would reach `fm[parsed.key] = parsed.value` on a plain object literal via bracket assignment,
corrupting that object's prototype chain. **Fixed this round** — same guard, same import, 2 new
tests (`test/authoring/parse-markdown.test.ts`). This is the clearest evidence yet that a
recall-control re-measurement is worth running on a real cadence: it doesn't just confirm a fix
worked, it can surface real, previously-invisible bugs as a side effect of forcing exhaustive
coverage.

`ts-performance-profiler` additionally surfaced 2 new real High-severity O(n²) findings on the real
codebase (`commands/sync/conformance/rules/related-artifacts.ts`'s per-agent catalog re-scan,
`commands/import-report.ts`'s per-import-item catalog re-scan — both run on every `sync --check`/
`import`, both scale with total catalog size) and 4 Medium findings (duplicate `find()`-in-loop
patterns in `uninstall.ts`/`prune-apply.ts`/`update-stale.ts`, an O(n²) sibling-set build in
`plugin-assemble.ts`). All are real, `src/`-level performance findings — out of this round's
catalog-content scope, backlogged for a future `src/`-level round rather than fixed here.

## Fixed this round (real `src/` finding, not catalog content)

| Finding                                                                                                                         | Fix                                                       | Test(s)                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `parseFrontmatterLines` (import path) had no `FORBIDDEN_KEYS` guard — the one real untrusted-content boundary in `sigil import` | Added the same guard used everywhere else in the codebase | `test/authoring/parse-markdown.test.ts` (2 new) |

`npm run check` — exit 0, **564/564 tests** (up from round 4's 562: 2 new prototype-pollution
tests, and 1 stale test corrected to assert `cs-api-architect`'s absence after round 5's merge).
`sigil validate`/`sync --check`/`madge --circular` all unchanged otherwise.

## Measured before/after (round 5 → round 6)

| Metric                                                   | Round 5                       | Round 6                                                | Delta                                                                         |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `sync --check` warnings                                  | 4                             | 4                                                      | unchanged (no warning class fully closed, all 3 body-density reduced further) |
| Body-density total lines (3 remaining artifacts, summed) | 406                           | **380**                                                | -26 lines                                                                     |
| Lane R recall (2 seeds re-tested)                        | 0/2 caught (round 4 baseline) | **2/2 caught**                                         | Both instruction-depth fixes confirmed working                                |
| Real `src/` findings surfaced incidentally               | —                             | 1 fixed (prototype-pollution gap), 6 backlogged (perf) | New evidence, not predicted                                                   |
| Lane P mechanical probe score                            | 14/14                         | 14/14                                                  | unchanged, re-verified after reinstall                                        |
| `sigil validate`                                         | 99/99                         | 99/99                                                  | unchanged                                                                     |
| Teardown/reinstall                                       | clean                         | clean                                                  | unchanged, verified again                                                     |
