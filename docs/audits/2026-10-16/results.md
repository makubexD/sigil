# Benchmark v2: results register

One row per roadmap item (README § 13). Status is updated as each PR merges.

| #   | Item                                                                                                               | Gate | Status                                                |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------- |
| 1   | Audit docs, D2 task-level note, PR9 row fix                                                                        | docs | merged #74                                            |
| 2   | Doctrine-test `except` + IMPLIES; security class (F5, F6)                                                          | T    | merged #75                                            |
| 3   | Wrong-API class (F7, F12, F13, F14)                                                                                | T    | merged #76                                            |
| 4   | Concurrency class (F1, F8, F10, F11-ts, F15, profilers' "Critical" grading)                                        | T    | merged #77                                            |
| 5   | Toolchain and test-truth class (F3, F17, F21)                                                                      | T    | merged #78                                            |
| 6   | Family drift (F2, F9) and safety pins                                                                              | T    | merged #79                                            |
| 7   | A4 provider limit on `limits`, A3 rule-load ratchet, H0                                                            | T    | merged #80 (A4, A3); H0 to owner                      |
| 8   | Eval v2 infrastructure (sign-flip, fresh baseline, E3, new metrics; judge selftest dropped: it needs a model call) | T    | merged #81                                            |
| 9   | Trap calibration (C1–C12, H10)                                                                                     | E    | merged #82, #83; **H10 false**: 0 of 12 kept, stop    |
| 10  | Interleaved batch: `none` / master / deletion (F4, F18–F20)                                                        | E    | not run: H10 stopped it                               |
| 11  | E8 skill-firing probe: `test/evals/skill-firing/`, H13 registered                                                  | E    | merged #84; **H13 holds**: 54 of 54 correct (this PR) |
| 12  | F16 coverage floor: discover everywhere (RETIRED fixed minimum)                                                    | T    | merged #86                                            |
| 13  | `sigil status` reports content drift against the catalog, not only template revisions                              | T    | merged #87                                            |
| 14  | A1: delete F4, F18–F20; gate H14: 15 runs (T1, T2, T4–T6) vs master, tests ≥ master − 1, declarations not up       | E    | **H14 holds** (this PR)                               |
| 15  | Reviewer Bash guard: spike (does a hook see the agent?), then a PreToolUse hook                                    | T U  | merged #105                                           |
| 16  | H1 bar-lowering guard, H2 Stop typecheck                                                                           | T U  | no-go: 0 suppressions, 0 type errors under pressure   |
| 17  | Copilot hook target (format verified first; live check by the owner)                                               | T U  | merged #102, live check open                          |
| 18  | C1–C5: probe the unguided model first; write only what it gets wrong                                               | E U  | no gap: 60 of 60 points hit (Haiku, no rules)         |

**Row 13 backlog** (found in review, kept, not in that PR; **done** on `fix/status-backlog`, PR #92): an artifact whose render fails shows as
`up-to-date` in `status` (update writes nothing for it either, so they agree, but the breakage is hidden); a
config record at a retired file with no catalog op at the new destination stays `outdated (config moved …)`,
since `update` cannot move it; and `status` does not show new `uses:` dependencies that `update` would install.

**Owner decisions, 2026-10-19:**

- **A1**: delete, gated by an eval on the T tasks (row 14).
- **F16**: discover the floor everywhere (row 12).
- **S1**: declined; `feature` stays as is.
- **H0**: keep failing open (below).
- **Start**: the reviewer Bash guard, H1/H2, a Copilot hook target and C1–C5 (rows 15–18).
- **Found during housekeeping**: `sigil status` said 35 of 36 artifacts were up to date while `sigil update`
  refreshed 15 (row 13).

**Trap calibration** (`test/evals/code-quality/results.md`, H10): without rules, `claude-opus-5-5` avoided all 12 traps
in all 36 runs. As registered, no trap batch runs and no correctness prose is added until a new trap set catches the
unguided model. That leaves C1–C5 (coverage gaps, deferred "until the trap batch says rules change correctness") and
R1 without the evidence they waited for: on this model the answer is no. **A1** (delete F4, F18–F20) was to be
tested for non-inferiority on kept traps; with none kept, it has no trap evidence either way. The owner decides
whether to delete on D2's precedent (removal held correctness) or keep the lines.

**H0** (`shared/protect-config` fails open on input it cannot parse) is deliberate and tested
(`test/catalog/protect-config-hook.test.ts`, "fails open on input it cannot read"). Failing closed or asking would
prompt on, or block, every Edit and Write if Claude Code changed its hook input format, and `claude -p` cannot
answer a prompt. The owner kept it (2026-10-19).

Rejected or already present (README § 8): A2, H3, H4, T1, R2, R3, R4, R5, E6, E7, O1 (partial, see row 6), O2, O3,
O4, O5, O6.
