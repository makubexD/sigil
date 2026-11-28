# Baseline gate

Does a skill, agent or rule make the model do better than the same model without it? Every eval
before this one compared two versions of an artifact, or told the model to follow it. This one
removes it.

Nothing here runs in `npm test`. `npm run evals:check` runs `selftest.mjs`, which needs no model. The
runs themselves cost money and are started by hand, one registered batch at a time
([`results.md`](results.md)).

## Protocol

One artifact at a time, from a request file under `requests/`:

- **Five working requests** a user could plausibly type, and **one quiet request** the artifact
  must not act on. No prompt names the artifact; `checks.mjs` refuses a file that does. Write them
  without the artifact's own vocabulary: a request that quotes the skill's description tests the
  listing, not the skill.
- **Two arms**, the same model in both: `with` installs the artifact and what it depends on
  (`sigil add <id>`), `none` installs nothing. Each run starts from a fresh copy of the request's
  fixture.
- **Three runs per arm** per request.
- **One vote per request**: the arm with the higher mean score wins it; means within 0.05 tie.
- **Verdict**: an exact one-sided sign test over the decided requests at 0.05. With five requests
  only 5 wins of 5 reaches it (p = 1/32); 4 of 5 is p = 6/32 and is a tie. A win also needs the
  quiet request to hold in every run.

| Verdict        | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `beats`        | Better than no artifact, and quiet where it should be      |
| `ties`         | No difference the test can see                             |
| `worse`        | No artifact did better                                     |
| `inconclusive` | Fewer than five requests voted, or the stage hit its limit |

## Grading

Scripted checks only (`checks.mjs`): `file-exists`, `file-matches`, `file-lacks`, `answer-matches`,
`answer-lacks`, `command` (a type check, the project's own tests) and `script` (a node script kept
beside the request file, where a run never sees it: hidden tests, or `requests/checks/mutant.mjs`,
which passes when the tests a run wrote catch a planted bug). A run's score is the share of its
checks that pass. Files the catalog installs (`.claude/`, `.github/`, `.sigil/`) never count as the run's
work.

A Python project is graded by a Python script run through `requests/checks/py.mjs`, which needs
`python` on PATH. Each of those graders stops a case that hangs, so a worker that cannot be cancelled
fails its check and does not stall the stage.

A C# project is graded by a small C# program (`requests/checks/cs/`) that `requests/checks/cs.mjs`
compiles against the project in a temp folder, once per project and group of cases; it needs the
.NET 10 SDK on PATH and no NuGet package. It finds constructors and methods by name, so a run that
added a logger or a `CancellationToken` parameter still loads. A project that does not compile fails
every case.

A React project is graded by hidden behaviour tests run through `requests/checks/react.mjs`: the
project is imported as a bundler would import it, into a jsdom page with a fake API server, against
real React and TanStack Query. Those packages are not dependencies of this repo. The grader installs
the pinned set in `requests/checks/web/react.deps.json` into a temp folder on first use, without
running install scripts; `node requests/checks/react.mjs --install` does it ahead of a stage, which
needs the network once. A check takes about six seconds to start.

An Angular project is graded the same way through `requests/checks/angular.mjs`: the project is
compiled in the page by Angular's own compiler, with its own providers (`app.config.ts`), and a case
swaps a service for a fake where it needs to. The packages are in
`requests/checks/web/angular.deps.json`; `node requests/checks/angular.mjs --install` installs them.
`isDevMode()` is false, as in a shipped build.

A command-line project (`requests/cli.json`, `requests/wizard.json`) is graded through
`requests/checks/cli.mjs`, which needs no package. It starts the project's own entry point with a
stock file in a temp folder and reads the exit code, the two streams and the file. For a case about a
terminal it loads `requests/checks/cli/tty-preload.mjs` first, so the three streams report a terminal
while they stay the grader's pipes, and `converse` in `requests/checks/cli/kit.mjs` types an answer,
a key at a time, each time the program stops to ask. It tells a question by its words, so a request
that adds questions says what they are.

A check measures something the user wanted from the request, not whether the output uses the
artifact's words. Where no script can grade the output (a review report), leave the artifact out of
the batch and say so in the ledger; a model judge is a separate, registered decision.

## Stages and money

A tie on the small model is trusted: what doesn't help it is unlikely to help a larger one. A win is
not, so it moves up.

| Stage     | Model               | Runs for                                  |
| --------- | ------------------- | ----------------------------------------- |
| `screen`  | `claude-haiku-5-5`  | Every artifact in the batch               |
| `confirm` | `claude-sonnet-5-5` | Artifacts that `beats` on the screen      |
| `final`   | `claude-opus-5-5`   | At most three per batch, the starter ones |

Every stage is started with `--cap` (dollars for the stage) and `--expected` (dollars per run), both
written in `results.md` first. `run.mjs`:

- passes the model id on every run and records the model the run reports; a run another model
  answered is dropped and cannot vote (its cost still counts);
- adds up `costUsd` and stops before the run that would start past the cap;
- treats the first ten runs as a price check and stops when their median is over twice `--expected`.

A stage that stops early is `inconclusive` for every artifact it did not finish. Use an API key with
its own spend limit, not the subscription you work on.

Costs seen in October (`../*/runs/*.jsonl`): Haiku 0.007 to 0.014 dollars a run, Opus 0.23 without
rules and 0.52 with. Sonnet coding runs were never recorded.

## What a verdict does

`decide.mjs` `action()`, written to the ledger with the verdict:

| Verdict, and what else is known             | Action                         |
| ------------------------------------------- | ------------------------------ |
| `beats`                                     | keep                           |
| `ties`, holds a tool- or repo-specific fact | keep, cut to that fact         |
| `ties`, used in real projects               | opt-in, re-test                |
| `ties`, no field use                        | opt-in; delete on a second tie |
| `ties` again after rewording, no field use  | delete (owner confirms)        |
| `worse`                                     | opt-in, reword and re-test     |
| `inconclusive`                              | nothing moves                  |

A result is never carried from one language to another: a member that was not run stays untested.
A deleted member is recorded under its family's `absent` in `catalog/standard.yaml`.

## Run

```bash
npm run build
node test/evals/baseline/run.mjs --sigil . --requests test/evals/baseline/requests/<file>.json \
  --stage screen --model claude-haiku-5-5 --cap 2 --expected 0.02 \
  --out test/evals/baseline/runs/<batch>-<artifact>.jsonl
```

It prints one vote per request, whether the quiet request held, what was spent, and the verdict.
Records already in `--out` are skipped, so a stage interrupted by a usage limit resumes.

## Selftest

`node test/evals/baseline/selftest.mjs` proves the instruments before anything is paid for: a
known-good artifact comes out `beats` and a known-useless one `ties`; a near miss (4 of 5) does not
pass; a run answered by another model is dropped; the budget stops at the cap and at the price
check; every check kind passes on a project that satisfies it and fails on one that doesn't; and a
request file that names its artifact, or has too few requests, is refused.

`requests/example.json` shows the format. It is not a registered request set.
