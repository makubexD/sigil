# Baseline gate: ledger

Register a batch here **before** its first run: the artifacts, the request files, the model and the
cap and expected cost per run of each stage. Add the verdict and the action after. Protocol:
[README.md](README.md).

## Batches

| Date       | Batch      | Artifacts                                                                                                                     | Stage  | Model              | Cap                     | Expected per run | Spent | Status                                                 |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ | ----------------------- | ---------------- | ----- | ------------------------------------------------------ |
| 2026-11-26 | defaults-1 | `typescript/ts-generate-tests` (the other TypeScript and Python starter and tooling members join as their request files land) | screen | `claude-haiku-5-5` | 1.00 a day, 5.00 in all | 0.02             | 0.30  | `ts-generate-tests` done (36 runs, median 0.008 a run) |
| 2026-11-26 | defaults-1 | `typescript/ts-code-reviewer`                                                                                                 | screen | `claude-haiku-5-5` | 0.70                    | 0.02             | 0.15  | done (36 runs, median 0.004 a run)                     |
| 2026-11-26 | defaults-1 | `typescript/ts-security` (rule)                                                                                               | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.24  | done (36 runs, median 0.006 a run)                     |

`defaults-1` runs on a Team subscription seat, so it is the screen only: no `confirm` or `final` stage
until a key with its own spend limit exists. A `beats` here stays unconfirmed.

## Verdicts

| Date       | Artifact                       | Stage  | Model              | Votes (win, tie, loss) | Quiet held | Verdict | Action                                                                  |
| ---------- | ------------------------------ | ------ | ------------------ | ---------------------- | ---------- | ------- | ----------------------------------------------------------------------- |
| 2026-11-26 | `typescript/ts-generate-tests` | screen | `claude-haiku-5-5` | 1, 3, 1                | yes        | `ties`  | none taken: the skill was called in 3 of 15 working runs, see below     |
| 2026-11-26 | `typescript/ts-code-reviewer`  | screen | `claude-haiku-5-5` | 0, 5, 0                | yes        | `ties`  | none taken: the agent was dispatched in 0 of 15 working runs, see below |
| 2026-11-26 | `typescript/ts-security`       | screen | `claude-haiku-5-5` | 2, 3, 0                | yes        | `ties`  | keep, uncut: one line changes behaviour every time, see below           |

### `typescript/ts-generate-tests`, screen

- The model called the skill in 3 of the 15 working runs that had it installed, all three on R1 (the
  request that says a file has nothing checking it). On R2 to R5 the `with` arm was in practice the
  `none` arm plus the `ts-testing` rule and the reviewer agent the skill brings.
- Where it was called (R1), both arms scored 0.93 and both missed the same planted bug (rounding).
- R2 is the one win: 1.00 against 0.87, without the skill being called.
- R5 is not a fair request: in 5 of its 6 runs no test was written in either arm, because the prompt
  asks for "scrutiny" and the model answered with a review. Its `loss` is one `none` run that wrote
  tests. Reword it before the set is used again.
- So this screen says the body of the skill adds nothing Haiku can be seen to use on these requests,
  and that its listing rarely makes Haiku call it. It says nothing about larger models.
- Regraded for free afterwards: the projects those runs left behind, against version 2 of the request
  file (two harder planted bugs per request, 25 in all). Means, `none` then `with`: R1 0.95 and 0.95,
  R2 0.90 and 1.00, R3 1.00 and 1.00, R4 1.00 and 1.00. Haiku with nothing installed catches nearly
  every planted bug in a small pure module, so this kind of request has no room for an artifact to
  win. The `ts-testing` rule was not screened on it for that reason.

### `typescript/ts-code-reviewer`, screen

- The agent was dispatched in none of the 15 working runs that had it installed: Haiku reviewed the
  file itself every time.
- Every run in both arms scored 1.00: Haiku with nothing installed named all 15 planted defects.
- Grading is by loose patterns on the answer, so 1.00 means the defect was named, not that the review
  was good. It cannot tell a good review from a better one.

### `typescript/ts-security`, screen

Requests that ask for an ordinary feature whose obvious implementation is unsafe, graded by hidden
behaviour tests. A rule loads by path, so there is nothing for the model to call.

- R4, an outbound `fetch`: without the rule no run set a timeout (0 of 3); with it every run did (3 of
  3). This is the one difference that held in every run.
- R3, an invite code: one of three runs without the rule compared codes with `===`; none with it did.
  Every run in both arms drew the code from `node:crypto`.
- R1 (a path from user input), R2 (running a script on a file name) and R5 (merging saved JSON): 1.00 in
  both arms. Haiku contains the path, avoids the shell and skips `__proto__` without being told.
- Two wins of five is a `ties` under the sign test. The rule still holds a fact the model does not
  apply by itself (the timeout), so it stays. It is not cut: three of its eight lines (secrets, parsing
  untrusted data, requests to user-chosen hosts) have no request here.

### What the screens say together

On a request about one self-contained file, Haiku with nothing installed is at the top of what these
checks can measure, and it seldom calls an installed skill or agent. More screens of this shape will
tie. An artifact can only win where the model lacks a fact: a repo convention, a tool-specific step, a
change that spans files. The next request sets should be built there.

The `ts-security` screen was built that way and found one such fact. A line earns its place when the
model would not have done it unasked; the screens can now name those lines one at a time.
