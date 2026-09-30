# Catalog usage & portability audit — round 2 (2026-08-21)

## What prompted this

Round 1 (`docs/decisions/catalog-quality-audit-2026-08.md`, 2026-08-20) audited the catalog
statically — reference graph, body overlap, lexical trigger-collision detection, context budget —
and could never answer the one question that actually matters: **do these artifacts fire in real
use?** Between that audit and this one, the user reinstalled from scratch (deleted the `.claude/`
subfolders, ran a leaner 27-selector `sigil add`) and asked for a second refinement round explicitly
aimed at usage evidence, plus the beginning of the "spread across any AI provider" question. The
goal stated up front: build a repeatable measurement harness, not another one-off report — later
rounds should diff against this one's `summary.json`, not restart from zero.

## The two pre-execution decisions

Before any measurement, two forks needed resolving (both via `AskUserQuestion`, both approved):

1. **Zero organic usage evidence is inconclusive on its own** — the 8 session transcripts for this
   repo are meta-work on sigil itself (auditing, CLI refactors), not the TypeScript feature work the
   catalog targets. Decision: **probe, then judge** — generate controlled dispatch evidence rather
   than reading passive history as a verdict.
2. **Where do per-run statistics live?** Decision: **`.sigil/audit-local/`** — already gitignored,
   sits next to the manifest the stats are measured against. Only distilled findings land in
   committed `docs/`.

## What the audit found

Full findings table: `docs/audits/2026-08-21/register.md` (F13–F19). Highlights:

**F14 — the round-1 hook fix didn't survive.** `.claude/settings.json` was back to
permissions-only; `shared/protect-config`'s hook merge was absent, and `sigil status` independently
confirmed `[drifted]`. This is the same symptom round 1 fixed (its F5/F7) — but round 1 verified the
fix with `sigil status: up-to-date`, and that verification did not carry forward. Escalated rather
than silently re-fixed a second time — see the dedicated follow-up below, which closed both open
hypotheses and found (and fixed) a real code defect.

### F14 follow-up — root cause found, fixed

A focused investigation (separate plan/approval cycle) closed both hypotheses this document
originally left open:

- **Hypothesis (b) — "the fix never landed" — is disproven.** The session transcript contains the
  verbatim `sigil add hook:shared/protect-config --project-dir . --target claude --scope project
--yes` output from 2026-08-20, printing a `.claude/settings.json` that already contains both
  `permissions` and the corrected `hooks.PreToolUse` fragment. The write genuinely happened;
  `sigil status: up-to-date` was accurate at the time.
- **sigil did not remove it.** There are exactly three config-JSON writers in the codebase
  (`commands/add/execute-config.ts`, `commands/uninstall-config.ts`, `commands/update-config.ts`),
  and none ran with a hook/settings selector during the 2026-08-21 reinstall. `.claude/settings.json`'s
  mtime (14:31:19Z, ~90s before the manifest write) shows an external rewrite — not further
  attributable beyond that; deliberately not guessed at.
- **The actual defect was in sigil's repair path.** `detectConfigDrift` returned a bare boolean, so
  `update-config.ts`'s `configFileNeedsRestore` could not distinguish "sigil's fragment is entirely
  gone" (re-merging is purely additive — safe without confirmation) from "the user edited a value
  sigil contributed" (overwriting would discard a real edit — `--force` is correct). Both collapsed
  to "drifted", so both were refused without `--force`, and `sigil status`'s own closing hint ("Run
  `sigil update`") pointed at a command that had just silently declined. This — not the settings.json
  rewrite itself — is what turned a one-off external event into an unrepairable state.

**Fix shipped:** `src/config-merge/drift.ts` gained `classifyConfigDrift(live, op): 'intact' |
'missing' | 'modified'`, built by extending the module's existing per-strategy walkers to report
which outcome they saw rather than just whether one occurred; `detectConfigDrift` is now a thin
wrapper (`!== 'intact'`) so all 6 pre-existing tests and every other caller are unaffected.
`update-config.ts`'s `configFileNeedsRestore` now auto-restores on `missing` and still gates
`modified` behind `--force`, with a message explaining which case applies. `status-config-check.ts`
labels the two distinctly instead of both reading as generic "drifted".

**A design correction made _during_ the fix, caught by a failing test rather than assumed correct:**
the first implementation classified array-strategy fragments (`array-union`/`array-append` — hooks,
permission lists) the same way as object-spread leaves: any absent contributed item, whether alone
or alongside unrelated content, could be `modified`. A test asserting that an edited hook entry
requires `--force` failed — investigating why showed the classifier can't distinguish "this exact
item was edited" from "this exact item was never here to begin with" once dealing in whole-item
equality, and that **the distinction doesn't actually matter for these two strategies**:
`array-union` dedupes and `array-append` only concatenates, so re-merging can never overwrite or
remove existing content the way `object-spread`'s leaf assignment can. The fix: array-strategy
fragments now always classify as `missing` when an item isn't found, never `modified` — auto-restore
is provably safe there. Restoring a hand-edited hook now appends a second, correct copy alongside
the user's edited one (non-destructive, if slightly redundant) rather than refusing outright. This
is real, deliberate behavior — not what the investigation's own verification plan assumed going in
— and is recorded here rather than quietly matched to the original assumption.

**Applied to this repo:** `sigil update shared/protect-config --project-dir .` (no `--force`)
restored the hook; `.claude/settings.json` now carries both the user's `permissions` and sigil's
`hooks.PreToolUse`. `sigil status` reports `shared/protect-config [up-to-date]`.

**Verification:** `npm run build`, `npm test` (532/532, including 9 new cases — 6 in
`test/config-merge.test.ts` for `classifyConfigDrift`, 3 integration cases in the new
`test/commands/update-config.test.ts`), `npm run check` (tsc + lint + format + test, exit 0),
`sigil validate` (98/98, unchanged) and `sigil sync --check` (0 errors, 9 unchanged warnings) — no
catalog content was touched by this fix, only `src/` and `test/`.

**F18 — the round's central methodological result.** The probe set (14 direct-hit / near-miss /
discrimination prompts against the live installed-set frontmatter) was scored two ways: a mechanical
keyword-overlap proxy, and direct SME reading of the same text. They disagreed on 4 of 14. Every
disagreement traced to the same cause — negation and preference language a bag-of-words scorer
cannot parse (`shared/code-reviewer`'s own description says "prefer that one" pointing at
`ts-code-reviewer`; `ts-add-package`'s says "Not for updating an already-installed package's
version"). SME reading resolved all 14 correctly, including confirming round 1's F5 dispatch-collision
fix genuinely works. This is round 1's core lesson (F2: lexical detectors miss what direct reading
catches) recurring at a different layer of the same system, which is itself worth recording rather
than re-discovering silently next round.

**F16 — a correction caught before it shipped.** The first draft of Lane X's portability check
modeled Copilot's `agent` kind as having no dispatch mechanism, by analogy with Claude subagents not
existing on Copilot. Reading `src/targets/copilot/spec/agent.ts` directly (not assuming from the
kind name) showed Copilot emits real per-artifact `.github/agents/*.agent.md` custom agents with
their own `description`-only dispatch — the analogy was wrong. Corrected before the finding was
reported. Net result: 30/32 installed artifacts have a real dispatch mechanism on **both**
providers; the 2 exceptions (`hook`, `settings`) are Claude-only by documented design
(`KindDescriptor.ownedBy`), not a gap.

## What the probe could not tell us

Stated up front in the approved plan and confirmed by how the round unfolded:

- **A scored proxy is not a live session.** Lane P's 14/14 SME-reading result says the trigger text
  _reads_ correctly to a careful human/model doing exactly what a router does (read description,
  pick the best match) — it is not a recording of an actual Claude Code session choosing between
  these artifacts under real conversational pressure, ambiguity, or competing context. The original
  plan's "spawn 15 subagents" approach was scaled back specifically because a spawned subagent's own
  dispatch behavior carries the identical caveat (its context isn't a faithful replica of a live
  top-level session's routing either) — so the substitution traded one imperfect proxy for a cheaper
  one with the same fundamental limitation, not for a strictly worse method.
- **Lane U's organic-history read stays confounded.** 0 skill invocations / 2 of 61 agent dispatches
  across real history is suggestive but still not attributable to trigger quality vs. session type —
  this round did not resolve that ambiguity, it built the tool (`lane-u-usage.js`) that will resolve
  it once organic TypeScript-feature sessions accumulate against this installed set.
- **The rule-load aggregate (F19)** wasn't re-measured this round — round 1's Lane C number stands
  because the 11-rule set is structurally unchanged, but "unchanged" was inferred, not re-run.

## Regression net

**None added this round**, and that is itself a decision, not an omission. The two rules Phase 4
sketched (`trigger-portability`, `description-collision`) were evaluated against this round's actual
findings and declined: Lane X's 2 single-provider results are by-design, and Lane P's mechanical
"collisions" are proxy artifacts corrected by SME reading, not real ones. Building either rule now
would encode the proxy's false positives into `sigil sync --check`'s gate — the same principle round
1 already applied when it declined 3 of its own 4 planned rules. `catalog-symmetry` (round 1) remains
the standing regression net; nothing here warranted a peer.

## Verification

- `npm run build`, `sigil validate` (98/98), `sigil sync --check` (0 errors, 9 unchanged warnings),
  `sigil status --project-dir .` (29/32 up-to-date, 2 missing/expected, 1 drifted/F14) — all captured
  to `.sigil/audit-local/2026-08-21/baseline/` before any analysis.
- Lane X, Lane U, Lane P all re-run to completion; outputs in `.sigil/audit-local/2026-08-21/analysis/`.
- No catalog content or code was changed in the initial pass (F14 was diagnosed, not blindly
  re-fixed; no trigger rewrites were warranted by the evidence) — `npm run check` was not re-run at
  that point since nothing in `src/` or `catalog/` had changed. **Superseded by the F14 follow-up
  above**, which did change `src/` and `test/` and re-ran the full gate — see that section's own
  Verification paragraph.

## Still open

- **F14 — resolved** (see the follow-up above); no longer open.
- **What externally rewrote `.claude/settings.json`** on 2026-08-21 — not attributable beyond "not
  sigil" (see the follow-up). Not pursued further: it doesn't change the fix, and the repair path
  is now self-healing for exactly this class of event regardless of what causes it.
- **Organic usage signal.** Re-run `lane-u-usage.js` after a stretch of real TypeScript feature work
  in this repo (not audit/refactor sessions) to get an unconfounded read.
- **Round-1 backlog carried forward unchanged**: python/react parity, `cs-api-architect` merge,
  angular's 3 `catalog-symmetry` gaps, `context-budget-aggregate` rule. No new evidence this round
  bears on any of them — the probe set only covered the installed TypeScript namespace.
- **Copilot-side probing** — Lane X confirms the dispatch _mechanism_ exists on Copilot; nothing this
  round tested whether Copilot's actual behavior matches Claude's for the same artifact. That is the
  natural next expansion once "does the mechanism exist" (this round) is exhausted.
