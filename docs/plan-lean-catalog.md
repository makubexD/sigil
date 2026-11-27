# Plan: a lean catalog for any workflow

Drafted 2026-11-25; where it stands is under Progress. It follows the real-usage audit ([`docs/audits/2026-11-25/`](audits/2026-11-25/README.md))
and a second look at six public catalogs (ECC, agent-skills, ponytail, dotnet/skills, superpowers, CLI-Anything). The aim:
an install costs as little context as possible before the user types anything, for any workflow, and every artifact that
stays has earned its place.

## Summary

| Step | What                                                   | Saves context | Removes anything | Issue |
| ---- | ------------------------------------------------------ | ------------- | ---------------- | ----- |
| 1    | Slim the TypeScript rules like Python                  | Yes, most     | Prose only       | #215  |
| 2    | Slim the C#, React and Angular rules                   | Yes           | Prose only       | #223  |
| 3    | Shorter skill and agent listings, with a ratchet       | Yes           | No               | #224  |
| 4    | Smaller packs by purpose; starters lead with reviewers | Yes           | No (demotes)     | #216  |
| 5    | Withdrawn: the layout stays as it is                   | -             | -                | none  |
| 6    | Baseline gate: keep, demote or delete on lab evidence  | Yes           | Yes              | #225  |
| 7    | Optional workflow pack                                 | No            | No               | #213  |
| 8    | Measure again                                          | -             | -                | #226  |

Steps 1 to 4 remove no artifact, so they don't wait for evidence. Deletion happens only in step 6.

## Progress

As of 2026-11-27. Every PR listed is merged. "Tests" means `npm run test:built` passes except three symlink tests that
fail with `EPERM` on the Windows machine it ran on; CI passes them.

| Step | PR             | Result                                                                           |
| ---- | -------------- | -------------------------------------------------------------------------------- |
| 1    | #228           | typescript 41.7 to 12.8 KB                                                       |
| 2    | #230 #231 #232 | csharp 37.4 to 12.6 KB, react 32.3 to 12.8 KB, angular 49.2 to 15.5 KB           |
| 3    | #229           | `npm run listing-load` with a baseline; `whenToUse` may not repeat `description` |
| 4    | #233           | starters are the two reviewers; tooling split into tooling, scaffold and deps    |
| 6    | #235 to #249   | part done on a reduced budget: see "Step 6 so far"                               |
| 7    | #234           | `review-flow` pack, `/review-changes`                                            |
| 8    | none           | waits for two weeks of real use                                                  |

### Step 6 so far

Run on the owner's work seat, so on `claude-haiku-5-5` only, with 5 dollars in all in place of the 100 the step budgets.
The ledger is [`test/evals/baseline/results.md`](../test/evals/baseline/results.md): 561 paid runs, 3.88 dollars.

- **Screened:** `ts-generate-tests`, `ts-code-reviewer`, and the security, async and logging rules of TypeScript, Python
  and C#. Every screen tied.
- **The skill and the agent:** Haiku called the skill in 3 of 15 working runs and dispatched the agent in 0 of 15, so
  those two screens measure the model alone. No action taken.
- **The nine rules** were cut to the lines the screens support (#240, #246, #248, #249), and each cut was run again.
  Rule text with one source file open is now typescript 10.1 KB, csharp 11.4 KB, python 8.4 KB.
- **What changed Haiku's behaviour in every run:** six lines, each a convention or a non-default choice: a `fetch`
  timeout, no `info` record per item in a loop, a shared `AbortSignal`, an injected logger (TypeScript);
  `ConfigureAwait(false)` and a forwarded `CancellationToken` (C#). General safety practice it followed unasked.
- **Not done:** the confirm and final stages (they need a key with its own spend limit); `cli`, `wizard` and
  `shared/code-reviewer`, which the step puts first; every other skill and agent; the React and Angular rules; the
  conventions, documentation and code-quality rules; any model other than Haiku. Those stay untested, not tied.
- **A limit on what the cuts mean:** a line was cut on three clean runs of one request. Two lines that held in two runs
  of three failed in the third, so a cut line can still be one the model sometimes breaks.

Changed while doing the work:

- **Steps 1 and 2 leave every `code-quality` rule untouched.** It is the one rule the October rounds measured, and 5.6 to
  6.1 KB of each language's load, so C# and React end 0.6 and 0.8 KB over their 12 KB targets.
- **Step 3 drops the collision check** (one alike pair in the catalog, siblings by design, and
  `docs/audits/tools/lane-k-collision.js` exists) **and defers the 300-byte agent budget** to after step 6: 35 of 39 agents
  are over it, and cutting them rewrites the text agents are dispatched on. The report is per language, not per pack.
- **Step 7 ships a skill, not a prompt.** A Copilot prompt file is written with a fixed tool list that can't start agents.
- **Merge order.** The rule PRs (#228, #230, #231, #232) each edit `scripts/rule-load-baseline.json` and the output
  snapshot, and #234 edits two conventions rules #228 and #231 rewrite: merge one, rebase the next, run
  `npm run snapshot:update`. Merge #229 before #233, then lower the listing baseline in #233.

## Decisions

Owner's answers, 2026-11-25:

- **Shrink by evidence.** Field use alone never deletes an artifact, because it reflects one workflow. Field use decides
  what a pack installs by default; a lab comparison against no artifact decides what exists.
- **Any workflow.** The owner's plan-and-worker flow is one way to work, not the design target. Defaults must be cheap for
  every flow, and anything that assumes a flow is optional.
- **Workflow entry points ship as an optional pack**, not inside the starters.
- **One shared skill or agent per role, with stack parts**, as `cli` and `wizard` already do. Withdrawn after a second
  look at the layout: see step 5.

Owner's answers, second round, 2026-11-25:

- **The baseline gate covers every family**, not a pilot.
- **A tie with no field use moves to opt-in first**, and is deleted only when a second run after rewording still ties.
- **Languages need not mirror each other.** A language keeps what helps in that language; a gap is recorded, not filled.
- **C#, React and Angular rules are slimmed now**, by judgment, with what dotnet/skills shows about C#.
- **Shared principles (DRY, KISS, object-oriented patterns) are evaluated before they are added**, not assumed.

## Facts

Sigil, measured:

- Rules with one source file open (`npm run rule-load`): python 9.6 KB, typescript 41.7 KB, csharp 37.4 KB, react 32.3 KB,
  angular 49.2 KB. Only Python was slimmed (#210).
- Installed into an empty project on 2026-11-25 (`sigil add pack:<name>`, frontmatter bytes of skills and agents as an
  upper bound on the listing):

  | Pack               | Claude: skills, agents, rules | Listing | Rules (all path-scoped) | Copilot listing |
  | ------------------ | ----------------------------- | ------- | ----------------------- | --------------- |
  | python-starter     | 1, 1, 1                       | 0.9 KB  | 1.5 KB                  | 0.6 KB          |
  | python-tooling     | 7, 6, 11                      | 7.2 KB  | 19.4 KB                 | 4.5 KB          |
  | typescript-starter | 3, 1, 4                       | 1.6 KB  | 22.7 KB                 | 1.0 KB          |
  | typescript-tooling | 8, 7, 11                      | 8.1 KB  | 57.5 KB                 | 5.4 KB          |

  No pack installs an always-on rule. Before the first prompt a starter costs about 250 to 400 tokens and a tooling pack
  about 2,000; rules load when a matching file is opened.

- The language copies are different text, not near-copies: lines shared by all five members are 4 to 9% for agent
  families, 10 to 15% for skill families (`release` 32%, already on a template) and about 0 for rules. The layout decision
  measured the same on 2026-10-03 (`docs/decisions/catalog-layout-standard-2026-10.md`).
- No skill and no agent has been compared with the same model without it. The `cli` and `wizard` evals force the skill
  ("read SKILL.md and follow it exactly"); firing and dispatch are measured on TypeScript only.
- Field cost per session, median: 2.0k to 2.5k tokens in the Python repos, 7.3k in the TypeScript one (audit § 5.1).
- Catalog: 46 skills, 39 agents, 64 rules. Descriptions: skills 146 bytes median (590 max), agents 405 median (656 max).
- The Claude target emits both `description` and `when_to_use`, and the listing shows both. In several skills the second
  repeats the first (`py-generate-tests` says "Covers project layout, fixtures, parametrize, mocking, and async test
  patterns" in each).
- Eight skill families and seven agent families exist once per language, in five languages. Stack parts exist for two
  shared skills only (`cli`, `wizard`).
- Field use (audit § 5.2): reviewers and security auditors are used; most implementation skills and specialist agents had
  0 uses in 60 to 115 sessions; a delegated worker called none in 1,349 runs.
- A rule that advised "use the pack reviewer" changed nothing; a workflow command that named it did (audit § 5.3).
- Lab, 2026-10-19: an unguided model avoided all 12 trap tasks in 36 runs and hit 60 of 60 coverage points; rules cost
  2.4 times more with no correctness gain; the skill-firing probe passes 54 of 54 (`docs/audits/2026-10-16/results.md`).

Other catalogs, from the 2026-11-25 read (their numbers, not re-checked here):

| Repo          | Context before the first prompt  | Idea taken                                                          |
| ------------- | -------------------------------- | ------------------------------------------------------------------- |
| superpowers   | About 1.5k tokens                | Descriptions that say only when to use a skill, about 100 bytes     |
| ponytail      | About 1.6k tokens                | Paired runs against no artifact, with self-tested graders           |
| agent-skills  | About 3k tokens                  | User-only commands that name a skill; a description collision check |
| dotnet/skills | 1k (core plugin) to 17k (all 17) | A skill must beat the same model without it; symmetric exclusions   |
| ECC           | 17k (minimal) to 40k (full)      | A small common rule file plus path-scoped language deltas           |
| CLI-Anything  | Near zero                        | Skills generated from one source                                    |

None of them publishes field usage, so nothing here says their artifacts are used more than sigil's.

What each installs by default, and how it handles languages (read 2026-11-25):

- **dotnet/skills**: 17 plugins by domain, not by role, and uneven on purpose (`dotnet-test` 24 skills and 10 agents,
  `dotnet-msbuild` 21, `dotnet-data` 2). The core `dotnet` plugin is 5 skills, no agent, no rule. Skills hold tool and
  version facts (EF Core query tuning, breaking changes, MSBuild), not general practice.
- **ECC**: `rules/common` (10 files, 19.9 KB) plus a small delta per language that says it extends the common file
  (python 4.8 KB, typescript 6.8 KB, csharp 7.0 KB). Sigil's C# rules are 56 KB in source.
- **superpowers, ponytail, agent-skills**: no language content at all in the default install.

No catalog ships a generic how-to skill (`generate-tests`, `document`, `add-package`) in its smallest install, and none
has a layer between "common" and "language" for a paradigm such as object orientation.

Sigil on the same two points:

- It already has ECC's shape: `shared/clean-code` (2.2 KB) and `shared/git` (3.4 KB) are bases that `extends` prepends to
  each language's `code-quality` and `git` rule.
- General design advice is the one thing the lab measured as harmful: removing the TypeScript code-quality rule cut
  declarations from 161 to 100 at the same correctness (round 3, p = 0.000122), and its deletion held (H14).
- The mirror is enforced: `catalog-symmetry` reports a family missing from a language, every family has the same five
  members, and no family uses `absent`.

## Step 1: slim the TypeScript rules `[inline: judgment on what to cut]` (#215)

Files: `catalog/languages/typescript/rules/*.rule.md`, `scripts/rule-load-baseline.json`.
Change: apply #210's bar. Keep statements a reviewer could point at in a diff; drop general material, long examples and
explanations of principles. Target: `rule-load` typescript at or under 14 KB, from 41.7 KB. Narrow any `appliesTo` that
loads a rule where it can't apply (`ts-testing` on test files, `ts-dependencies` on manifests, as `py-dependencies` is).
Test: `npm run build && npm run validate && npm run rule-load` shows typescript at or under 14 KB; `npm run evals:check`;
the code-quality eval's T tasks hold against master (tests at least master minus 1, declarations not up: the H14 gate).

## Step 2: slim the C#, React and Angular rules `[inline: judgment on what to cut]` (#223)

Files: the `rules/` folder of `catalog/languages/csharp`, `react` and `angular`, `scripts/rule-load-baseline.json`.
Change: the same bar. Targets: csharp at or under 12 KB (from 37.4), react 12 KB (from 32.3), angular 18 KB (from 49.2,
13 rules). One PR per language. Each language is cut on its own terms:

- Keep what is specific to the language's tools and versions (for C#: nullable context, `async` and cancellation, NuGet
  central package management, analyzers). Drop general practice the model already follows.
- A rule left with nothing specific is deleted, and its family records the gap under `absent` with the reason. A language
  never keeps a rule only because the other four have one.
- No new shared rule for DRY, KISS or object-oriented patterns. `shared/clean-code` stays as the one base and goes
  through step 6 like any other artifact.
  Test: `npm run build && npm run validate && npm run rule-load`; `npm run evals:check`; `node dist-cli/cli.js sync --check`.
  There is no eval and no field install for these three languages; the PR says so.

## Step 3: shorter listings, with a ratchet `[worker]` (#224)

Files: `scripts/rule-load.cjs` (or a sibling `scripts/listing-load.cjs`) and its baseline, a conformance rule under
`src/commands/sync/conformance/rules/`, the skill and agent files it flags.
Change:

1. Report listing bytes per pack (name, `description` and `whenToUse` of every skill; name and `description` of every
   agent), and keep each pack within a checked-in baseline, as `rule-load` does for rules.
2. A conformance rule: `whenToUse` must not repeat a sentence of `description`. Fix the skills it flags.
3. A catalog budget for agent descriptions (start at 300 bytes; today's median is 405), checked by `sync --check`. This is
   sigil's own budget, not a provider limit, so it doesn't go on `KindEmitSpec.limits`.
4. A deterministic collision check: two descriptions in one pack that are too alike fail `sync --check`.

Test: `npm run test:built`; the skill-firing probe stays 54 of 54 and the agent-dispatch eval 24 of 24 on the new text.

## Step 4: smaller packs by purpose `[inline: decides what each pack installs]` (#216)

Files: `packs.yaml`, `catalog/README.md`, the skills that become user-invoked.
Change: the starters are already small (see Facts), so the weight is in `<lang>-tooling`, which is what the real repos
install.

- **Starter.** Lead with what field use supports: the language's `code-reviewer` and `security-auditor` and the rules they
  load, plus the hooks and settings of today. `generate-tests` moves out (0 field uses).
- **Tooling, split.** Every `<lang>-tooling` becomes an explicit list, as `python-tooling` is, and the legacy
  `languages: [<lang>]` key is retired. Scaffolding (`new-project`, `add-project`) and dependencies (`add-package`,
  `audit-deps`) become their own packs, as `python-library` already is for release.
- **User-invoked.** Skills a person starts on purpose set `disableModelInvocation`: `new-project`, `scaffold-project` and
  `add-project`, next to `release` and `feature`, which already do. On a target with no such field nothing changes.

Depends on #220: the starter puts reviewers in every install, and `reviewer-bash-guard` still blocks their scratchpad
writes.
Test: the install table in Facts, rerun, shows each tooling pack's listing lower and no starter higher than 2 KB;
`npm run validate`; `node dist-cli/cli.js sync --check`.

## Step 5: withdrawn

The first draft moved `generate-tests` to one shared skill with stack parts. It is dropped, for three reasons:

- A stack is not a language. React, Angular and TypeScript are all `node-ts`, with one stack part between them, and they
  differ exactly where a test skill needs detail.
- A stack skill ships every stack's part to every install, because the task picks the stack at run time (`cli` installs
  23 KB of stack parts next to a 7 KB `SKILL.md`). A language skill ships one language. Converting would add files to
  every install and a read to every use.
- The copies share 10 to 15% of their lines, so there is little to deduplicate.

The existing rule stays: content that follows the project's language goes in `languages/<lang>/`; content that follows a
stack the task picks is one shared skill with stack parts; a tie goes to the language. Agents and rules can't load
references, so they are always per language. Drift between the copies is #217.

## Step 6: baseline gate `[inline: reading eval results]` (#225)

Files: `test/evals/` (a `baseline/` harness beside `skill-firing/`), `test/evals/README.md`, a ledger `results.md`.
Change: for one family at a time, run the same model with and without the artifact on at least five natural requests that
don't name it or its vocabulary. One vote per request, an exact one-sided sign test, and one request it must stay quiet
for. Outcomes, written to the ledger:

| Result                                        | Action                      |
| --------------------------------------------- | --------------------------- |
| Beats no artifact                             | Keep                        |
| Ties, but holds a tool- or repo-specific fact | Keep, cut to that fact      |
| Ties, and field use is 0                      | Opt-in; delete on a 2nd tie |
| Ties, and it is used somewhere                | Move to opt-in, re-test     |
| Too few requests to tell                      | Inconclusive: nothing moves |

Order: `cli` and `wizard` first (the largest skills, 60 and 74 KB with references, never run against no skill), then the
`code-reviewer` family (the one artifact with field use), then the families step 4 moved out of the starters, least used
first. Budget is set per batch before it runs.

Every family is covered, in two stages to hold the cost down. October's runs cost about 0.25 to 0.55 dollars each on the
main model, so 30 runs for each of 85 skills and agents would be about 600 to 1,400 dollars.

1. **Screen, on `claude-haiku-5-5`**: five requests, two arms, three runs each (30 runs per artifact). A tie here is
   trusted: what doesn't help the small model is unlikely to help a larger one. A win is not, so it goes to stage 2.
2. **Confirm, on `claude-sonnet-5-5`**: the same 30 runs, only for an artifact that won the screen.
3. **Final, on `claude-opus-5-5`**: at most three artifacts per batch, the ones a starter would install.

Cost per run, from the October records (`test/evals/*/runs/*.jsonl`): Haiku 0.007 to 0.014 dollars (35 runs), Opus 0.23
without rules and 0.52 with (300 runs), a Sonnet judge call 0.05. Sonnet coding runs were never recorded; 0.05 to 0.15 is a
guess.

First batch: Python and TypeScript (8 skills and 7 agents each) plus `shared/cli`, `shared/wizard` and
`shared/code-reviewer`, 33 artifacts.

| Stage   | Runs                     | Expected             | Cap, set before the run |
| ------- | ------------------------ | -------------------- | ----------------------- |
| Screen  | 33 x 30 = 990            | 10 to 30 dollars     | 30 dollars              |
| Confirm | 30 per winner, up to 8   | 12 to 36 dollars     | 30 dollars              |
| Final   | 30 per artifact, up to 3 | 20 to 47 dollars     | 40 dollars              |
| Total   |                          | 40 to 110, likely 50 | 100 dollars             |

Rules for the money:

- Runs use an API key with a spend limit, not the subscription the owner works on, so a batch can't drain it.
- The harness passes the model id on every run, writes the model the run reports into its record, and drops a record
  whose model differs.
- The harness adds up `costUsd` as it goes and stops at the stage cap; unfinished artifacts are inconclusive.
- The first ten runs of a stage are a price check: if the median is over twice the expected figure, stop and re-plan.
- Grading is by hidden tests and scripted checks; a model judge only where a script can't grade (review reports).

Python and TypeScript members run first, because those installs exist. A result is not carried from one language to
another: a C#, React or Angular member is tested itself or stays marked untested. A deleted member is recorded under its
family's `absent`.
Test: the harness has a selftest with a known-good and a known-useless artifact (`npm run evals:check`); each run is
registered in `results.md` before it starts.

## Step 7: optional workflow pack `[inline: user-facing copy]` (#213)

Files: `packs.yaml`, new prompts under `catalog/shared/prompts/`.
Change: a `review-flow` pack with one command that runs the installed `*-code-reviewer` on the current diff, and the
security auditor beside it when the diff touches input handling, auth, secrets or subprocess calls. No starter includes
it. Remove the "use the installed reviewer" line from the conventions rules, which did nothing (audit § 5.3). A note in
the pack's docs covers headless runs: trimming the skill listing for a worker is a harness setting, not a catalog one.
Test: `sigil add pack:review-flow` on Claude and Copilot in a temp project; in a real session the command starts the pack
reviewer and no generic one.

## Step 8: measure again `[inline: reading the results]` (#226)

Two weeks after steps 1 to 4 are installed in the real repos, rerun `sigil-audit` and record rule and listing tokens per
session, uses per artifact and reviewer findings in a new `docs/audits/<date>/`. Before that run, fix what the review of
the 2026-11-25 audit found: count an artifact's sessions from its own install date, keep the slice from overlapping its
baseline day, and leave plan file names out of the published report.
Test: the new audit shows the TypeScript repo's rule tokens per session near Python's, and each starter's listing lower.

## Not in this plan

- New artifacts, new languages, new targets.
- A bootstrap prompt injected at session start (superpowers, ponytail): it is always-on context and assumes a workflow.
- #217 (drift), #218 (Go and Rust reviewers), #219 (reviewer report format), #220 (bash guard): each has its own issue.
