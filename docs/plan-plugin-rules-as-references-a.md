# Plan: rules on demand, Phase A (the eval)

> **Roadmap:** [plan-plugin-rules-as-references](plan-plugin-rules-as-references.md), which explains why the candidate is
> per-rule files and why the bar measures tokens loaded. Read its "The catch" section first.

**Status: deferred 2026-11-04, low priority.** Don't start it from `/next`. The runs must use Claude, because the eval
measures Claude's own behaviour, and up to about 108 of them is too much for the owner's $20 plan. DeepSeek can't stand in.
Once the higher-priority work is done, the owner decides how to run it.

Everything goes in a new folder, `test/evals/rules-on-demand/`. Nothing in `src/` or `catalog/` changes. The model under
test is Claude, so every run is `[inline]`; the worker only writes harness files. Follow the shape of
`test/evals/code-quality/` (`run.mjs`, `measure.mjs`, `stats.cjs`, `selftest.mjs`, `results.md`).

## The arms

Each arm is a plugin folder built from a fresh `npm run catalog:build`, loaded with `--plugin-dir`:

- `inline`: the built plugin, untouched.
- `none`: `## Applied Rules` removed (and the `---` before it). The control: it shows a task is rule-sensitive.
- `reference`: `## Applied Rules` removed, each rule written to `references/rule-<slug>.md` (slug: the rule's title in
  kebab-case, e.g. `rule-npm-typescript.md`), and an index placed before the skill's body:

  ```markdown
  ## Rules

  Before you write or change anything, read each rule below that applies to this task. Read it from this skill's
  `references/` folder.

  - `references/rule-npm-typescript.md`: <the rule's description>
  ```

The index uses the rule's own `description`, so it shows what the rule covers. Its wording is fixed before any run.

## The bar (registered before any run; step 3 copies it into `results.md`)

`reference` is a go only if all three hold for each model:

1. **Adherence:** over tasks, the mean difference (`inline` minus `reference`, as share of checks passed) is at most 0.05,
   and an exact one-sided sign-flip test (`stats.cjs`) does not show `reference` worse at p ≤ 0.05. Strict equality isn't
   reachable with this few runs, so 0.05 is the noise margin for "at least as often".
2. **Reads what it needs:** in at least 90% of `reference` runs the model reads every rule file the task's checks depend
   on, before its first Write or Edit.
3. **Real saving:** rule text loaded per run (index plus rule files read, in bytes / 4) is at least 25% below `inline`,
   as a mean over tasks.

The bar decides on the multi-rule and single-rule tasks together. If 1 and 2 hold and 3 fails, the result is a no-go: the
change would add a turn and buy nothing.

## Step 1: Probe the delivery mechanics `[inline: live probe of Claude Code behaviour]`

Files: `test/evals/rules-on-demand/results.md` (new, the probe log).

Hand-build a one-skill plugin with `references/rule-a.md` carrying a marker string, and check on the current `claude`:

- P1: `claude -p '/<plugin>:<skill> <args>' --plugin-dir <dir> --setting-sources project` runs that skill with no firing
  step, so tasks can call the skill directly.
- P2: the model gets the skill's folder path, so a relative `references/...` path resolves.
- P3: Read of the plugin's reference, outside the working directory, works under `--permission-mode acceptEdits` with no
  denial. Repeat for a marketplace-installed copy under `~/.claude/plugins/cache/` (installed in a throwaway `HOME` or
  `CLAUDE_CONFIG_DIR`). A prompt here is a finding for real users, not only for the eval.
- P4: `--output-format stream-json --verbose` shows each Read's path, each Write or Edit, and usage tokens, in order.

Also read the official skills docs for how an invoked skill survives compaction and quote the answer in the log.

Test: the log has a dated row for P1-P4 with the CLI version. **Stop and report if P1 or P3 fails**: the design changes.

## Step 2: Arm builder `[worker:medium]`

Files: `test/evals/rules-on-demand/build-arms.mjs` (new), `test/evals/rules-on-demand/selftest.mjs` (new).

`node build-arms.mjs --plugin <dist plugin dir> --out <dir>` writes `<out>/inline`, `<out>/none` and `<out>/reference`,
exactly as "The arms" above says. It splits on the `### <title>` headings inside `## Applied Rules`, which it treats as
ending at end of file. Descriptions come from `catalog/**/rules/*.rule.md`, matched on `title`, through plain frontmatter
line reading; fail with a message naming the title when none matches. A rule body may contain `### ` headings inside a
code fence: the split ignores fenced lines.

`selftest.mjs` runs these cases on a temp plugin it writes itself, with `node:assert`:

| Case                                                 | Expected                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Skill with two rules, `reference` arm                | no `## Applied Rules`; two `references/rule-*.md`; two index lines |
| Rule body with `### x` inside a code fence           | stays in that rule's file, no third file                           |
| Each rule file's text                                | byte-equal to the rule's text in the `inline` SKILL.md             |
| Skill with no `## Applied Rules`                     | same bytes in all three arms                                       |
| Skill that already has `references/stack-x.md`       | file kept in all three arms                                        |
| `none` arm                                           | no `## Applied Rules`, no trailing `---`                           |
| Title with no matching catalog rule                  | exit 1, message names the title                                    |
| Run on real `dist/claude/plugins/typescript-tooling` | `inline` byte-equal to the source                                  |

Test: `node test/evals/rules-on-demand/selftest.mjs` (needs a built `dist/`).

## Step 3: Tasks, checks and registered hypotheses `[inline: task and check design needs judgment]`

Files: `test/evals/rules-on-demand/scenarios.md`, `key.md`, `coverage.md`, `README.md`, `results.md`, `fixture/<task>/`.

Six tasks, three in each language, on these skills (replace one only with a reason in `key.md`):

| Task | Skill               | Rules | Why                                                   |
| ---- | ------------------- | ----- | ----------------------------------------------------- |
| A1   | `ts-generate-tests` | 1     | single rule, the common shape                         |
| A2   | `py-generate-tests` | 1     | same, Python                                          |
| A3   | `ts-add-package`    | 2     | multi-rule, both should be needed                     |
| A4   | `py-add-package`    | 2     | same, Python                                          |
| A5   | `ts-audit-deps`     | 3     | largest section; selective reading is possible here   |
| A6   | `py-release`        | 2     | multi-rule; Conventions and Packaging differ in reach |

For each task: a small fixture, a prompt that invokes the skill directly and never mentions conventions, and 3 to 6
mechanical checks. A check tests something a rule states and a capable model wouldn't do unprompted (for tests: the
`should <behavior> when <condition>` naming, not "tests pass"). Each check names its rule in `key.md`, which is how bar 2
knows which files a task needs. `key.md` also records, per task, a correct and a flawed output for step 4.

`coverage.md` lists one `rule:<id>` row per check, so `npm run evals:check` fails if a rule later drops the phrase.
`results.md` copies the bar and the arms verbatim, dated, before any run.

Test: `npm run evals:check`.

## Step 4: Checks `[worker:medium]`

Files: `test/evals/rules-on-demand/checks.mjs` (new), `selftest.mjs`, `package.json` (`evals:check` also runs this
selftest).

`checks.mjs` exports `checksFor(task, dir)`, implementing exactly the checks `key.md` lists for each task as static checks
on the produced files (regex or simple parsing; no network, no install). Selftest cases: for each of the six tasks, the
correct output from `key.md` passes every check, and the flawed output fails the check `key.md` names and passes the rest.

Test: `npm run evals:check`.

## Step 5: Runner and measurement `[worker:medium]`

Files: `test/evals/rules-on-demand/run.mjs`, `test/evals/rules-on-demand/measure.mjs` (new). Import `stats.cjs` from
`../code-quality/stats.cjs`.

`node run.mjs --arm <none|inline|reference> --arms-dir <dir> --out runs/<file>.jsonl [--tasks A1,A2] [--runs 3]
[--parallel 3] [--model claude-sonnet-5-5]`. Each run copies `fixture/<task>/` to a temp dir (with the `realpathSync.native`
from code-quality's `prepare`), runs the task's prompt with `claude -p`, `--plugin-dir <arm>`, `--setting-sources project`,
`--permission-mode acceptEdits`, the task's `--allowedTools`, `--output-format stream-json --verbose`,
`--no-session-persistence`, and treats an API error as an invalid run, not recorded, as `run.mjs` does there.

One JSONL record per run: `task`, `arm`, `run`, `model`, `cli`, `sha`, `costUsd`, `turns`, `durationMs`, plus:

- `rulesRead`: reference file names Read, in order, and `rulesReadBeforeWrite`: those before the first Write or Edit.
- `rulesLoadedTokens`: bytes / 4 of what the arm made the model load: the section for `inline`, the index plus each file
  read for `reference`, 0 for `none`.
- `checks`: `{ <checkId>: true|false }`, from `checks.mjs` (step 4).

`measure.mjs compare <a.jsonl> <b.jsonl>` prints per-task adherence, the sign-flip p, bar 2's share and bar 3's saving, then
PASS or FAIL per bar. Stream parsing and comparison live in pure, exported functions.

Add to `selftest.mjs`, on a canned stream-json fixture and hand-written records:

| Case                                            | Expected                                                  |
| ----------------------------------------------- | --------------------------------------------------------- |
| Read `rule-a.md`, Write, Read `rule-b.md`       | `rulesRead` both; `rulesReadBeforeWrite` `rule-a.md` only |
| A Read of some other file                       | not in `rulesRead`                                        |
| Stream ending in an API error                   | invalid, no record                                        |
| Adherence diff 0.04 with reads 100%, saving 30% | all three bars PASS                                       |
| Adherence diff 0.06                             | bar 1 FAIL                                                |
| One of ten runs misses a needed rule (90%)      | bar 2 PASS                                                |
| Two of ten runs miss one (80%)                  | bar 2 FAIL                                                |
| Saving 24%                                      | bar 3 FAIL                                                |

Test: `node test/evals/rules-on-demand/selftest.mjs`.

## Step 6: Sensitivity run `[inline: measures Claude]`

Files: `test/evals/rules-on-demand/runs/`, `results.md`.

`none` and `inline`, alternating, 3 runs per task, on `claude-sonnet-5-5`: 36 runs. A task where `inline` doesn't beat
`none` by at least 0.2 in adherence measures nothing, so it is dropped now, before any `reference` run, and the reason is
logged. If fewer than four tasks remain, or none of them has two or more rules, stop and report: strengthen the checks or
call the eval unable to decide.

Test: a dated row in `results.md` with the per-task table and the total cost.

## Step 7: Comparison `[inline: measures Claude]`

Files: `test/evals/rules-on-demand/runs/`, `results.md`.

`inline` (fresh, the same day) and `reference`, alternating, 3 runs per kept task, on `claude-sonnet-5-5` and then
`claude-opus-5-5`: up to 72 runs. Sonnet comes first: if it fails the bar on adherence or reads, skip Opus, since the bar
needs both. Then `measure.mjs compare`.

Allowed once: if bar 2 fails only on a weak index, one retry with a stricter index wording, logged as a separate
comparison. No other wording changes after the first run.

Test: a dated row in `results.md` per model with PASS or FAIL per bar.

## Step 8: Decision `[inline: owner decision]`

Files: `docs/decisions/distribution-channels-2026-09.md` (1c), `docs/ideas/plugin-rules-as-references.md`,
`docs/plan-plugin-rules-as-references.md`, `test/evals/README.md` (a row for the new folder).

Write the go or no-go into ADR 1c with the numbers, the compaction answer from step 1, and any permission finding from P3.
Update the roadmap: a go adds the Phase B plan, a no-go moves straight to Phase C. The bar decides; ask the owner only if
the result is mixed across the two models.

Test: `npx prettier --check docs/decisions/distribution-channels-2026-09.md docs/plan-plugin-rules-as-references.md`.
