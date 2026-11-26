# Baseline gate: ledger

Register a batch here **before** its first run: the artifacts, the request files, the model and the
cap and expected cost per run of each stage. Add the verdict and the action after. Protocol:
[README.md](README.md).

## Batches

| Date       | Batch      | Artifacts                                                                                                                     | Stage  | Model              | Cap                     | Expected per run | Spent | Status                                                 |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ | ----------------------- | ---------------- | ----- | ------------------------------------------------------ |
| 2026-11-26 | defaults-1 | `typescript/ts-generate-tests` (the other TypeScript and Python starter and tooling members join as their request files land) | screen | `claude-haiku-5-5` | 2.00 a day, 5.00 in all | 0.02             | 0.30  | `ts-generate-tests` done (36 runs, median 0.008 a run) |
| 2026-11-26 | defaults-1 | `typescript/ts-code-reviewer`                                                                                                 | screen | `claude-haiku-5-5` | 0.70                    | 0.02             | 0.15  | done (36 runs, median 0.004 a run)                     |
| 2026-11-26 | defaults-1 | `typescript/ts-security` (rule)                                                                                               | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.24  | done (36 runs, median 0.006 a run)                     |
| 2026-11-26 | defaults-1 | `typescript/ts-async` (rule)                                                                                                  | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.23  | done (36 runs, median 0.006 a run)                     |
| 2026-11-26 | defaults-1 | `typescript/ts-logging` (rule)                                                                                                | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.28  | done (36 runs, median 0.009 a run)                     |
| 2026-11-26 | defaults-1 | `typescript/ts-security` (rule), the lines the first set left out (`ts-security-2.json`)                                      | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.31  | done (36 runs)                                         |
| 2026-11-26 | defaults-1 | `typescript/ts-async` (rule), request R6 only: capped concurrency                                                             | screen | `claude-haiku-5-5` | 0.10                    | 0.02             | 0.06  | done (6 runs)                                          |

`defaults-1` runs on a Team subscription seat, so it is the screen only: no `confirm` or `final` stage
until a key with its own spend limit exists. A `beats` here stays unconfirmed.

## Verdicts

| Date       | Artifact                             | Stage  | Model              | Votes (win, tie, loss) | Quiet held | Verdict                      | Action                                                                  |
| ---------- | ------------------------------------ | ------ | ------------------ | ---------------------- | ---------- | ---------------------------- | ----------------------------------------------------------------------- |
| 2026-11-26 | `typescript/ts-generate-tests`       | screen | `claude-haiku-5-5` | 1, 3, 1                | yes        | `ties`                       | none taken: the skill was called in 3 of 15 working runs, see below     |
| 2026-11-26 | `typescript/ts-code-reviewer`        | screen | `claude-haiku-5-5` | 0, 5, 0                | yes        | `ties`                       | none taken: the agent was dispatched in 0 of 15 working runs, see below |
| 2026-11-26 | `typescript/ts-security`             | screen | `claude-haiku-5-5` | 2, 3, 0                | yes        | `ties`                       | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-async`                | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                       | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-logging`              | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                       | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-security`, second set | screen | `claude-haiku-5-5` | 1, 3, 1                | yes        | `ties`                       | none taken, see below                                                   |
| 2026-11-26 | `typescript/ts-async`, R6 alone      | screen | `claude-haiku-5-5` | 0, 1, 0                | not run    | `inconclusive` (one request) | none taken                                                              |

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

### `typescript/ts-async`, screen

Requests with a slower or more fragile obvious implementation, graded by hidden behaviour tests.

- With nothing installed Haiku ran independent lookups together, kept the original error as `cause`,
  read the file without blocking, handled the rejection of a save nobody waits for, and streamed a
  large log: 1.00 in every run of R1 to R4.
- R5's win is one `none` run of three that sent notifications one at a time.
- The lines of the rule these requests cover describe what the model already does. Not covered here:
  accepting and passing down an `AbortSignal`, `new Promise(async ...)`, and capping concurrency.

### `typescript/ts-logging`, screen

Features that log something, graded by what reached the project's logger and the console when the
code ran.

- R1, an import of many orders: without the rule every run logged at `info` once per order (302
  records for 300 orders); with it no run did. 0 of 3 against 3 of 3.
- R2 to R5: 1.00 in both arms. With nothing installed Haiku used the project's logger and not the
  console (even in a file full of `console.log`), logged the error object, kept the password and the
  authorization header out, and put counts in fields.
- Six of the 36 scores were regraded from the projects the runs left behind, after two faults in the
  checks were fixed: a run that imported `./logger.js` or `./logger` could not be loaded (the project
  has no build step), and "resolves with the receipt" was read as the string by some runs and as the
  gateway's object by others. Both readings now pass. The votes above are after the regrade; the
  runner's own tally (2 wins) was before it.

### `typescript/ts-security`, second set

The lines the first set had no request for.

- R2, a DSN that is refused: one of three runs without the rule put the DSN, password included, in
  the error message; none with it did.
- R1 (a key from the environment), R3 (a webhook body), R4 (a formula an admin saved) and R5 (a link a
  customer pasted): Haiku failed fast on the missing key, checked the parsed body's shape, did not run
  the formula as code and refused loopback, private and link-local addresses, in every `none` run.
- R5's `loss` is one `with` run whose address check refused a public address too. Not investigated.

### `typescript/ts-async`, R6 alone

Thousands of images to resize: every run in both arms capped how many ran at once and none ran them
one at a time. One request cannot give a verdict; it says the line describes what Haiku already does.

### The cut that followed

The plan's action for a tie that holds a fact is "keep, cut to that fact". The three rules were cut on
that basis, line by line. `none` is the arm with no rule installed.

| Rule          | Line                                              | Evidence                                 | Action |
| ------------- | ------------------------------------------------- | ---------------------------------------- | ------ |
| `ts-security` | no secrets in source, logs, error messages        | 1 of 3 `none` runs leaked a DSN password | kept   |
| `ts-security` | fail fast on a missing variable, no fallback      | 3 of 3 `none` runs did it                | cut    |
| `ts-security` | `execFile` or `spawn` with an argument array      | 3 of 3                                   | cut    |
| `ts-security` | resolve a user path against a root                | 3 of 3                                   | cut    |
| `ts-security` | no `eval`; schema-check `JSON.parse` output       | 3 of 3 each                              | cut    |
| `ts-security` | `js-yaml` 4+ `load`                               | no request                               | kept   |
| `ts-security` | skip `__proto__`, `constructor`, `prototype`      | 3 of 3                                   | cut    |
| `ts-security` | tokens from `crypto`                              | 6 of 6                                   | cut    |
| `ts-security` | `timingSafeEqual`, never `===`                    | 1 of 3 `none` runs used `===`            | kept   |
| `ts-security` | timeout on every outbound `fetch`                 | 0 of 3 `none`, 3 of 3 with the rule      | kept   |
| `ts-security` | never `rejectUnauthorized: false`                 | no request                               | kept   |
| `ts-security` | allowlist or address check for a user-chosen host | 3 of 3                                   | cut    |
| `ts-async`    | every promise awaited, returned or handled        | 3 of 3                                   | cut    |
| `ts-async`    | independent work under `Promise.all`              | 1 of 6 `none` runs went one at a time    | kept   |
| `ts-async`    | cap the concurrency of a large list               | 3 of 3                                   | cut    |
| `ts-async`    | share an `AbortSignal`; accept and pass one down  | no request                               | kept   |
| `ts-async`    | `Promise.allSettled` only when inspected          | no request                               | kept   |
| `ts-async`    | no `async` function in `new Promise(...)`         | no request                               | kept   |
| `ts-async`    | re-throw with `cause`                             | 3 of 3                                   | cut    |
| `ts-async`    | no synchronous I/O on an async path               | 3 of 3                                   | cut    |
| `ts-async`    | CPU-heavy work goes to a `Worker`                 | no request                               | kept   |
| `ts-async`    | `for await` over building an array                | 3 of 3                                   | cut    |
| `ts-logging`  | the project's logger, never `console.*`           | 3 of 3                                   | cut    |
| `ts-logging`  | an injected `Logger` when the project has none    | no request                               | kept   |
| `ts-logging`  | `console.log` only for output the CLI user reads  | no request                               | kept   |
| `ts-logging`  | context in structured fields                      | 3 of 3                                   | cut    |
| `ts-logging`  | log the error object                              | 3 of 3                                   | cut    |
| `ts-logging`  | no `info` or above per item in a loop             | 0 of 3 `none`, 3 of 3 with the rule      | kept   |
| `ts-logging`  | no credentials or tokens in logs                  | 3 of 3; `ts-security` still says it      | cut    |
| `ts-logging`  | no PII in logs                                    | no request                               | kept   |

What this does not show:

- Three runs of one request is a small sample. Two lines that held in two of three `none` runs failed
  in the third, so a line cut on 3 of 3 can still be one the model sometimes breaks.
- Only `claude-haiku-5-5` was run. The plan trusts a tie on the small model for larger Claude models;
  nothing was run on the models other targets use.
- The cut rules were not run again. The two lines that changed behaviour were measured inside the
  longer rules.
- Only TypeScript was screened. The Python, C#, React and Angular rules of the same families are as
  they were.

### What the screens say together

On a request about one self-contained file, Haiku with nothing installed is at the top of what these
checks can measure, and it seldom calls an installed skill or agent. More screens of this shape will
tie. An artifact can only win where the model lacks a fact: a repo convention, a tool-specific step, a
change that spans files. The next request sets should be built there.

The rule screens were built that way. Across 21 requests over three rules, two lines changed what
Haiku did in every run: a timeout on an outbound `fetch` (`ts-security`) and no `info` record per item in
a loop (`ts-logging`). Two more showed in one run of three: constant-time comparison and a password in
an error message. Everything else these requests cover, Haiku did unasked.
