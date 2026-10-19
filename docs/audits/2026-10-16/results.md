# Benchmark v2: results register

One row per roadmap item (README § 13). Status is updated as each PR merges.

| #   | Item                                                                                                               | Gate | Status                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------- |
| 1   | Audit docs, D2 task-level note, PR9 row fix                                                                        | docs | merged #74                                              |
| 2   | Doctrine-test `except` + IMPLIES; security class (F5, F6)                                                          | T    | merged #75                                              |
| 3   | Wrong-API class (F7, F12, F13, F14)                                                                                | T    | merged #76                                              |
| 4   | Concurrency class (F1, F8, F10, F11-ts, F15, profilers' "Critical" grading)                                        | T    | merged #77                                              |
| 5   | Toolchain and test-truth class (F3, F17, F21)                                                                      | T    | merged #78                                              |
| 6   | Family drift (F2, F9) and safety pins                                                                              | T    | merged #79                                              |
| 7   | A4 provider limit on `limits`, A3 rule-load ratchet, H0                                                            | T    | merged #80 (A4, A3); H0 to owner                        |
| 8   | Eval v2 infrastructure (sign-flip, fresh baseline, E3, new metrics; judge selftest dropped: it needs a model call) | T    | merged #81                                              |
| 9   | Trap calibration (C1–C12, H10)                                                                                     | E    | merged #82; **H10 false**: 0 of 12 kept, stop (this PR) |
| 10  | Interleaved batch: `none` / master / deletion (F4, F18–F20)                                                        | E    | not run: H10 stopped it                                 |
| 11  | E8 skill-firing probe                                                                                              | E    | open                                                    |

Waiting on the owner: H1, H2, a Copilot hook target, a reviewer Bash guard, C1–C5, S1, F16, H0, and A1.

**Trap calibration** (`test/evals/code-quality/results.md`, H10): without rules, `claude-opus-5-5` avoided all 12 traps
in all 36 runs. As registered, no trap batch runs and no correctness prose is added until a new trap set catches the
unguided model. That leaves C1–C5 (coverage gaps, deferred "until the trap batch says rules change correctness") and
R1 without the evidence they waited for: on this model the answer is no. **A1** (delete F4, F18–F20) was to be
tested for non-inferiority on kept traps; with none kept, it has no trap evidence either way. The owner decides
whether to delete on D2's precedent (removal held correctness) or keep the lines.

**H0** (`shared/protect-config` fails open on input it cannot parse) is deliberate and tested
(`test/catalog/protect-config-hook.test.ts`, "fails open on input it cannot read"). Failing closed or asking would
prompt on, or block, every Edit and Write if Claude Code changed its hook input format, and `claude -p` cannot
answer a prompt. Keeping or reversing that trade-off is a product decision.

Rejected or already present (README § 8): A2, H3, H4, T1, R2, R3, R4, R5, E6, E7, O1 (partial, see row 6), O2, O3,
O4, O5, O6.
