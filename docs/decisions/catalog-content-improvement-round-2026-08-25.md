# Round 6 — follow-through on round 5's own evidence (2026-08-25)

## What prompted this

Round 5 pre-committed to a second round in this session and measured a genuine, significant
improvement (Lane P: 10/14 → 14/14 after 3 flat rounds; `sync --check`: 9 → 4 warnings) — clearing
the bar the user set ("if we see significant difference/improvements ... run a new additional
round"). Round 5's own decision log named round 6's evidence-driven candidate pool precisely: a
second pass on the 3 body-density warnings that were reduced but not eliminated, and — the
highest-value item — re-measuring whether round 5's two agent-body instruction-depth fixes
(applied to `ts-security-auditor` and `ts-performance-profiler` per round 4's own recommendation)
actually improved recall, since round 5 applied them without re-verifying.

## What was measured and changed

**Phase 0 — baseline.** Fresh `.sigil/audit-local/2026-08-25/baseline/` snapshot of round 5's
end state.

**Phase 1 — second body-density pass.** Re-read all 3 remaining flagged skills before cutting
anything further, specifically checking for genuinely redundant content missed in round 5's first
pass rather than mechanically shaving lines. Found and removed real slack: an unused
`AsyncMock, MagicMock` import in `py-pytest-testing`'s mocking example (dead code — nothing in the
snippet used them), a 5-bullet discovery checklist in `cs-scaffold-project` compressible to one
paragraph without losing any check, and a placeholder test's full AAA-comment scaffolding in
`cs-scaffold-project` that duplicated teaching already done in full by `cs-generate-tests`. All 3
files reduced further (see register for exact numbers); none fully closed — same honest read as
round 5: the remaining content in each is genuinely distinct, not padding.

**Phase 2 — Lane R recall-control re-measurement.** Rebuilt the exact seeded-defect scratch copy
from round 4's manifest (seed #2: a removed `FORBIDDEN_KEYS` guard in `config-merge/apply.ts`'s
top-level loop; seed #6: an O(n²) `findDuplicates` in a small, non-central `seed-quality.ts` file),
this time copying the **current** `src/` — carrying both round-5 body-instruction fixes — as the
base, then re-dispatching both agents with the same prompts round 4 used.

**Result: both fixes worked.** `ts-security-auditor` caught seed #2 (previously missed) with the
exact correct mechanism explained. `ts-performance-profiler` caught seed #6 (previously missed),
explicitly noting it swept every file rather than limiting to "central"-looking ones. This is a
real, closed-loop confirmation — round 4 found the gap, round 5 applied a specific fix, round 6
proved the fix worked, using the same seeded-defect methodology throughout for a clean before/after.

**Unplanned but valuable: a real bug surfaced as a side effect.** The same exhaustive-sweep
instruction that fixed seed #2's recall also caused `ts-security-auditor` to find a genuine,
previously undiscovered vulnerability in the real (non-seeded) codebase:
`src/authoring/import/parse-markdown.ts`'s frontmatter parser — the one real path where an
externally-authored file's keys reach a plain object during `sigil import` — had no
`FORBIDDEN_KEYS` guard, unlike every other merge/assign site in the codebase. This is exactly the
kind of result a recall-control re-measurement should produce beyond its stated purpose: forcing
genuinely exhaustive coverage doesn't just re-confirm what you already knew was fixed, it can catch
what nobody had looked for yet. Fixed immediately (2 new tests), verified via `npm run check`
(564/564) and a re-run of `sigil validate`/`sync --check`/`madge --circular` — all clean, no
regression from the fix.

`ts-performance-profiler` also surfaced 6 additional real `src/`-level findings (2 High, 4 Medium —
see register) on the actual codebase while doing its exhaustive sweep. These are genuine and
specific but out of this round's catalog-content scope; backlogged rather than fixed, to keep this
round's actual scope honest rather than silently expanding into a full `src/` audit round.

**Phase 3 — verification.** Full quality gate (`npm run check`, 564/564, exit 0) since this round
did touch `src/` (the parse-markdown.ts fix, unlike round 5 which was catalog-content-only). Clean
teardown + reinstall of the same 26-selector set (0 entries after uninstall, 26/26 up-to-date after
reinstall). Re-ran Lane P (14/14, unchanged), `sync --check` (4 warnings, unchanged class, lower
line counts), `sigil validate` (99/99), `madge --circular` (still 8 pre-existing type-only cycles,
no new one introduced by the `parse-markdown.ts` → `config-merge/primitives.ts` import).

## Is round 6 itself "significant enough" to warrant a round 7?

Two rounds were pre-committed for this session and both have now run. Round 6's improvement is real
but narrower in scope than round 5's (a confirmation-and-incidental-fix round, not a new
trigger-surface breakthrough) — the honest read is that the catalog-content thread the user asked
to pull on has now produced its two highest-value results (Lane P's plateau break, and the recall
control's closed loop). What remains open is either genuinely long-tail (3 body-density warnings
that may need a different exemplar class, not more shaving), explicitly out-of-scope for a
catalog-content round (6 real `src/`-level performance findings, python/react parity), or requires
a decision only the user should make (whether `~90 lines` is the right target for every skill
shape). Recommending the session stop at two rounds and let the user decide whether to open a
`src/`-level round 7 for the performance findings, rather than auto-continuing into scope this
plan never covered.

## Still open

- **3 body-density warnings**, further reduced (`cs-scaffold-project` 151, `component-testing` 122,
  `py-pytest-testing` 107 — all down from round 4's 186/141/123) but not eliminated. Recommend a
  future round decide whether the `~90`-line target needs a second exemplar class rather than
  continuing to shave real content.
- **6 real `src/`-level performance findings** surfaced by this round's recall re-test (2 High in
  `related-artifacts.ts`/`import-report.ts`, both scale with total catalog size and run on every
  `sync --check`/`import`; 4 Medium duplicate-scan patterns). Not fixed — out of this round's
  catalog-content scope. Strong candidate for a future `src/`-level round.
- **python/react parity** (~19 artifacts/language) — still explicitly deferred, unchanged judgment
  from round 1.
- **Round 4's remaining backlog** (F37–F49 minus what round 6 incidentally fixed) — unchanged.
