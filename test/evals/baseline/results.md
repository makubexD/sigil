# Baseline gate: ledger

Register a batch here **before** its first run: the artifacts, the request files, the model and the
cap and expected cost per run of each stage. Add the verdict and the action after. Protocol:
[README.md](README.md).

## Batches

| Date       | Batch         | Artifacts                                                                                                                               | Stage  | Model              | Cap                     | Expected per run | Spent | Status                                                                                                                                  |
| ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ | ----------------------- | ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-26 | defaults-1    | `typescript/ts-generate-tests` (the other TypeScript and Python starter and tooling members join as their request files land)           | screen | `claude-haiku-5-5` | 2.00 a day, 5.00 in all | 0.02             | 0.30  | `ts-generate-tests` done (36 runs, median 0.008 a run)                                                                                  |
| 2026-11-26 | defaults-1    | `typescript/ts-code-reviewer`                                                                                                           | screen | `claude-haiku-5-5` | 0.70                    | 0.02             | 0.15  | done (36 runs, median 0.004 a run)                                                                                                      |
| 2026-11-26 | defaults-1    | `typescript/ts-security` (rule)                                                                                                         | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.24  | done (36 runs, median 0.006 a run)                                                                                                      |
| 2026-11-26 | defaults-1    | `typescript/ts-async` (rule)                                                                                                            | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.23  | done (36 runs, median 0.006 a run)                                                                                                      |
| 2026-11-26 | defaults-1    | `typescript/ts-logging` (rule)                                                                                                          | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.28  | done (36 runs, median 0.009 a run)                                                                                                      |
| 2026-11-26 | defaults-1    | `typescript/ts-security` (rule), the lines the first set left out (`ts-security-2.json`)                                                | screen | `claude-haiku-5-5` | 0.50                    | 0.02             | 0.31  | done (36 runs)                                                                                                                          |
| 2026-11-26 | defaults-1    | `typescript/ts-async` (rule), request R6 only: capped concurrency                                                                       | screen | `claude-haiku-5-5` | 0.10                    | 0.02             | 0.06  | done (6 runs)                                                                                                                           |
| 2026-11-26 | cut-1         | `ts-security` R3 and R4, second set R2, `ts-async` R5, `ts-logging` R1 (twice): the `with` arm only, against the cut rules              | screen | `claude-haiku-5-5` | 0.25                    | 0.01             | 0.15  | 18 runs; `none` runs seeded from `defaults-1`                                                                                           |
| 2026-11-26 | python-1      | `python/py-security` (rule), `py-security.json`. The daily cap is raised to 3.00 for this batch, at the user's word; 5.00 in all stands | screen | `claude-haiku-5-5` | 0.42                    | 0.02             | 0.26  | done (42 runs). The login ran out after 19 runs; rejected runs cost nothing and were run again                                          |
| 2026-11-26 | python-1      | `python/py-async` (rule), `py-async.json`                                                                                               | screen | `claude-haiku-5-5` | 0.34                    | 0.02             | 0.25  | done (36 runs)                                                                                                                          |
| 2026-11-26 | python-1      | `python/py-logging` (rule), `py-logging.json`                                                                                           | screen | `claude-haiku-5-5` | 0.34                    | 0.02             | 0.25  | done (36 runs)                                                                                                                          |
| 2026-11-26 | cut-3         | `py-security` R5 and R6, `py-async` R2, `py-logging` R1: the `with` arm only, against the cut Python rules                              | screen | `claude-haiku-5-5` | 0.25                    | 0.02             | 0.08  | 12 runs; `none` runs seeded from `python-1`                                                                                             |
| 2026-11-27 | ts-untested-1 | `typescript/ts-async` (rule), `ts-async-2.json`: the lines the cut kept untested. Daily cap back to 2.00; 5.00 in all stands            | screen | `claude-haiku-5-5` | 0.34                    | 0.02             | 0.27  | done (36 runs)                                                                                                                          |
| 2026-11-27 | ts-untested-1 | `typescript/ts-logging` (rule), R6 to R8 of `ts-logging.json`, run with `--only`: three requests, no verdict                            | screen | `claude-haiku-5-5` | 0.20                    | 0.02             | 0.14  | done (18 runs). The first try stopped unpaid: a request file needs five requests and a quiet one, so these moved into `ts-logging.json` |
| 2026-11-27 | ts-untested-1 | `typescript/ts-security` (rule), R6 of `ts-security-2.json`, run with `--only`: one request, no verdict                                 | screen | `claude-haiku-5-5` | 0.08                    | 0.02             | 0.05  | done (6 runs), moved for the same reason                                                                                                |
| 2026-11-27 | csharp-1      | `csharp/cs-security` (rule), `cs-security.json`                                                                                         | screen | `claude-haiku-5-5` | 0.36                    | 0.02             | 0.23  | done (36 runs)                                                                                                                          |
| 2026-11-27 | csharp-1      | `csharp/cs-async` (rule), `cs-async.json`                                                                                               | screen | `claude-haiku-5-5` | 0.36                    | 0.02             | 0.22  | done (36 runs)                                                                                                                          |
| 2026-11-27 | csharp-1      | `csharp/cs-logging` (rule), `cs-logging.json`                                                                                           | screen | `claude-haiku-5-5` | 0.36                    | 0.02             | 0.22  | done (36 runs)                                                                                                                          |

`defaults-1` runs on a Team subscription seat, so it is the screen only: no `confirm` or `final` stage
until a key with its own spend limit exists. A `beats` here stays unconfirmed.

## Verdicts

| Date       | Artifact                                       | Stage  | Model              | Votes (win, tie, loss) | Quiet held | Verdict                         | Action                                                                  |
| ---------- | ---------------------------------------------- | ------ | ------------------ | ---------------------- | ---------- | ------------------------------- | ----------------------------------------------------------------------- |
| 2026-11-26 | `typescript/ts-generate-tests`                 | screen | `claude-haiku-5-5` | 1, 3, 1                | yes        | `ties`                          | none taken: the skill was called in 3 of 15 working runs, see below     |
| 2026-11-26 | `typescript/ts-code-reviewer`                  | screen | `claude-haiku-5-5` | 0, 5, 0                | yes        | `ties`                          | none taken: the agent was dispatched in 0 of 15 working runs, see below |
| 2026-11-26 | `typescript/ts-security`                       | screen | `claude-haiku-5-5` | 2, 3, 0                | yes        | `ties`                          | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-async`                          | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-logging`                        | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The cut that followed"                        |
| 2026-11-26 | `typescript/ts-security`, second set           | screen | `claude-haiku-5-5` | 1, 3, 1                | yes        | `ties`                          | none taken, see below                                                   |
| 2026-11-26 | `typescript/ts-async`, R6 alone                | screen | `claude-haiku-5-5` | 0, 1, 0                | not run    | `inconclusive` (one request)    | none taken                                                              |
| 2026-11-26 | `python/py-security`                           | screen | `claude-haiku-5-5` | 2, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The Python cut"                               |
| 2026-11-26 | `python/py-async`                              | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The Python cut"                               |
| 2026-11-26 | `python/py-logging`                            | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The Python cut"                               |
| 2026-11-27 | `typescript/ts-async`, second set              | screen | `claude-haiku-5-5` | 1, 4, 0                | yes        | `ties`                          | cut to the lines kept in "The second TypeScript cut"                    |
| 2026-11-27 | `typescript/ts-logging`, R6 to R8              | screen | `claude-haiku-5-5` | 1, 2, 0                | not run    | `inconclusive` (three requests) | cut to the lines kept in "The second TypeScript cut"                    |
| 2026-11-27 | `typescript/ts-security`, R6 of the second set | screen | `claude-haiku-5-5` | 0, 1, 0                | not run    | `inconclusive` (one request)    | cut to the lines kept in "The second TypeScript cut"                    |
| 2026-11-27 | `csharp/cs-security`                           | screen | `claude-haiku-5-5` | 0, 5, 0                | yes        | `ties`                          | cut to the lines kept in "The C# cut"                                   |
| 2026-11-27 | `csharp/cs-async`                              | screen | `claude-haiku-5-5` | 2, 3, 0                | yes        | `ties`                          | cut to the lines kept in "The C# cut"                                   |
| 2026-11-27 | `csharp/cs-logging`                            | screen | `claude-haiku-5-5` | 2, 3, 0                | yes        | `ties`                          | cut to the lines kept in "The C# cut"                                   |

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

### `python/py-security`, `python/py-async` and `python/py-logging`, screen

Built the way the TypeScript rule screens were, with Python graders (`checks/py-*.py`).

`py-security`:

- R5, an outbound request: one of three runs without the rule set no timeout; every run with it did.
- R6, a DSN that is refused or malformed: two of three runs without the rule put the password in the
  error message; none with it did.
- R1 (a path from user input), R2 (running a tool on a file name), R3 (a query by name) and R4 (an
  invite code): 1.00 in every run of both arms. With nothing installed Haiku contained the path, used
  no shell, bound the SQL parameter, drew the code from `secrets` and compared it in constant time.

`py-async`:

- R1 (lookups together), R3 (a save nobody waits for), R4 (a worker that can be cancelled) and R5 (a
  bounded fan-out): 1.00 in every run of both arms.
- R2, a slow synchronous lookup called from a coroutine, is the win on paper (means 0.50 and 0.67) and
  says little. One run in each arm wrote `def enrich`, not the `async def` the prompt gave, and scored 0. Of the other two runs without the rule, one blocked the event loop; neither of the other two with
  it did.

`py-logging`:

- R1, an import of many orders: one of three runs without the rule logged at `INFO` once per order;
  none with it did.
- R2 to R5: 1.00 in every run of both arms. With nothing installed Haiku used `logging` and not
  `print` (in a module that prints), logged the traceback, kept the password and the authorization
  header out, passed counts as arguments and not in an f-string, and left logging setup alone.

Read with the TypeScript screens: the lines that show at all are the same ones in both languages (a
request timeout, a secret in an error message, an `INFO` record per item), and they show less often in
Python (one or two runs of three, where two of the TypeScript ones were three of three). No line is cut
on this: no Python rule has been changed.

### The TypeScript lines the cut kept untested

Batch `ts-untested-1`: requests for the lines "The cut that followed" kept only because no request
tested them.

| Rule          | Line                                                 | `none` | With the rule |
| ------------- | ---------------------------------------------------- | ------ | ------------- |
| `ts-async`    | share an `AbortSignal` so a failure cancels the rest | 0 of 3 | 3 of 3        |
| `ts-async`    | accept an `AbortSignal`, pass it down, stop the loop | 3 of 3 | 3 of 3        |
| `ts-async`    | `Promise.allSettled` only when inspected             | 3 of 3 | 3 of 3        |
| `ts-async`    | no `async` function in `new Promise(...)`            | 3 of 3 | 3 of 3        |
| `ts-async`    | CPU-heavy work goes to a `Worker`                    | 3 of 3 | 3 of 3        |
| `ts-logging`  | an injected `Logger` when the project has none       | 0 of 3 | 3 of 3        |
| `ts-logging`  | `console.log` for output the CLI user reads          | 3 of 3 | 3 of 3        |
| `ts-logging`  | no PII in logs                                       | 3 of 3 | 3 of 3        |
| `ts-security` | never `rejectUnauthorized: false`                    | 3 of 3 | 3 of 3        |

- Two more lines change what Haiku does in every run: sharing a signal across calls that run
  together, and taking a logger as a parameter in a project that has none (without the rule every
  run wrote to the console).
- The other seven Haiku follows with nothing installed. They are candidates for the next cut. The
  first of them was run with the signal already in the signature the prompt gave, so it shows that a
  signal that is given is used, not that one is asked for.
- The `Worker` request: one run with the rule scored 0.50 and was regraded to 1.00. It used a worker,
  and the check passed twice when run again on the project the run left behind; the limit of 150 ms
  for a stalled event loop was tripped by the worker starting on a busy machine. The limit is now
  400 ms (a blocked loop stalls for about a second). The runner's own tally, before the regrade,
  counted it a loss.
- Still no request: the `js-yaml` line.

### `csharp/cs-security`, `csharp/cs-async` and `csharp/cs-logging`, screen

Batch `csharp-1`. Graded by a C# program compiled against each run's project (`checks/cs.mjs`).

| Rule         | Line                                         | `none` | With the rule |
| ------------ | -------------------------------------------- | ------ | ------------- |
| `cs-async`   | `ConfigureAwait(false)` in library code      | 0 of 3 | 3 of 3        |
| `cs-async`   | accept a `CancellationToken` and forward it  | 0 of 3 | 3 of 3        |
| `cs-logging` | no `Information` or above per item in a loop | 1 of 3 | 3 of 3        |
| `cs-logging` | an injected `ILogger<T>`, never `Console`    | 1 of 3 | 3 of 3        |

- `cs-security`: 1.00 in every run of both arms. With nothing installed Haiku contained the path
  (a sibling folder with the same prefix included), started the process without a shell, passed the
  name as a SQL parameter, drew the invite code from `RandomNumberGenerator`, compared it with
  `FixedTimeEquals` and kept the password out of every exception message.
- `cs-async`, the rest: lookups ran together, a failed background save was observed, the writer was
  disposed when a write failed and the `TaskCompletionSource` ran its continuations asynchronously,
  in every run of both arms.
- `cs-logging`, the rest: the exception was passed to the logger, the password and the authorization
  header stayed out, and counts were named placeholders, in every run of both arms.
- The two `cs-async` lines are .NET library conventions, not general practice, and they are the
  clearest result of the whole gate: never without the rule, always with it.

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
- Only TypeScript was screened. The Python, C#, React and Angular rules of the same families are as
  they were.

### The Python cut

The same action as for TypeScript, line by line. `none` is the arm with no rule installed.

| Rule          | Line                                                  | Evidence                                          | Action |
| ------------- | ----------------------------------------------------- | ------------------------------------------------- | ------ |
| `py-security` | no secrets in source, logs, exceptions                | 2 of 3 `none` runs put a password in an error     | kept   |
| `py-security` | read secrets from the environment, fail fast          | no request                                        | kept   |
| `py-security` | `subprocess.run([...])`, never `shell=True`           | 3 of 3 `none` runs did it                         | cut    |
| `py-security` | parameterized SQL                                     | 3 of 3                                            | cut    |
| `py-security` | no `pickle`, `yaml.safe_load`, no `eval`              | no request                                        | kept   |
| `py-security` | resolve a user path against a root                    | 3 of 3                                            | cut    |
| `py-security` | `secrets` for tokens, `hmac.compare_digest`           | 3 of 3 each                                       | cut    |
| `py-security` | a timeout on every outbound HTTP call                 | 1 of 3 `none` runs set none                       | kept   |
| `py-security` | never `verify=False`                                  | no request                                        | kept   |
| `py-async`    | no blocking call in a coroutine                       | 1 of 2 `none` runs that wrote a coroutine blocked | kept   |
| `py-async`    | concurrent work in a `TaskGroup`; `return_exceptions` | ran together 3 of 3; which construct, no request  | kept   |
| `py-async`    | cap a large fan-out with a `Semaphore`                | 3 of 3                                            | cut    |
| `py-async`    | keep a reference to a created task                    | a reference cannot be seen from outside           | kept   |
| `py-async`    | let `CancelledError` propagate                        | 3 of 3                                            | cut    |
| `py-async`    | a deadline on every I/O await                         | no request                                        | kept   |
| `py-async`    | `async with` / `async for`                            | no request                                        | kept   |
| `py-async`    | `asyncio.Lock` between coroutines                     | no request                                        | kept   |
| `py-logging`  | `logging.getLogger(__name__)`, never `print`          | 3 of 3                                            | cut    |
| `py-logging`  | `print` only for output the CLI user reads            | no request                                        | kept   |
| `py-logging`  | context in `extra=`, lazy arguments                   | 3 of 3                                            | cut    |
| `py-logging`  | `logger.exception` at a boundary                      | 3 of 3                                            | cut    |
| `py-logging`  | no `INFO` or above per item in a loop                 | 1 of 3 `none` runs did it                         | kept   |
| `py-logging`  | no credentials or tokens in logs                      | 3 of 3; `py-security` still says it               | cut    |
| `py-logging`  | no PII in logs                                        | no request                                        | kept   |
| `py-logging`  | configure logging once, at the entry point            | 3 of 3                                            | cut    |

The limits are the ones listed under the TypeScript cut, and one more: the Python lines that are kept
showed in one or two runs of three, so the evidence for keeping them is thinner than for the two
TypeScript lines that showed in every run.

### The C# cut

The same action again, line by line. `none` is the arm with no rule installed.

| Rule          | Line                                                           | Evidence                                                          | Action |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| `cs-security` | no secrets in source, config, logs, exception messages         | 3 of 3 `none` runs kept a password out of an exception; see below | kept   |
| `cs-security` | read secrets from `IConfiguration`, throw when missing         | no request                                                        | kept   |
| `cs-security` | `ProcessStartInfo.ArgumentList`, no shell                      | 3 of 3 `none` runs did it                                         | cut    |
| `cs-security` | parameterized SQL                                              | 3 of 3                                                            | cut    |
| `cs-security` | a user path checked against a root                             | 3 of 3                                                            | cut    |
| `cs-security` | no `BinaryFormatter`; a locked-down `XmlReader`                | no request                                                        | kept   |
| `cs-security` | `RandomNumberGenerator`, `FixedTimeEquals`                     | 3 of 3 each                                                       | cut    |
| `cs-security` | `HttpClient` timeout, factory, certificate callback, allowlist | no request                                                        | kept   |
| `cs-async`    | never block on a task                                          | no request                                                        | kept   |
| `cs-async`    | `async void` only for an event handler                         | no request                                                        | kept   |
| `cs-async`    | `ConfigureAwait(false)` in library code                        | 0 of 3 `none`, 3 of 3 with the rule                               | kept   |
| `cs-async`    | accept a `CancellationToken` and forward it                    | 0 of 3 `none`, 3 of 3 with the rule                               | kept   |
| `cs-async`    | independent work under `Task.WhenAll`                          | 3 of 3                                                            | cut    |
| `cs-async`    | `ValueTask<T>` only on a measured hot path                     | no request                                                        | kept   |
| `cs-async`    | `IAsyncDisposable` with `await using`                          | 3 of 3                                                            | cut    |
| `cs-async`    | no unobserved fire-and-forget                                  | 3 of 3                                                            | cut    |
| `cs-async`    | `TaskCompletionSource` with `RunContinuationsAsynchronously`   | 3 of 3                                                            | cut    |
| `cs-logging`  | an injected `ILogger<T>`, never `Console`                      | 1 of 3 `none`, 3 of 3 with the rule                               | kept   |
| `cs-logging`  | `Console` only for output the CLI user reads                   | no request                                                        | kept   |
| `cs-logging`  | a message template with named placeholders                     | 3 of 3                                                            | cut    |
| `cs-logging`  | pass the exception to the logger                               | 3 of 3                                                            | cut    |
| `cs-logging`  | no `Information` or above per item in a loop                   | 1 of 3 `none`, 3 of 3 with the rule                               | kept   |
| `cs-logging`  | `IsEnabled` guard, `[LoggerMessage]` on a hot path             | no request                                                        | kept   |
| `cs-logging`  | no credentials or tokens in logs                               | 3 of 3; `cs-security` still says it                               | cut    |
| `cs-logging`  | no PII; never log a whole request or response                  | no request                                                        | kept   |

- The secrets line is the one exception to "3 of 3 is cut". Only its exception-message part was tested,
  and the same request leaked a password in 1 of 3 `none` runs in TypeScript and 2 of 3 in Python, on
  the same model. Three clean C# runs are not enough to drop the one line a `required` security rule is
  for, and `cs-logging` now relies on it for credentials.
- The limits are the ones listed under the TypeScript cut. The cut rules have not been run again yet.

### The second TypeScript cut

The lines the first cut kept only because no request tested them, after batch `ts-untested-1` tested
them. `none` is the arm with no rule installed.

| Rule          | Line                                                   | Evidence                                  | Action |
| ------------- | ------------------------------------------------------ | ----------------------------------------- | ------ |
| `ts-async`    | share an `AbortSignal` so a failure cancels the rest   | 0 of 3 `none`, 3 of 3 with the rule       | kept   |
| `ts-async`    | accept an `AbortSignal`                                | the prompt gave the signal, so not tested | kept   |
| `ts-async`    | pass the signal down, `throwIfAborted()` in long loops | 3 of 3 `none` runs did it                 | cut    |
| `ts-async`    | deadlines use `AbortSignal.timeout(ms)`                | no request                                | kept   |
| `ts-async`    | `Promise.allSettled` only when inspected               | 3 of 3                                    | cut    |
| `ts-async`    | no `async` function in `new Promise(...)`              | 3 of 3                                    | cut    |
| `ts-async`    | CPU-heavy work goes to a `Worker`                      | 3 of 3                                    | cut    |
| `ts-logging`  | an injected `Logger` when the project has none         | 0 of 3 `none`, 3 of 3 with the rule       | kept   |
| `ts-logging`  | `console.log` only for output the CLI user reads       | 3 of 3                                    | cut    |
| `ts-logging`  | no PII in logs                                         | 3 of 3                                    | cut    |
| `ts-security` | never `rejectUnauthorized: false`                      | 3 of 3                                    | cut    |
| `ts-security` | `js-yaml` 4+ `load`                                    | no request                                | kept   |

- One cut needs watching. "`console.log` only for output the CLI user reads" sat next to the
  injected-logger line and may have balanced it, as a sentence did in the first cut. The recheck should
  run the CLI-output request (`ts-logging` R7) with the cut rule, not only the kept lines.
- The limits are the ones listed under the first cut. The cut rules have not been run again yet.

### The cut Python rules, run again

Batch `cut-3`: the four requests behind the kept Python lines, three runs each with the cut rule
installed. The `none` runs are the ones from `python-1`, marked `seededFrom`.

| Request                                | Kept line                       | With the cut rule                    |
| -------------------------------------- | ------------------------------- | ------------------------------------ |
| `py-security` R5, an outbound request  | a timeout on every HTTP call    | 3 of 3                               |
| `py-security` R6, a refused DSN        | no secret in an exception       | 2 of 3                               |
| `py-async` R2, a slow synchronous call | no blocking call in a coroutine | 1 of 1 coroutine; 2 runs wrote `def` |
| `py-logging` R1, an import of orders   | no `INFO` per item in a loop    | 3 of 3                               |

- R6: the run that failed wrote a function to hide the password and used it in every message. It
  missed one malformed DSN (`postgres:/user:password@`, one slash), where the credentials sit in the
  path. The line was followed and the code had a hole; the same line, uncut, scored 3 of 3 in
  `python-1`.
- R2: two of three runs wrote `def enrich`, not the `async def` the prompt gave, as one run in each
  arm of `python-1` did. That is four of twelve runs on this request, in both arms and with both
  forms of the rule, so it is the request and not the rule. The request should name the caller (an
  `await` in a handler) before it is used again.
- Nothing here suggests the cut changed what a kept line does. It is twelve runs.

### The cut rules, run again

Batch `cut-1`: the five requests behind the kept lines, three runs each with the cut rule installed,
on `claude-haiku-5-5`. The `none` runs are the ones from `defaults-1`, copied in and marked
`seededFrom`, so only the `with` arm was paid for: 0.15 dollars for 18 runs.

| Request                                    | Kept line                    | With the cut rule |
| ------------------------------------------ | ---------------------------- | ----------------- |
| `ts-security` R3, an invite code           | `timingSafeEqual`            | 3 of 3            |
| `ts-security` R4, an outbound `fetch`      | request timeout              | 3 of 3            |
| `ts-security` second set R2, a refused DSN | no secret in an error        | 3 of 3            |
| `ts-async` R5, notifications               | independent work together    | 3 of 3            |
| `ts-logging` R1, an import of many orders  | no `info` per item in a loop | 3 of 3            |

- The first `ts-logging` runs (`cut-1-ts-logging.jsonl`) had one run of three at 0.33. It kept the loop
  quiet, but it changed `importOrders` to take a logger as a third argument, so the existing callers
  broke. The cause was the sentence "domain code never imports a logger singleton", which the longer
  rule had balanced with "diagnostics go through the project's structured logger". That sentence is
  now removed, and the three runs after it (`cut-2-ts-logging.jsonl`) scored 1.00.
- This checks the kept lines only. The lines that were cut were not run again.

### What the screens say together

On a request about one self-contained file, Haiku with nothing installed is at the top of what these
checks can measure, and it seldom calls an installed skill or agent. More screens of this shape will
tie. An artifact can only win where the model lacks a fact: a repo convention, a tool-specific step, a
change that spans files. The next request sets should be built there.

The rule screens were built that way. Across 21 requests over three rules, two lines changed what
Haiku did in every run: a timeout on an outbound `fetch` (`ts-security`) and no `info` record per item in
a loop (`ts-logging`). Two more showed in one run of three: constant-time comparison and a password in
an error message. Everything else these requests cover, Haiku did unasked.

After the Python, C# and second TypeScript batches (nine rules, 61 requests, all on Haiku), six lines
changed what Haiku did in every run: a timeout on an outbound `fetch`, no `info` record per item in a
loop, a shared `AbortSignal` and an injected logger (TypeScript); `ConfigureAwait(false)` and a
`CancellationToken` (C#). What they share is that each is a convention or a non-default choice, not
something a careful programmer does anyway. The general safety practices (no shell, bound parameters,
path containment, safe randomness) Haiku followed in all three languages with nothing installed.
