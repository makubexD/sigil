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
`answer-lacks` and `command` (hidden tests, a type check). A run's score is the share of its checks
that pass. Files the catalog installs (`.claude/`, `.github/`, `.sigil/`) never count as the run's
work.

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
