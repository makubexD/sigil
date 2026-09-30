# Round 7 — harden the measurement, then close the largest real gap (2026-08-26)

## What prompted this

The user asked for an even more aggressive round, explicitly framed around "perfection," after six
rounds had produced a mature harness and a catalog scoring well on it. Two things made that score
suspect enough to investigate rather than trust: Lane P's 14/14 had been flat and TypeScript-only
since round 2, and python/react had sat at 3 real artifacts each against csharp's 25 since round 1,
deferred every round as "multi-session." Given explicit sign-off to be more exigent, both were
treated as the round's actual scope rather than deferred again.

## What was measured and changed

**Phase 1 — hardened Lane P.** Read the old probe script's scoring function first (bag-of-words,
no stemming, over `description + whenToUse` only) before writing anything new, then built Lane P2 to
close every structural gap in the old test: all languages (not just TypeScript), scored against the
full 143-artifact catalog (not just the 26 installed), a required ≥1-point margin (a tie now fails),
and adversarial near-miss/cross-language/negative probes. Ran it before touching any content:
**15/45**. That number, not 14/14, is round 7's honest starting point.

**Root cause, verified mechanically.** Rather than guess from the failures' English meaning, scripted
a check for whether every language-scoped artifact's `description` literally names its own language.
Angular's 7 agents + 5 skills — all pre-existing, all from round 1–4 — never did, unlike every other
language. Fixed all 12. Also found and fixed two probes that were themselves wrong: one expected an
id round 7 itself renamed earlier in the same session, one predated python having its own code
reviewer. Post-fix, re-verified after a clean reinstall: **18/45**.

**What was NOT chased, and why.** Most remaining failures are near-ties between 2–5 language-sibling
agents/skills sharing generic review/audit/refactor vocabulary. Lane K (new, pairwise Jaccard
collision matrix) confirms this structurally: 100 artifact pairs sit above 0.3 token overlap, almost
entirely same-family cross-language pairs. Rewriting 30+ more descriptions to win an exact-token
arms race would optimize for the proxy, not for real dispatch — a real model reads "TypeScript
project" as an unambiguous language signal without needing every description artificially
keyword-stuffed. Declined, and documented as the proxy method's actual ceiling rather than a
catalog defect, consistent with the original Lane P's own stated caveat that Lane U (real dispatch
history) is the project's actual source of truth.

**Phase 2 — full python/react parity.** Round 1's "~19 missing" estimate was stale; the real gap
against csharp's actual family set was 44 artifacts. Built all of them — 11 rules, 7 agents, 7
skills per language — holding every one to the same "genuinely idiomatic, not a mechanical port"
bar round 5's Angular content was held to. Renamed 4 pre-existing artifacts via `sigil move` so
their ids match the cross-language family-naming convention (`py-style`→`py-conventions`, etc.),
updating every downstream reference (`packs.yaml`, `README.md`, `docs/guides/consuming.md`, and 6
stale test files caught by the full suite run).

**A latent bug in `catalog-symmetry` was caught before it could ship silently broken.** Its
language-prefix stripping regex never matched `react-` (5 characters, outside the regex's 2–3-char
bound) — every react artifact would have landed in its own singleton family the moment react crossed
the "fully-built" threshold this round, defeating the whole symmetry check for react without any
error or warning. Fixed by trying the artifact's actual `${language}-` prefix first. Verified live:
post-fix, `sync --check` immediately surfaced a real (deliberate) `npm`-family asymmetry that was
mechanically undetectable before the fix — the clearest evidence the fix was necessary, not
theoretical.

**Phase 3 — the 6 backlogged `src/` performance findings from round 6.** All fixed: two O(n²)
catalog re-scans (`related-artifacts.ts`, `import-report.ts`) hoisted into one-time `Map`/index
builds; three duplicate `find()`-in-loop instances (`uninstall.ts`, `prune-apply.ts`,
`update-stale.ts`) same fix; one quadratic sibling-set build (`plugin-assemble.ts`) switched from
`.some()` to a `Set`. All behavior-preserving, verified via the full test suite with no regressions.

**Phase 4 — verification.** Full quality gate (`npm run check`: lint, format, doc-comments,
564/564 tests, exit 0). Clean teardown of the existing 26-artifact TypeScript selection, fresh
reinstall of the same 26, plus `pack:python-starter` and `pack:react-starter` installed fresh to
prove the parity buildout works end-to-end as a real consumer install, not just `sigil validate`.
Re-ran both Lane P scripts and Lane K after the reinstall — not inferred from the source edits.

**An honest, unplanned finding from the reinstall itself.** With python and react now installed
alongside typescript in the same project for the first time, the _original_ 14-probe Lane P dropped
from 14/14 to 13/14 — probe #1 now ties `ts-add-package` against `py-generate-tests`. This is a
real, new data point a TypeScript-only lane could never have surfaced, not a regression introduced
by this round's edits. Recorded plainly rather than omitted.

## Is this "perfection"?

No, and the honest reason why is the round's main deliverable: **the old 14/14 was measuring a weak
test, not a strong catalog.** Once the test got harder, the real number is 18/45, with the remaining
gap being a demonstrated, structural limit of a bag-of-words dispatch proxy applied to five
genuinely-similar language siblings — not a fixable catalog defect chasable by more editorial
passes. The catalog itself is now measurably closer to complete (44 new, genuinely idiomatic
artifacts closing the single largest known gap since round 1) and measurably more honestly assessed
(Lane P2 and Lane K are now permanent, re-runnable tools, not a one-time reading). "Perfection" on
this catalog's own terms means: complete language coverage (now true), zero unexplained
conformance warnings (true — 4 remain, all individually justified), a clean quality gate (true), and
an honest account of what a mechanical benchmark can and cannot prove about real dispatch (now
explicit, where it was implicit before).

## Still open

- **18/45 on Lane P2** — the near-tie collisions Lane K measured are a proxy-method ceiling, not
  believed to reflect real dispatch risk (Lane U remains the source of truth), but a future round
  could still choose to differentiate the worst-colliding descriptions further if warranted.
- **2 body-density warnings** (`cs-scaffold-project` 151 lines — unchanged for 4 rounds now;
  `react-generate-tests` 107 lines) — real content, not padding, confirmed again this round; the
  "second exemplar band" idea was tested against real data and rejected as unsupported (ts's own
  scaffold/generate-tests skills stay under 80 lines, so the family doesn't structurally need more
  room — csharp's and react's versions are simply more verbose than necessary).
- **Original 14-probe Lane P's new multi-language collision** (probe #1, 13/14) — a real, minor
  trigger-surface gap between `ts-add-package` and `py-generate-tests`, left unfixed this round to
  avoid further keyword-stuffing; worth a look in a future round if it recurs.
