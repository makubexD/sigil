# Real-usage audit: where Sigil stands, 2026-11-25

A self-contained briefing on how Sigil is being measured in real repos, what the numbers say, what changed because of them,
and what is still open. It is written so that a reader with no access to this machine (another engineer, or another AI asked
for a second opinion) can follow the method, check the reasoning and challenge the conclusions.

Files in this folder:

| File                                             | What it is                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                      | This briefing                                                                                                                                                                                                          |
| [`sigil-audit-report.md`](sigil-audit-report.md) | The full, unedited output of the audit script for 2026-11-25 (home directory shortened to `~`). Every number below comes from it unless marked otherwise                                                               |
| [`measurement-spec.md`](measurement-spec.md)     | The plan the audit script was built from: goals, data sources, the format questions answered from real logs, every metric's definition, the finding rules and their test cases. It lives outside this repo (see below) |

## 1. Context

### What Sigil is, in one paragraph

Sigil is a catalog of AI-assistant artifacts (rules, skills, agents, hooks, settings) written once in a provider-neutral form
and rendered by target layers into what each assistant expects (Claude Code, GitHub Copilot, Codex, Cursor, OpenCode,
Antigravity). `sigil add pack:<name>` installs a curated set into a repo and records it in `.sigil/manifest.json`;
`sigil status` reports drift. Version at the time of this audit: 0.10.0.

### The question being audited

Since 2026-11-04 the project direction is "use Sigil for real" ([`docs/plan-real-usage.md`](../../plan-real-usage.md)): the
catalog is the product, Claude and Copilot come first, and new work comes from evidence on real repos, filed as `real-usage`
issues, rather than from more lab tests or more targets. The audit answers four questions per installed artifact:

1. **Reach.** Does it load, fire or get picked, in the main session and in the delegated worker?
2. **Cost.** What does it cost in context tokens, per session and per use?
3. **Effect.** Does the code or the review output show its effect?
4. **Understood.** Do drift (hand edits), misfires or repeated violations say it is misunderstood?

Plus a fifth, because the catalog is shared across languages: **parity**, the same role (e.g. `conventions`,
`code-reviewer`) compared between TypeScript and Python.

### How the work is actually done on these repos

The usage data comes from one developer's daily workflow, which shapes what can be observed:

- **Main session:** Claude Code (Claude Opus) plans each feature as a numbered plan file (`docs/plan-<feature>.md`), runs it
  step by step with a `/next` command, reviews every step and runs a final review of the whole feature. Sessions are short:
  `/clear` is used between plans and whenever context reaches about 200k tokens, so one feature usually spans several
  sessions.
- **Worker:** mechanical plan steps are delegated to `mk-exec`, a headless `claude -p` run (Claude Code as the harness, a
  DeepSeek model behind it). The worker loads the repo's own `.claude/` config, so it sees the same Sigil rules, skills and
  agents as the main session, but no user-level config.
- **Reviews:** a review subagent runs on most steps and on every finished feature. Until 2026-11-20 the workflow's finish
  step hardcoded a generic reviewer (`agent-skills:review`, from a third-party plugin); since then it runs the repo's
  installed `*-code-reviewer` agent first (section 5.3).

### Repos in scope

All on one machine, Claude target only (see Limits for Copilot). Install dates come from each manifest's `installedAt`. The three audited repos are
named `repo-a`, `repo-b` and `repo-c` in place of their folders, here and in the files this audit links to.

| Repo                    | Stack                | Installed (Claude)                 | What is installed                                                                                                                                                  | Sessions | Worker runs |
| ----------------------- | -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: | ----------: |
| `repo-a`                | Python app           | 2026-11-11                         | 9 rules, 2 agents (`py-code-reviewer`, `py-security-auditor`), 2 skills (`py-add-package`, `py-generate-tests`), 2 hooks (`reviewer-bash-guard`, `protect-config`) |      115 |         659 |
| `repo-b`                | Python app           | 2026-11-05, reinstalled after #210 | 7 rules, 5 agents, 4 skills, 1 settings fragment (`py-allow-dev-tools`)                                                                                            |       60 |         351 |
| `repo-c`                | TypeScript (Bun) CLI | 2026-11-11                         | 10 rules, 6 agents, 5 skills (including the repo's own `cli` and `wizard` overlays and their auditors)                                                             |       73 |         333 |
| `sigil` (this repo)     | TypeScript           | 2026-11-05                         | 11 rules, 7 agents, 8 skills; no hooks, since they would block this repo's own config edits                                                                        |        1 |           6 |
| `~/sigil-live/h/claude` | sandbox              | 2026-11-02                         | 1 hook (`protect-config`), a live-test target                                                                                                                      |        1 |           0 |

Period: each repo from its install date to 2026-11-25. repo-b has had no sessions since 2026-11-20, so its
numbers are frozen at that date. The last two rows are under the 10-session floor and the script reports them as "too early".

## 2. How it is measured

### Timeline of measurement methods

| When            | Method                                                                                                                   | Where it is recorded                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Aug 20-26       | Seven lab audit rounds: dogfood install, SME review lanes, scripted harness, adversarial benchmarks, dispatch probes     | `docs/audits/2026-08-2x/`, `docs/decisions/`                                   |
| Sep 27 - Oct 16 | Live-prompt campaign against real Claude Code and Copilot CLI; targeted probes; a benchmark of four agent-guidance repos | `docs/audits/2026-09-27/` to `2026-10-16/`                                     |
| Nov 4           | Direction change: real use drives the work ([`plan-real-usage.md`](../../plan-real-usage.md))                            | that plan                                                                      |
| Nov 5-8         | First hand count on repo-b (6 sessions, 51 worker runs) from transcripts                                                 | "Facts" in [`plan-catalog-slim.md`](../../plan-catalog-slim.md)                |
| Nov 20          | `sigil-audit` script built and run on every repo; checked by hand against one transcript and one worker stream           | [`measurement-spec.md`](measurement-spec.md), step 7 of `plan-catalog-slim.md` |
| Nov 25          | Rerun (this folder), plus a slice since Nov 20 to see the effect of the workflow change                                  | this folder                                                                    |

### The audit script

`sigil-audit` is a Python 3 standard-library script, read-only, that lives in the developer's Claude Code config
(`~/.claude/bin/sigil-audit`), not in this package, by design: it audits one machine's usage, and nothing leaves that
machine. It costs no model tokens; an optional `/sigil-audit explain` mode asks the model to read the flagged artifacts and
suggest wording. Its full spec, including the answers to every log-format question and the test cases, is in
[`measurement-spec.md`](measurement-spec.md).

Data sources, none of them added for this audit (no new hooks or capture):

| Source                                                                                      | What it gives                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A metrics ledger written by user-level hooks (`events-YYYY-MM.jsonl`)                       | Every session start and end, Skill and Agent tool calls by name, typed slash commands, the plan and step of each prompt, each worker launch; each with `cwd` and session id    |
| Claude Code session transcripts (`~/.claude/projects/<repo>/*.jsonl`)                       | Rule loads (`nested_memory` attachments with the file path), hook runs (`hook_success`), hook blocks (error tool results starting `sigil-hook: blocked`), subagent transcripts |
| Subagent transcripts (`<session>/subagents/agent-<id>.jsonl`)                               | The final report of each review agent, with its severity headings                                                                                                              |
| Worker logs (`mk-worker-logs/*/meta.json`, `stream.jsonl`) and the worker's own transcripts | Runs per repo, the skills and agents listed to the worker in its `init` event, the worker's Skill/Agent calls and its rule loads                                               |
| `.sigil/manifest.json` and `sigil status --json` in each repo                               | What is installed (id, kind, target, files) and drift per artifact                                                                                                             |
| `git log -p` in each repo                                                                   | Suppressions added before and after install                                                                                                                                    |

Repos are found automatically: every `cwd` in the ledger, resolved to its git top level, kept if it has a Sigil manifest.

### Definitions

- **Session:** one Claude Code main session whose `cwd` is in the repo. Because of the `/clear` habit, sessions are short and
  numerous; per-session figures should be read as "per context window".
- **Use:** a Skill tool call, an Agent tool call, or a typed `/name`, counted once (verified: they never overlap).
- **Rule load:** a rule file attached to the context, counted once per session per file. Path-scoped rules load on the first
  matching file read, and again after a context compaction.
- **Tokens:** bytes ÷ 4, the same rough estimate Sigil's own `rule-load` script uses. It measures context occupancy, not
  billed cost (prompt caching makes repeated loads cheap in money but they still take context).
- **Listing cost:** the one-line name and description of each installed skill and agent that the harness puts into every
  session, main and worker, whether or not it is ever used.
- **Reviewer findings:** items under Critical/High/Medium/Low headings (or Critical/Required/Optional/Nit, normalized) in a
  review agent's final report. Reports without such headings count as `unparsed`.
- **Suppressions:** added lines in `.py`, `.ts`, `.tsx` matching `# noqa`, `# type: ignore`, `@ts-ignore`,
  `@ts-expect-error`, `eslint-disable` or `as any`, per 100 added lines, compared with a window of equal length before
  install.

### Finding rules

The script turns the numbers into issue-ready findings with fixed thresholds: `removal candidate` (installed, 10+ sessions,
0 uses), `removal candidate: everywhere` (same in 2+ repos), `listed, never used` (listed to the worker in 50+ runs, 0 calls
anywhere), `costly rule` (top 3 by cost in a repo and over 500 tokens per load), `pack reviewer bypassed` (a generic reviewer
used more often than the installed pack reviewer), `fix in catalog` (drift), `catalog gap` (a non-Sigil skill or agent used
5+ times), `parity: slim <lang>` (same role over 2× the other language's cost per load), `parity: port to <lang>`, and a few
that did not fire (`hook failing`, `rule not followed`, `quality: look`, `shared candidate`). The full table is in the spec.

## 3. What was found and done before this audit

From the Nov 5-8 hand count on repo-b, filed as #209-#213 and worked in
[`plan-catalog-slim.md`](../../plan-catalog-slim.md):

| Issue | Finding                                                                                                                   | What was done                                                                                                                                  | Status                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| #209  | `py-git` matched `**/*.py` and loaded on every Python read; a section was repeated through `extends`                      | Scoped to `.gitignore`; duplicate H2 removed; `validate` now fails on a repeated H2 after `extends`                                            | Closed                                        |
| #210  | 7 Python rules loaded about 7.5k tokens on the first `.py` read, again after each compaction (about 142k over 6 sessions) | Always-on Python rules cut to checkable statements, from 27.8 KB to at most 12 KB rendered                                                     | Closed; confirmed by this audit (section 5.1) |
| #211  | `python-starter` pulled release and API-compat artifacts into apps                                                        | New `python-library` pack                                                                                                                      | Open                                          |
| #212  | Skills duplicated existing repo commands (`generate-tests`, `sync-tests`) with nothing warning                            | `sigil add` warns on an overlap                                                                                                                | Open                                          |
| #213  | Pack reviewer agents lost to a globally installed generic reviewer                                                        | A closing line in each conventions rule ("use the installed reviewer"); did not change behaviour. The workflow fix of Nov 20 did (section 5.3) | Open, updated                                 |

The Nov 20 script run opened #215-#220 (section 6).

## 4. Headline results, 2026-11-25

1. **The Python slim worked and held.** Rule context per session, median: repo-a 2.5k tokens, repo-b 2.0k,
   against about 7.5k before #210. No quality signal moved the wrong way (suppressions stay near zero, reviewer findings per
   review did not rise; but see Limits on what these can show).
2. **TypeScript was not slimmed and costs 3-4× Python.** repo-c: 7.3k median, 10.2k max in the main session, 12.6k
   max in the worker. Per role, TypeScript rules cost 2-10× their Python counterparts (`ts-conventions` 1,945 tokens per load
   vs `py-conventions` 198). #215.
3. **The pack reviewer now wins, but because of a workflow change, not a rule.** Since 2026-11-20, pack reviewer vs generic
   reviewer calls: repo-a 16 vs 2, repo-c 8 vs 3. Up to Nov 20, generic won in all three repos (repo-a 25 vs
   31, repo-b 14 vs 36, repo-c 7 vs 20).
   The "prefer the pack reviewer" line added to the conventions rules in #213 had no measurable effect; changing the
   workflow command that launches the review did.
4. **The worker never calls a Sigil skill or agent.** 0 calls in 1,349 worker runs across four repos, although every run's
   context lists them. It does load the rules (they are path-scoped and arrive with file reads). #216.
5. **Most implementation skills and specialist agents are never used, in either session.** Used at all: the reviewers and
   security auditors, `py-architecture-reviewer` (4), `py-performance-profiler` (1), `py-add-package` (5), and repo-c'
   own `cli`/`wizard` overlays. Never used in 60-115 sessions per repo: `py-generate-tests` (two repos), `py-sync-tests`,
   `py-document`, `feature`, `py-debugger`, `py-refactor-specialist`, `ts-generate-tests`, `ts-add-package`, `ts-audit-deps`,
   `ts-debugger`. #216.
6. **`reviewer-bash-guard` misfires on read-only reviewers.** 98 blocks in repo-a (36 of them since Nov 20), mostly
   `mkdir -p` and redirects into the session scratchpad and `python -c ''`. No hook has ever failed (non-zero exit). #220.
7. **Three hand edits (drift)** remain unfolded: `ts-add-package` and `ts-npm` in repo-c, `py-allow-dev-tools` in
   repo-b. #217.
8. **Review findings cannot be traced to rules.** Reviewers name a Sigil rule by id in about 3 of 104 reports, so "which
   rule is not being followed" cannot be measured. #219.

## 5. Results in detail

### 5.1 Cost: context tokens per session

Median and max per session, from `sigil-audit-report.md`. `rules` is Sigil rules only; `listing` is the skill and agent
listing.

| Repo   | Main rules median / max | Main listing | Worker rules median / max | Main total median |
| ------ | ----------------------- | ------------ | ------------------------- | ----------------- |
| repo-a | 2,537 / 2,917           | 461          | 2,537 / 3,303             | 2,998             |
| repo-b | 2,049 / 2,815           | 907          | 2,049 / 2,815             | 2,956             |
| repo-c | 7,323 / 10,189          | 1,488        | 8,695 / 12,637            | 8,811             |

Trend (`history.jsonl`, one line per repo per run): the medians are identical on Nov 20 and Nov 25 in all three repos, so
the post-slim Python cost is stable over another 33 repo-a sessions.

Costliest rules, tokens per load (cumulative tokens over the period in brackets):

| Repo   | 1st                           | 2nd                     | 3rd                           |
| ------ | ----------------------------- | ----------------------- | ----------------------------- |
| repo-a | `py-code-quality` 692 (507k)  | `py-testing` 386 (263k) | `py-documentation` 304 (223k) |
| repo-b | `py-code-quality` 692 (270k)  | `py-testing` 386 (128k) | `py-documentation` 304 (119k) |
| repo-c | `ts-conventions` 1,945 (659k) | `ts-async` 1,570 (532k) | `ts-security` 1,496 (507k)    |

Parity, tokens per load by role (TypeScript vs Python):

| Role           | TypeScript | Python | Ratio |
| -------------- | ---------: | -----: | ----: |
| conventions    |      1,945 |    198 |   9.8 |
| async          |      1,570 |    254 |   6.2 |
| security       |      1,496 |    258 |   5.8 |
| project-layout |      1,292 |    230 |   5.6 |
| logging        |      1,005 |    215 |   4.7 |
| documentation  |      1,087 |    304 |   3.6 |
| testing        |      1,372 |    386 |   3.6 |
| dependencies   |      2,183 |    766 |   2.8 |
| code-quality   |      1,408 |    692 |   2.0 |

For agents and skills, "tokens per use" is their listing cost over every session of the period divided by their uses (the
agent's own run is not counted): `ts-code-reviewer` 2,515 vs `py-code-reviewer` 1,487; `ts-security-auditor` 10,061 vs
`py-security-auditor` 2,239; `py-add-package` 20,552, because it is listed in hundreds of sessions and used 5 times.

### 5.2 Reach: what gets used

Main-session uses over each repo's whole period (worker uses are 0 everywhere):

| Artifact                        |              repo-a |                                                                                                  repo-b |                                                                repo-c | Notes                              |
| ------------------------------- | ------------------: | ------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------: | ---------------------------------- |
| `*-code-reviewer`               |                  40 |                                                                                                      14 |                                                                    15 | Run by the workflow (section 5.3)  |
| `*-security-auditor`            |                  40 |                                                                                                       - |                                                                     5 | Run beside the reviewer            |
| `py-architecture-reviewer`      |                   - |                                                                                                       4 |                                                                     - | `ts-` version: 1 use in repo-c     |
| `py-performance-profiler`       |                   - |                                                                                                       1 |                                                                     - |                                    |
| `py-add-package`                |                   5 |                                                                                                       - |                                                                     - | The only implementation skill used |
| `cli`, `wizard` (overlays)      |                   - |                                                                                                       - |                                                                  4, 1 | Repo-specific consumer overlays    |
| `cli-auditor`, `wizard-auditor` |                   - |                                                                                                       - |                                                                  3, 4 |                                    |
| Never used                      | `py-generate-tests` | `feature`, `py-document`, `py-generate-tests`, `py-sync-tests`, `py-debugger`, `py-refactor-specialist` | `ts-add-package`, `ts-audit-deps`, `ts-generate-tests`, `ts-debugger` |                                    |

Rules: every installed always-on rule loads in practically every session (e.g. 732 loads of each core Python rule in
repo-a across main and worker sessions); narrower rules load when their files are touched (`py-dependencies` 87,
`ts-npm` 27, `cli-rules` 48).

The worker is listed every installed skill and agent in every run (e.g. `py-generate-tests` listed in 625 repo-a worker
runs, the four unused TypeScript artifacts in 322 repo-c runs) and calls none of them. In a delegated step the worker
gets an exact spec (files, change, test command), so it has no reason to reach for a generic skill; the listing is pure cost
there.

Non-Sigil skills and agents used 5+ times (reported as `catalog gap`): `agent-skills:review` (27, 30, 14),
`agent-skills:code-review-and-quality` (18, 16, 9), `agent-skills:code-reviewer` (6, 6), and Claude Code's built-in `Explore`
and `general-purpose` agents (11 each in repo-a). These are the generic review path the workflow used before Nov 20, and
built-in search agents, so they are not catalog gaps in the sense of a missing artifact.

### 5.3 The reviewer experiment

This is the clearest cause-and-effect in the data, so it is worth spelling out.

- **Before:** the pack reviewer (`py-code-reviewer`, `ts-code-reviewer`) lost to a generic reviewer installed globally from
  a third-party plugin. Nov 20 counts, pack vs generic: repo-a 25 vs 31, repo-b 14 vs 36, repo-c 7
  vs 20.
- **Attempt 1 (#213, catalog side):** one closing line in each language's conventions rule: "for code review in this repo,
  use the installed `<lang>-code-reviewer` agent rather than a general-purpose reviewer." The rule loads in essentially every
  session. No change in the ratio.
- **Attempt 2 (Nov 20, workflow side):** the developer's `/next` command, finish step 2, changed from "run
  `/agent-skills:review`" to "if the repo has a `*-code-reviewer.md` agent, run it (plus the security auditor when the diff
  touches input handling, auth, secrets or subprocesses); otherwise the generic review".
- **After (Nov 20-25 slice):** repo-a 16 `py-code-reviewer` + 15 `py-security-auditor` vs 2 `agent-skills:review`;
  repo-c 8 `ts-code-reviewer` + 2 `ts-security-auditor` vs 3 generic. repo-b had no sessions, so its
  `pack reviewer bypassed` finding is stale.

Reading: an instruction in an always-loaded rule did not override an explicit command in the workflow that launches the
review. Where the workflow names a tool, the rule loses. This matters for every "prefer X" line in the catalog.

### 5.4 Effect

Reviewer output (whole period):

| Reviewer                     | Repo   | Reviews | Critical | High | Medium | Low | Unparsed |
| ---------------------------- | ------ | ------: | -------: | ---: | -----: | --: | -------: |
| `py-code-reviewer`           | repo-a |      39 |        9 |   82 |    146 | 150 |        3 |
| `py-security-auditor`        | repo-a |      39 |        0 |   16 |    100 | 180 |        5 |
| `agent-skills:code-reviewer` | repo-a |       4 |        0 |   14 |     20 |  15 |        0 |
| `py-code-reviewer`           | repo-b |      14 |        6 |   44 |     83 |  44 |        2 |
| `agent-skills:code-reviewer` | repo-b |       5 |        0 |    8 |     22 |  16 |        0 |
| `ts-code-reviewer`           | repo-c |      15 |        7 |   47 |     56 |  45 |        4 |
| `ts-security-auditor`        | repo-c |       5 |        0 |   17 |     43 |  41 |        1 |
| `agent-skills:code-reviewer` | repo-c |       6 |       10 |   30 |     35 |  13 |        0 |

The pack reviewers produce about 10-13 findings per review, most of them Medium and Low. The counts show volume, not
precision: nobody has labelled which findings were real, fixed or ignored.

Suppressions per 100 added lines, before vs after install: repo-a n/a (no history before install) vs 0.05;
repo-b 0.57 vs 0.03; repo-c 0.0 vs 0.0. The repo-b "before" figure was 0.03 on Nov 20
and 0.57 now, only because the "before" window is as long as the "after" one and grew with it; treat this metric as noise at
this scale.

Worker runs per plan step: median 1, max 4 in repo-a, across 659 runs. Rework is rare, but it is not attributed to any
artifact.

### 5.5 Hooks

`reviewer-bash-guard` (repo-a) blocked 98 commands from read-only reviewer agents, 36 of them since Nov 20 when the pack
reviewers started running more often. The blocked commands are almost all writes into the session scratchpad
(`mkdir -p`, `>` redirects) and `python -c ''`, which are harmless: the guard is doing what it says, but its definition of
"write" is too broad for how reviewers actually work. `protect-config` blocked once, in the sandbox. No hook ever exited
non-zero. Allowed hook runs leave no trace in the transcripts, so hooks can only be measured by their blocks.

### 5.6 Drift

| Artifact             | Repo   | Status                    |
| -------------------- | ------ | ------------------------- |
| `ts-add-package`     | repo-c | Drifted (1 of 2 installs) |
| `ts-npm`             | repo-c | Drifted (1 of 2 installs) |
| `py-allow-dev-tools` | repo-b | Drifted                   |

Each is a hand edit that may be a catalog fix or may be project-specific; none has been reviewed yet. #217.

## 6. Open issues and their state

| Issue | Title                                                                     | Evidence in this audit              | Next step                                                                          |
| ----- | ------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| #215  | TypeScript rules weren't slimmed like Python                              | 5.1                                 | Port the #210 method to TypeScript; target about Python's per-role cost            |
| #216  | Implementation skills are never called, by the worker or the main session | 5.2                                 | Decide: remove from packs, move to an opt-in pack, or change how they're triggered |
| #217  | Three hand edits to fold back, and `ts-conventions` outdated in this repo | 5.6                                 | Review each diff: fold back or mark project-specific                               |
| #218  | Go and Rust have no code-reviewer or security-auditor agent               | Parity, given 5.3                   | Add them, now that the workflow picks the pack reviewer by file name               |
| #219  | Reviewer reports need a fixed format with a rule field per finding        | 5.4                                 | A `rule:` field per finding, so findings can be tied to rules                      |
| #220  | `reviewer-bash-guard` blocks reviewers writing to the session scratchpad  | 5.5                                 | Allow the scratchpad and empty `python -c`                                         |
| #213  | Pack reviewer agents lose to globally installed reviewers                 | 5.3                                 | Can close: solved on the workflow side; decide whether the rule line stays         |
| #211  | `python-starter` installs `py-packaging` on apps                          | -                                   | Check whether the `python-library` pack change closed it                           |
| #212  | `sigil add` doesn't warn when a skill overlaps an existing command        | -                                   | Same check                                                                         |
| #206  | Copilot loads Claude skills twice after installing both targets           | Not measured (Copilot out of scope) | Separate                                                                           |

## 7. Limits of the evidence

- **One developer, one machine, one workflow.** Every number reflects a single person's habits, notably a plan-driven flow
  where most implementation goes to a worker with an exact spec. Skills meant for open-ended requests ("generate tests for
  this module") may simply have no occasion to fire in this flow. Usage elsewhere could look very different.
- **Claude only.** Copilot was part of the original real-usage install, but its logs are out of scope, so nothing here says anything about the
  Copilot target. The other targets (Codex, Cursor, OpenCode, Antigravity) are not used at all.
- **The worker is not Claude.** It runs on Claude Code as the harness with a DeepSeek model, so "the worker never calls a
  skill" may be partly a model trait, not only a fit problem.
- **Counts show use, not value.** A rule that loads every session and a skill that fires can both be useless; nothing here
  measures whether a loaded rule changed what the model wrote.
- **Field data shows trends, not causes.** The lab evals in `test/evals/` (TypeScript only: code quality with suppressions
  and type errors, skill firing 54/54, agent dispatch 24/24) are where cause is tested. Python has no lab evals.
- **Tokens are an estimate** (bytes ÷ 4) and count context occupancy, not billed cost.
- **Small samples.** 60-115 sessions per repo over two to three weeks; the sigil repo and the sandbox are below the
  10-session floor. Suppression counts are too small to mean anything.
- **Reviewer findings are unlabelled.** No one has marked findings as true, false or acted on, so reviewer quality is unknown.

## 8. Questions for a second opinion

1. **Is the method sound?** Are reach, cost, effect, understood and parity the right axes for judging a catalog of AI
   artifacts? What signal is missing, given only transcripts, a tool-call ledger and git history?
2. **The rule that lost to the workflow (5.3).** An always-loaded rule said "use the pack reviewer"; an explicit workflow
   command said otherwise and won every time. What does that imply for how the catalog should phrase preferences, and should
   the catalog ship workflow-level integration (commands, settings) rather than advice in rules?
3. **Unused skills (#216).** Remove them, move them to an opt-in pack, rewrite their descriptions to trigger better, or
   accept that they serve other workflows? How would you tell "badly described" from "not needed" with this data?
4. **The worker.** A delegated, spec-driven worker sees every skill and agent and uses none. Should packs install a slimmer
   set for headless runs, or should the listing be left to the harness?
5. **How far to slim TypeScript (#215).** Python went from about 7.5k to 2-2.5k tokens per session with no visible quality
   loss. Is "the same per-role budget as Python" a sensible target, and what would show that the cut went too far?
6. **Measuring effect.** The current effect metrics (suppressions, findings by severity, runs per step) are weak. What cheap,
   automatic signal would show whether a rule changed the code, without a lab eval per rule?
7. **Reviewer quality.** The pack reviewers produce 10-13 findings per review. Is a fixed format with a `rule:` field
   (#219) enough, or should precision (findings acted on vs dismissed) be tracked, and how?
8. **What would you stop measuring,** because it costs attention and cannot change a decision?

## 9. How to reproduce

On the developer's machine: `sigil-audit` (all repos, each since install), `sigil-audit --since 2026-11-20` (the slice in 5.3),
`sigil-audit --json` for machine-readable output. Each run rewrites `~/.claude/state/metrics/sigil/report-<date>.md` and
appends one line per repo to `history.jsonl`. The script and its tests (`bin/tests/test-sigil-audit.sh`, fixtures cut from
real logs with no prompt text) live in the developer's Claude Code config, not in this repo.
