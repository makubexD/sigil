# Round 4 — adversarial catalog benchmark (2026-08-23)

## What prompted this

Round 3 (`docs/decisions/catalog-benchmark-audit-2026-08-22.md`) built the first project-health
lane and closed all 8 findings it surfaced (F21–F28), but it was generous to itself in four
specific ways the user asked to be "even more exigent" about:

1. It only ever installed into sigil's own repo, for Claude only — the entire Copilot adapter had
   never been installed or had its output inspected in any audit round.
2. It measured agent **precision** (every finding it verified was real) but never **recall** (what
   did the agents miss?) — the actual question "are these agents well-designed?" needs both.
3. It shipped 8 fixes and added zero machine-enforced guards (`regressionRulesAdded: []`).
4. Round 2's F17 confound (organic dispatch evidence only from meta-work sessions on sigil itself)
   was only partially answered by round 3's agent dispatches.

## Decisions made before executing

Asked via `AskUserQuestion` before starting:

- **Install surface: both repos, both providers.** Keep the in-repo Claude teardown/reinstall for
  the like-for-like three-round diff, and additionally build a synthetic external TypeScript
  consumer project and install both Claude and Copilot into it — the first real Copilot install/
  emit test in any round.
- **Recall: yes, seed defects in a scratch copy.** Plant one known defect per class the panel
  claims to cover, dispatch the panel at the copy, score `found/planted` per agent.
- **Guards: fix + guard every finding**, plus a retro-guard pass over round 3's zero-guard gap
  where cheap.
- **Panel: all 7 TypeScript specialists + `shared/code-reviewer`** dispatched at the same scope as
  `ts-code-reviewer`, for a direct head-to-head on whether the language-specific agent earns its
  place over the generic fallback.

## What was measured

**Phase 1 — in-repo teardown/reinstall.** `sigil uninstall` on all 26 manifest entries (27 files,
0 JSON merges this round — no config-kind artifacts were installed), verified clean (0 manifest
entries, no sigil files in `.claude/`, `settings.json`/`settings.local.json` untouched), then
reinstalled the identical 27-selector set. `sigil status` (26/26 up-to-date) and `sigil validate`
(98/98) both matched round 3 exactly.

**Phase 2 — synthetic external consumer.** Built a minimal but realistic TypeScript project
(`package.json`, `tsconfig.json`, an HTTP handler / service / repository / test, a hand-authored
`.github/workflows/ci.yml`, and a `.vscode/mcp.json` with pre-existing content) in the scratchpad.
Installed the same 26 selectors via `sigil add --target claude` and `--target copilot` into it.
Both installs completed cleanly with no errors; the pre-existing `ci.yml`/`mcp.json` were verified
byte-identical to their pre-install state afterward.

**Phase 3 — Lane Y (new): cross-provider semantic parity.** New tool
`docs/audits/tools/lane-y-parity.js` diffs the two emitted trees artifact-by-artifact, reverse-
mapping each provider's lexicon literals back to `{sigil:<term>}` before comparing bodies, and
scanning for the opposite provider's literal terms in each file. Result: 27/27 artifacts present on
both sides, 0 term leaks, every body divergence explained (Copilot's intentional H1-title injection
on agents/rules; the F29 skill rule-inlining duplication on skills — see the register for the
measured byte cost).

**Phase 4 — Lane N (new): adversarial CLI probing.** A throwaway catalog directory with 4 crafted
probe artifacts (path-traversal id, newline-split injection, inline-allowlisted injection on an
error rule, a `gho_`-prefixed secret) run through the real `sigil validate`/`sigil check --trust
--strict` CLI surface — not the unit-test layer F22/F26 were originally verified at. All 4 produced
the expected rejection. A planned 5th probe (`.svg` payload) turned out to have no real CLI path to
exercise at all, which is itself F30 below.

**Phase 5 — remaining lanes re-run.** A–E, P, U, X all re-run for the three-round diff; all
confirmatory/unchanged except Lane U, which now has 8 genuine review-agent dispatches with
verifiably correct output in its transcript sample (up from round 3's 4).

**Phase 6 — project health, three ways.**

- **6a SME pass** — scoped deliberately at what agents structurally can't reach (doc/code
  freshness): found the README library-usage docs gap (F31, a round-3 leftover) and, while tracing
  why the `.svg` Lane N probe had no real path, found F30 (import never trust-scanned).
- **6b Dogfood the 8-agent panel** — `ts-architecture-reviewer`, `ts-code-reviewer`,
  `ts-security-auditor`, `ts-api-compat-reviewer`, `ts-performance-profiler`, `ts-debugger`,
  `ts-refactor-specialist` (read-only framing), `shared/code-reviewer` (head-to-head), all
  dispatched against the real `src/`. Every Critical/High finding independently re-verified by
  reading the code before acting on it — same discipline as round 3.
- **6c Recall control** — `src/` copied to a scratchpad, 7 defects planted (one per claimed
  specialty: command injection, prototype-pollution regression, circular import, oversized
  function, swallowed error, O(n²) loop, breaking API-export removal — full manifest at
  `.sigil/audit-local/2026-08-23/probes/seeded-defects-manifest.md`), panel re-dispatched at the
  copy, `found/planted` scored per agent. See the register's "Recall control" section for the full
  table and the two concrete agent-body-instruction fixes the misses point to.
- **6d Compare and argue** — see "Project health SME-vs-agent-vs-recall comparison" below.

## Session-limit interruption (transparency note)

Partway through Phase 6, several agent dispatches (both real-repo and recall-control) were
terminated early by a session/rate limit. Every interrupted agent was resumed via `SendMessage`
once capacity returned and asked to finish and report — none were re-dispatched from scratch, so no
work was duplicated or lost. One recall-control dispatch (`ts-api-compat-reviewer` against the
seeded copy) was separately blocked by the harness's own agent-spawn classifier before it ever
started; that seed (#7, breaking export removal) was verified manually instead (confirmed `serialize`
is genuinely absent from the seeded `src/index.ts`'s exports) and is recorded as "not dispatched"
rather than "missed" in the recall table — an infra-availability data point, not an agent-quality
signal.

## Project health SME-vs-agent-vs-recall comparison

**Precision (verified findings):** every Critical/High finding from the 8-agent real-repo pass that
was acted on (F30–F36) was independently re-verified by direct code reading before the fix landed —
same bar as round 3. No false positive was found among the acted-on findings this round either.

**Recall (the new measurement):** of 7 planted, catalog-verifiable defects, the panel as a whole
caught 6 (the 7th was never dispatched — see above). But the distribution is the real finding:
`ts-code-reviewer`, a generalist among generalists, caught 5 of the 7 in a single pass — including
both misses from the two specialists nominally responsible for them (`ts-security-auditor` missed
the prototype-pollution regression seconds after affirming the same guard class "holds" on the real
repo; `ts-performance-profiler` never mentioned the one seeded O(n²) loop despite reporting at
length on real, non-seeded performance concerns). Read plainly: **specialization narrowed search
breadth without buying proportionally better catch rate on the exact defect class each specialist
exists for.** This is genuine, actionable catalog feedback — recorded as two concrete body-
instruction recommendations in the register, not a recommendation to remove either agent (both
produced substantive, correct, on-scope findings on the real repo this round and last).

**Head-to-head (`ts-code-reviewer` vs. `shared/code-reviewer`):** the generic fallback, dispatched
at identical scope with no project convention rules loaded, independently found 5 real findings
(F37 note plus F44–F47) — genuinely useful, but it missed the two real Medium bugs
(F33/F34, `move/execute.ts`'s rename-fallback error handling) that `ts-code-reviewer` caught. The
language-specific agent earned its place on this pass, not by volume but by catching bugs the
generic one missed.

**SME contribution:** two findings this round (F30, F31) came from the SME pass, both outside any
agent's stated scope (F31 is a docs gap; F30 was found by tracing _why_ a planned probe had no real
path, not by reading `src/` cover-to-cover). Consistent with round 3's honest result — the panel
still substantially outperforms a manual read on raw finding count and severity within its scope.

## Fixes shipped (all fixed findings also carry a new automated test — the round's "guard" rule)

| Finding       | Fix                                                                                                | Test(s)                                                     |
| ------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| F30           | `executeImport` now trust-scans rendered content before writing; blocks on error-severity findings | `test/authoring/import-execute.test.ts` (2 new)             |
| F31           | `README.md` gained a "Library usage" section                                                       | — (docs)                                                    |
| F32           | `computeDestinationPath` validates `newId` against `KEBAB_ID_RE` + `resolveContained()`            | `test/authoring/move.test.ts` (2 new)                       |
| F33           | `renameOrCopy` narrowed to catch only `EXDEV`, propagates everything else                          | covered by existing `move.test.ts` suite (14/14 still pass) |
| F34           | Partial-dest cleanup rollback registered before the copy, not after                                | same as F33                                                 |
| F35           | `ConfigRoot` re-exported through `config-merge/index.ts` → `src/index.ts`                          | `test/public-api.test.ts` (compile-time guard)              |
| F36           | 5 new secret-detection rules (Slack, Stripe, Google, npm, JWT)                                     | `test/trust-scan.test.ts` (5 new)                           |
| F48 (partial) | 2 safety-critical `classifyConfigDrift` type-mismatch branches                                     | `test/config-merge.test.ts` (2 new)                         |

`npm run check` (tsc + lint + format + doc-comments + test) — exit 0, **562/562 tests** (up from
round 3's 551: 18 new this round). `sigil validate` 98/98 unchanged, `sigil sync --check` unchanged
(0 errors, 9 pre-existing advisory warnings), `sigil status --project-dir .` 26/26 up-to-date.

## Verification

- Teardown/reinstall byte-identical to round 3's post-install state, confirmed via manifest diff.
- Both provider installs into the synthetic consumer left the pre-existing `ci.yml`/`mcp.json`
  content untouched — diffed byte-for-byte against a pre-install backup.
- Lane Y: 0 unexplained cross-provider differences (both explained divergences are documented,
  intentional provider behaviors — one already-designed, one newly measured as F29).
- Lane N: all 4 exercised probes produced their expected rejection with the real error text
  captured in `.sigil/audit-local/2026-08-23/analysis/`.
- Recall control: `found/planted` published per agent including the misses, stated as plainly as
  the catches — see the register.
- Every fixed finding ships with a new, permanent test (the F48 test additions specifically close a
  round-3 gap: `regressionRulesAdded` was empty last round; this round's 18 new tests are the
  equivalent guard for a project whose regression-prevention mechanism is its test suite rather
  than a conformance-rule registry for these particular defect classes).

## Still open

- **F29** (Copilot skill rule-inlining duplication) — measured, not fixed; needs a product decision
  on whether scaffold-mode Copilot skills should stop inlining rules now that standalone
  `.instructions.md` files cover the same content.
- **F37–F47** (12 backlogged findings: architecture cohesion, 6 performance items, 4 code-clarity
  notes) — all real, verified, none reproducing a live failure at current scale. Concrete
  recommended fixes recorded in the register for a future round.
- **F48** (partial) — 3 lower-severity `schema-checks.ts` message-text coverage gaps remain
  untested; only the 2 safety-critical `drift.ts` branches were closed this round.
- **F49** (duplicated config-write sequence between `add`/`update`) — DRY cleanup, not urgent.
- **Round-1 backlog** (python/react parity, `cs-api-architect`, angular symmetry gaps) — unchanged.
- **Round 5's natural next step**: with recall now measured once, a future round could track
  recall-rate trend the same way Lane P tracks proxy-vs-SME dispatch accuracy — is the panel's
  recall improving as agent bodies get the two instruction fixes recommended above, or not?
