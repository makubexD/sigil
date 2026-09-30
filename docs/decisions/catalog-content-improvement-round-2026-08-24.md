# Round 5 — auto-improving the catalog itself (2026-08-24)

## What prompted this

Four audit rounds built a full measurement harness and used it almost entirely on sigil's own
`src/` code. The user's actual standing ask — "auto improve our catalog, meaning the artifacts we
have" — had been _measured_ repeatedly but the artifact content itself had barely moved since
round 1's initial pass. Specifically, three numbers had been flat for three consecutive rounds:

- Lane P's mechanical dispatch-probe score: **10/14 in rounds 2, 3, and 4, unchanged.**
- `sigil sync --check`'s warning count: **9 warnings, unchanged rounds 2–4** (6 body-density + 3
  catalog-symmetry).
- Round 1's `csharp/cs-api-architect` MERGE recommendation and the `ng-async`/`ng-project-layout`
  content-gap recommendation: both **carried forward unactioned through rounds 2, 3, and 4.**

The user asked to start from a clean install, make real content improvements, verify by
reinstalling and re-measuring, and — if the improvement is real and significant — run a second
round in the same session. This is that round, plus its verification.

## Decisions made before executing

Asked via `AskUserQuestion` before starting:

- **Author `ng-async`/`ng-project-layout`, leave `ng-scaffold-project` absent** — round 1 judged
  the first two real content gaps and the third a genuine ecosystem non-gap (Angular CLI already
  covers scaffolding).
- **Merge `cs-api-architect` into `cs-architecture-reviewer` now** rather than defer a fifth round.
- **Run two improve→reinstall→measure cycles** (round 5, then round 6) in this session, deciding
  round 6's actual content only after round 5's real numbers are in.

## What was measured and changed

**Phase 0 — baseline.** Fresh `.sigil/audit-local/2026-08-24/baseline/` snapshot of the
round-4-end state before any edit.

**Phase 1 — Lane T (trigger-surface fixes).** Read `lane-p-probe.js`'s actual scoring function
first (exact-token bag-of-words over `description + whenToUse`, no stemming) rather than guessing
at the fix from the probe's English meaning. This surfaced the real, mechanical root cause for all
4 non-passing probes at once: two agents' descriptions didn't literally contain the words a plain
English restatement of their own scope would use ("profile", "issues", "break", "major version"),
and two other artifacts' descriptions accidentally token-matched prompts they shouldn't
(`shared/code-reviewer` naming sibling reviewers by id, letting any `.ts`-suffixed prompt
free-match the fragment "ts"; `ts-add-package`'s own disclaimer sentence restating the exact words
of the prompt it was trying to disclaim). Fixed all 4 by rewording — not by changing any agent's
actual scope or capability. See the register for the per-probe before/after.

**Phase 2 — Lane E1 (body-density trim).** Edited 6 flagged skills for density — compressed
repeated code-example boilerplate, merged short prose sections, cut a second illustrative test case
where one was enough to teach the pattern — while checking each edit against the plan's own rule:
never remove a real step, a distinct concept, or a language-specific caveat. 3 of 6 fully resolved;
3 reduced 13–20% and left open with an honest explanation (see register) rather than force-cut real
content to hit an exemplar number that may not fit every skill's actual shape.

**Phase 3 — Lane S (catalog-symmetry).** Authored `ng-async.rule.md` and `ng-project-layout.rule.md`
as genuinely Angular-idiomatic content (not a mechanical find-replace of the TypeScript/C#
versions), explicitly scoped to not duplicate the existing `ng-rxjs`/`ng-signals` rules. Confirmed
`ng-scaffold-project`'s absence is a deliberate ecosystem difference, documented in the register so
it doesn't get silently "fixed" by a future round without re-litigating the reasoning.

**Phase 4 — Lane M (`cs-api-architect` merge).** Read both agents in full, merged the unique
design-forward content into a new numbered section of `cs-architecture-reviewer`, added a mode
selector at the top so the agent still knows when it's reviewing vs. designing, deleted the source
file, updated 2 doc references, and confirmed via Lane A that no reference dangles.

**Phase 5 — full quality gate.** No `src/` file was touched this round (catalog-content-only, as
scoped) — `npm run check` was not required. `sigil validate`: 99/99 clean (98 + 2 new − 1 merged).

**Phase 6 — clean teardown + fresh reinstall.** `sigil uninstall` on all 26 manifest entries (27
files, 0 JSON merges — no config-kind artifacts installed this cycle), verified clean (0 entries,
no sigil files remaining in `.claude/`), reinstalled the identical 26-selector set. 26/26
up-to-date. Re-ran Lane P, Lane C, `sync --check`, and `sigil validate` against the fresh install.

## Verification — the actual, measured result

| Metric                        | Before                | After                                                                        | Verdict                                          |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Lane P mechanical probe score | 10/14 (flat 3 rounds) | **14/14**                                                                    | **Moved for the first time since round 2**       |
| `sync --check` warnings       | 9 (flat 3 rounds)     | **4**                                                                        | **-56%**                                         |
| Round-1 backlog items closed  | 0/2 (flat 3 rounds)   | **2/2** (`ng-async`/`ng-project-layout` authored, `cs-api-architect` merged) | **Closed**                                       |
| `sigil validate`              | 98/98                 | 99/99                                                                        | Clean                                            |
| Teardown/reinstall            | clean                 | clean                                                                        | Unchanged, verified again                        |
| Lane A dangling refs          | 0                     | 0                                                                            | Unchanged, verified again after the merge/delete |

This is a genuine, measured improvement, not an assumed one — every number above was re-derived
from a clean reinstall and a fresh lane run, the same discipline every prior round applied to
sigil's own code, now applied to the catalog's actual content for the first time since round 1.

## Is this "significant enough" to run round 6?

Per the user's own framing ("if we see significant difference/improvements, happy the enhancements
and run a new additional round"): yes on the primary trigger metric (Lane P moved from a 3-round
plateau to a perfect score) and the secondary one (`sync --check` warnings cut more than half). Two
rounds were pre-committed for this session regardless, so round 6 proceeds — see the round-5
register's "Deliberately not done this round" section for what round 6's evidence-driven content
pool actually is (the 3 partially-reduced body-density files, the Lane R recall-control
re-measurement, and nothing pre-decided beyond that).

## Still open

- **3 body-density warnings** (`cs-scaffold-project`, `component-testing`, `py-pytest-testing`) —
  reduced, not eliminated; judged as legitimately dense content, not bloat. A future round should
  decide whether the ~90-line exemplar target fits every skill shape or needs a second exemplar
  class for scaffolding/multi-pattern-teaching skills.
- **Lane R recall-control re-measurement** — the two agent-body instruction fixes
  (`ts-security-auditor`, `ts-performance-profiler`) are applied but not yet re-verified against
  round 4's seeded-defect scratch copy.
- **python/react parity** (~19 artifacts/language) — still explicitly deferred, unchanged judgment
  from round 1.
- **Round 4's 12 backlogged `src/`-level findings** — unchanged, out of this round's scope.
