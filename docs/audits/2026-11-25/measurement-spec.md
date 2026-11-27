# Plan: sigil audit

A report, run now and then, that shows whether each sigil artifact installed in a real repo does its job, what it costs, and
what the catalog should change. It's the field half of a feedback loop. Sigil's lab evals (`test/evals/` in the sigil repo)
show cause on fixed tasks; this report shows reach, cost and outcome on real work. Its findings go back to sigil as
`real-usage` issues, which drive catalog plans there. It's a script. AI reads its report only when you ask.

## Goal and scope

Owner's decisions, 2026-11-04:

- **Claude and the DeepSeek worker only.** Copilot and the other targets are out of scope, including their logs.
- **It lives beside `/next` and `/clear`**, in `~/.claude`, not inside the sigil package. No new step in the daily flow.
- **Repos are found automatically.** Nothing to register.
- **This machine only.** Other machines and other people's usage are out of scope. Nothing leaves this machine.
- **Compare across repos.** The catalog is the product, so the report also shows each artifact across every repo.
- **Count everything, analyse sigil.** Sigil artifacts get the full analysis. Everything else gets one short section, for gaps.
- **Scripts first.** No API call, no model turn, no tokens unless you ask for an interpretation.

Added 2026-11-20:

- **Four questions per artifact.** Does it reach the work: does it load, fire or get picked, in the main session and in the
  worker? What does it cost in tokens, per session and per use? Does the code show its effect? Is it understood, or do drift,
  misfires and repeated violations say otherwise?
- **Every Claude artifact kind**: rules, skills, agents, commands, hooks, MCP servers and settings. A kind installed nowhere
  gets one line saying so.
- **TypeScript and Python first, compared by role.** Artifacts that do the same job in both languages (`ts-code-reviewer` and
  `py-code-reviewer`, `ts-conventions` and `py-conventions`) sit side by side. A fix proven in one language becomes a candidate
  for the other, and for `catalog/shared/` when both need it. The other languages inherit from there.
- **Clarity is judged on demand.** The script flags what looks misunderstood; only `/sigil-audit explain` spends tokens to read
  those artifacts and suggest wording.

## First results: `sigil-audit`, 2026-11-20

From the script (step 8), each repo since its install. Hand counts in repo-a match: 25 `py-code-reviewer` uses, 502 worker
runs, 74 sessions loading `py-code-quality`. The first run found and fixed three script errors: hook runs credited to the wrong
hook, rule cost per use instead of per load, and rule loads missed from sessions started in a subdirectory. The one-off hand
run before this plan used other periods, so its numbers differ; these replace them.

| Finding                                       | Evidence                                                                                                                                                                                                              | Fix goes to                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Pack reviewer bypassed                        | Pack vs generic review calls: repo-a 25 vs 31, repo-b 14 vs 36, repo-c 7 vs 20. `/next` finish step 2 hardcodes `/agent-skills:review`                                                                                | `~/.claude/skills/next/SKILL.md` (step 9) |
| The worker never calls a sigil skill or agent | 0 Skill and 0 Agent calls in 1,164 worker runs (502, 351, 305, 6). Every run's init lists them: 11 `listed, never used` findings, 302 to 483 runs each                                                                | sigil: worker fit, or removal             |
| TypeScript rules weren't slimmed like Python  | Rule tokens per session, median: repo-c 7.3k, repo-a 2.5k, repo-b 2.0k. `parity: slim typescript` on 9 roles, 2 to 10 times Python per load (`ts-conventions` 1,945 vs `py-conventions` 198)                          | sigil: port #210 to TypeScript            |
| Implementation skills unused                  | `removal candidate` 9, `everywhere` 1 (`py-generate-tests`): `generate-tests`, `sync-tests`, `document`, `debugger`, `refactor-specialist`, `ts-add-package`, `ts-audit-deps`, `feature`, 0 uses in 60 to 82 sessions | sigil: same as the worker row             |
| Hand edits                                    | Drifted: `ts-add-package` and `ts-npm` in repo-c, `py-allow-dev-tools` in repo-b. `ts-conventions` outdated in the sigil repo                                                                                         | sigil: fold back into the catalog         |
| Costly rules                                  | `ts-conventions` 1,945, `ts-async` 1,570, `ts-security` 1,496, `py-code-quality` 692 tokens per load, each top 3 by cost in its repo                                                                                  | sigil: same as the TypeScript row         |
| `reviewer-bash-guard` misfires                | 65 blocks of read-only reviewers in repo-a (scratchpad `mkdir -p`, redirects, `python -c ''`)                                                                                                                         | sigil: allow the scratchpad               |
| Catalog gap                                   | `agent-skills:review` 14 to 30 uses a repo, `agent-skills:code-review-and-quality` 9 to 18: the generic reviewer, covered by step 9                                                                                   | step 9, not the catalog                   |
| Rule cites                                    | 0 rule cites counted in any repo: reviewers don't cite rules by name                                                                                                                                                  | sigil: a fixed reviewer report format     |
| Suppressions                                  | Per 100 added lines, before and after install: repo-a 0.09 and 0.05, repo-b 0.03 and 0.03, repo-c 0 and 0. No `quality: look`                                                                                         | none                                      |
| Too early                                     | The sigil repo and `~/sigil-live/h/claude` (a live-test sandbox) have 1 session each                                                                                                                                  | the report says "too early"               |

Sigil's own `docs/plan-catalog-slim.md` step 7 (re-measure through about Nov 18) is still open. Step 8 here closes it with these
numbers.

## What already exists

The silent layer is built, so this plan adds **no hook and no capture**. The digest in Phase 2 of
`docs/plan-workflow-metrics.md` was never built, so nothing reads this data yet.

| Fact                                                                                                                                                              | Source                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| The ledger has `skill` (`name`), `agent` (`type`), `prompt` (`slash`, `plan`, `step`), `mk_exec` and `session_start`/`session_end`, each with `cwd` and `session` | `state/metrics/events-YYYY-MM.jsonl`       |
| Transcripts record rule loads as `nested_memory` attachments, with `path`                                                                                         | `projects/<repo>/*.jsonl`                  |
| Transcripts record hook runs as `hook_success`, with `hookName`, `command`, `durationMs`, `exitCode`                                                              | Same                                       |
| Transcripts hold each subagent's final report as the Agent tool result                                                                                            | Same                                       |
| Transcripts are kept (`cleanupPeriodDays: 36500`), and `metrics-archive` holds compressed copies                                                                  | `settings.json`, `state/metrics/archive/`  |
| Worker runs have `meta.json` (repo, tokens, cost, `project_config`) and `stream.jsonl`, whose `init` event lists the skills and agents                            | `state/mk-worker-logs/*/`                  |
| Pack reviewers return a severity-ranked report, cite the rule a finding breaks, and run the repo's gate (ruff, mypy, pytest; tsc, eslint)                         | `<repo>/.claude/agents/*-code-reviewer.md` |
| Each sigil repo's manifest lists `id`, `kind`, `target` and `files[].path`                                                                                        | `<repo>/.sigil/manifest.json`              |
| `sigil status --json` reports drift per artifact: `status`, `driftedFiles`, `missingFiles`                                                                        | sigil 0.10.0                               |
| Lab evals, TypeScript only: code quality (with `suppressions`, `typeErrors`, inflation), skill firing 54/54, agent dispatch 24/24                                 | sigil `test/evals/`                        |

Nothing is stored twice. The ledger and archive already keep the history, so the audit can recompute any period. It saves only
one summary line per repo per run, for trends.

## What it measures, and what it can't

| Question   | Signal                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reach      | Rule loads per session. Skill, agent and command uses, main session and worker apart. Hook runs and blocks                                                                          |
| Cost       | Tokens per session: rules loaded, plus the skill and agent listing (name and description), plus MCP instructions. Tokens per use: what an artifact costs over the period ÷ its uses |
| Effect     | Per repo, since install: suppressions added in commits, the lab's `suppressions` measure; pack reviewer findings per review, by severity; worker runs per plan step                 |
| Understood | Drift. A rule that reviewers cite again and again. A skill listed to the worker in many runs and never called                                                                       |
| Parity     | Same-role pairs across TypeScript and Python: cost, use, drift and findings side by side                                                                                            |

Size is bytes ÷ 4, the same rough rule as sigil. Suppressions are added lines matching `# noqa`, `# type: ignore`,
`@ts-ignore`, `@ts-expect-error`, `eslint-disable` or `as any`. Where a repo has history from before its install, a window of
the same length before it is shown beside the one after.

Limits, printed in the report so nobody over-reads it:

- A count shows use, not value. A rule that always loads and a skill that fires can both be useless.
- Field numbers show trends, not causes. Cause is the lab's job; a field finding becomes a lab hypothesis when it needs proof.
- Allowed sigil hooks leave no trace, so hooks show blocks only. Reviewer reports don't cite rules reliably, so findings
  count by severity only.
- Under 10 sessions in a repo, it prints "too early" instead of naming anything unused.

## Step 1: Pin down the formats `[inline: judging real log data]`

Files: `docs/plan-sigil-audit.md`, `bin/tests/fixtures/sigil-audit/`.

Read real data and record the answers here, before any parser is written:

- How to tell a sigil hook from others in a `hook_success` line. Installed hooks are inline `node -e` commands, so check for a
  stable marker against `.claude/settings.json`.
- The attachment type for a blocked or failed hook. repo-a has about 5 candidate PreToolUse block lines; confirm one.
- Whether an allowed sigil hook leaves any trace. If none, the report shows blocks only and says so; no capture is added.
- Whether a skill typed as `/name` lands in `prompt.slash`, `skill`, or both, so it isn't counted twice.
- Whether a loaded skill's rule `uses` show up in `nested_memory`.
- How a pack reviewer's report shows severity and the rule it cites, inside the Agent tool result. If the rule isn't cited
  reliably, record it: that's a sigil issue (a fixed report format), and step 4 counts severity only.
- Whether a headless worker session loads path-scoped rules. Check the Claude Code docs first. If they don't settle it, one
  `mk-exec --effort low` run in repo-a that reads `src/` and reports which `.claude/rules` files it was given.
- The listing text the model sees per skill and agent, for the cost estimate.

Save small fixtures cut from real lines, with no prompt text, code or paths outside the repo: one ledger file, one transcript
with a reviewer report, one manifest, one `sigil status --json` output, one worker `meta.json` and `stream.jsonl`.

Test: the fixtures exist, and `grep -rE 'content|prompt' bin/tests/fixtures/sigil-audit/` shows only field names.

### Answers, 2026-11-20

Read from the four sigil repos' transcripts, the ledger and 1,674 worker runs. Fixtures and their layout:
`bin/tests/fixtures/sigil-audit/README.md`. Later steps follow these, not the guesses above them.

| Question                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sigil hook in `hook_success` | Not identifiable. `command` reads `command hook <N>`, a position label for inline commands (N=1 is rtk in these repos), so it isn't stable. Map hooks from the manifest instead: a `hook` entry's `configFiles[].fragment.hooks.<Event>[].matcher`.                                                                                                                                                                    |
| Blocked hook                 | No attachment. A block is a `user` line whose `tool_result` (`is_error: true`) text starts `PreToolUse:<Tool> hook error: [<command or label>]: <stderr>`, with `toolDenialKind: "permission-rule"` and `permissionDecision.source: "hook"`. Sigil's text is `sigil-hook: blocked …`; that's the marker. Blocks from reviewers sit in subagent transcripts, `<session>/subagents/agent-<id>.jsonl`, so read those too. |
| Allowed sigil hook           | No trace: sigil hooks print nothing when they allow, and only hooks with output get a `hook_success` line. The report shows blocks only and says so. No sigil hook has failed (`exitCode` is 0 on every line).                                                                                                                                                                                                         |
| `/name` vs Skill             | No overlap. A typed `/name` lands only in `prompt.slash` (380 `/next`, 0 `skill` events named `next`); `skill` events come from the Skill tool only. Uses = `slash` + `skill`.                                                                                                                                                                                                                                         |
| Skill `uses` and rule loads  | `uses` is resolved at install time (`dependentOf` in the manifest) and stripped from the installed skill. Rules load only by their `paths` glob, as `nested_memory`, whatever skill runs: `py-dependencies` loaded in 1 of 6 `py-add-package` sessions, after a `pyproject.toml` read. Don't credit rule loads to skills.                                                                                              |
| Reviewer report              | Agents run in the background: the Agent tool result is a launch stub. The report is the `input.message` of the last `SubagentHandback` tool call in the subagent transcript; its `.meta.json` gives `agentType`. 104 reports found.                                                                                                                                                                                    |
| Severity                     | Headings `##`–`####` named Critical, High, Medium, Low (as the agent files prescribe) or Critical, Required, Optional, Nit(s) (what most code-reviewer reports use). Normalize Required→high, Optional→medium, Nit→low. A finding is an unindented `- ` or `N. ` item under that heading, up to the next heading; `None.` is 0. 10 of 71 pack reports have no severity heading: count them as `unparsed`.              |
| Rule cited                   | Not reliable: a sigil rule is named by id in 3 of 104 reports (`py-security`). Step 4 counts severity only and the report says so. Sigil issue: a fixed report format with a `rule:` field per finding.                                                                                                                                                                                                                |
| Worker rule loads            | Seen. The worker writes its own transcript to `~/.claude-worker/projects/<project key>/<session_id>.jsonl`, `session_id` from `meta.json`; 1,135 of 1,674 runs have `nested_memory` lines. Worktree runs sit under the worktree's key, so join by `session_id`, not by folder. No docs check or probe run was needed.                                                                                                  |
| Listing text                 | Same in main and worker. Skills: `skill_listing.content`, one `- <name>: <description> - <when_to_use>` line each (`py-add-package` 560 bytes). Agents: `agent_listing_delta.addedLines`, `- <type>: <description>` (`py-code-reviewer` 379, `py-security-auditor` 486). MCP: `mcp_instructions_delta.addedBlocks`.                                                                                                    |

Also seen, for step 8's issues:

- `shared/reviewer-bash-guard` blocks read-only reviewers about 70 times in repo-a, mostly `mkdir -p` and redirects into
  the session scratchpad and `python -c ''`: a misfire, not a guard working. Sigil issue: allow the scratchpad.
- `py-add-package` `uses` `python/py-packaging`, which isn't installed in repo-a.
- Transcript lines can be cut off mid-write; parsers skip a line that isn't JSON, as for the ledger.

So step 2 also reads subagent transcripts and the worker transcripts, with `WORKER_PROJECTS_DIR` overriding
`~/.claude-worker/projects/` for tests, and step 4 counts severity only.

## Step 2: Find repos and collect usage `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

Python 3, standard library only, read-only, in the style of `bin/workflow-report`. `METRICS_DIR`, `CLAUDE_PROJECTS_DIR` and
`MK_LOG_DIR` override the default paths, for tests.

Find repos: take every `cwd` in the ledger, resolve each to its git top level, and keep those with `.sigil/manifest.json`. Worktrees
under `~/.cache/mk-worktrees/` and missing folders are skipped. `--repo <path>` limits it to one, and `--since YYYY-MM-DD` sets the
start, defaulting to each repo's earliest `installedAt`.

Collect per repo, keeping `target: claude` entries only: artifact list by kind, sessions, skill, agent and command uses from the
ledger, rule loads and hook runs from transcripts, and drift by running `sigil status --json` in the repo. From the worker logs
for that repo: runs, Skill and Agent calls, and the skills and agents its `init` lists. If `sigil` isn't on `PATH` or fails,
drift reads `unknown`, and the run goes on.

| Case                                                     | Expected                                       |
| -------------------------------------------------------- | ---------------------------------------------- |
| Ledger with one sigil repo and one other repo            | Only the sigil repo is found                   |
| A ledger `cwd` that no longer exists                     | Skipped, no error                              |
| A `cwd` under a worktree in `~/.cache/mk-worktrees/`     | Skipped                                        |
| Skill `py-debugger` used twice, in the fixture           | Count 2                                        |
| A skill typed as `/name`                                 | Counted once, per step 1's answer              |
| A manifest entry with `target: copilot`                  | Not listed                                     |
| `--since` after every event                              | Zero counts, exit 0                            |
| A malformed ledger line                                  | Skipped and counted in a `skipped_lines` total |
| `sigil` not on `PATH`                                    | Drift `unknown`, exit 0                        |
| Worker stream with one `Skill` call for `py-add-package` | Worker uses 1, main uses unchanged             |
| Worker `init` listing 18 skills                          | That run counts each of the 18 as listed       |
| A worker run for another repo                            | Not counted                                    |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## Step 3: Token cost `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

Per repo, per session: rule tokens loaded (each loaded file counted once per session), listing tokens for the installed skills
and agents, and MCP instruction tokens when a sigil MCP is installed. Report the median and max per session, main and worker
apart. Per artifact: total tokens over the period and tokens per use (`n/a` when unused).

| Case                                                                       | Expected                           |
| -------------------------------------------------------------------------- | ---------------------------------- |
| One session loads a 4,000-byte rule twice                                  | 1,000 rule tokens for that session |
| Three sessions at 1k, 2k and 9k rule tokens                                | Median 2k, max 9k                  |
| A skill whose listing is 400 bytes, listed in 10 worker runs, used 0 times | 1,000 tokens, per use `n/a`        |
| No MCP installed                                                           | MCP tokens 0, no error             |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## Step 4: Effect on the code `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

Per repo, from `git log -p` of commits reachable from `HEAD` in the period:

- Suppressions added per 100 added lines of `.py`, `.ts` and `.tsx`, with the patterns above. Removed lines don't count.
- The same figure for the window before install, when the repo has commits there; else `n/a`.

From transcripts: pack reviewer reports, with findings counted by severity and, per step 1, by the rule cited. From the ledger:
worker runs per plan step, by the `plan` and `step` of the session's `prompt` events.

| Case                                                | Expected                  |
| --------------------------------------------------- | ------------------------- |
| A commit adding 100 lines, 2 with `# noqa`          | 2 per 100                 |
| A commit removing a `# type: ignore` line           | Not counted               |
| `as any` inside a `.md` file                        | Not counted               |
| No commits before install                           | Before `n/a`              |
| A reviewer report with 1 high and 2 medium findings | high 1, medium 2          |
| Two reviews citing `py-code-quality`                | `py-code-quality` cited 2 |
| Three `mk_exec` events in a session on plan step 4  | Step 4: 3 worker runs     |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## Step 5: The report `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

Default output is plain text, at most 40 lines per repo. `--json` prints the same data. It always writes the full Markdown report
to `state/metrics/sigil/report-YYYY-MM-DD.md`, and appends one line per repo to `state/metrics/sigil/history.jsonl`: date, repo,
sessions, used and installed counts per kind, drifted count, rule tokens per session (median), suppressions per 100 lines.

Per repo, in this order:

1. Header: repo, period, sessions, worker runs, `skipped_lines` if any, and the limits.
2. **Corrected by hand:** drifted artifacts first, since that's the strongest signal.
3. **Reach:** skills, agents and commands by use, main and worker apart, then never used. Rules by load count. Hooks: runs,
   blocks, failures, average ms; a failing hook is marked `FAILING`.
4. **Cost:** tokens per session by kind, then the five costliest artifacts with tokens per use.
5. **Effect:** suppressions before and after, reviewer findings by severity, the most cited rules, worker runs per step.
6. **Outside sigil:** other skills and agents used 5 times or more.

After the repos, when two or more are in the report:

- **Across repos**, at most 40 lines: one row per sigil artifact with repos installed, repos used, total uses, repos drifted.
  Drift first, then most used.
- **Across languages**, at most 30 lines: artifacts paired by role, the id with its language part removed (`typescript/ts-` and
  `python/py-`). One row per role: TypeScript and Python each with cost per session, uses, drift and times cited. A role in one
  language only shows `missing` on the other side.

`--repo` leaves both sections out, and `--json` carries them under `across` and `languages`.

| Case                                            | Expected                                             |
| ----------------------------------------------- | ---------------------------------------------------- |
| One drifted file                                | Listed in the first section                          |
| Hook with `exitCode` 1                          | `FAILING`                                            |
| Run twice the same day                          | Report replaced, `history.jsonl` gains a second line |
| `--json`                                        | Valid JSON with the same counts as the text          |
| The report's full text                          | Holds no prompt text, by a fixture sentinel string   |
| No sigil repo found                             | One line says so, exit 0                             |
| `ts-conventions` and `py-conventions` installed | One `conventions` row with both sides                |
| `ts-release` with no Python counterpart         | `release` row, Python `missing`                      |
| One repo, or `--repo <path>`                    | No Across sections                                   |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## Step 6: Findings `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

A closing list of rule-based findings. Each names its rule and prints an issue-ready block: title, the evidence lines, and where
the fix goes, a catalog path in sigil or a file in `~/.claude`.

| Rule                                                                                              | Finding                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| An artifact drifted; `<n> repos` when 2 or more, `project-specific?` when 1 of 2 or more installs | `fix in catalog`                      |
| A hook has any non-zero exit that isn't a deliberate block                                        | `hook failing`                        |
| Never used, with 10 or more sessions                                                              | `removal candidate`                   |
| Installed in 2 or more repos, each with 10 or more sessions, and used in none                     | `removal candidate: everywhere`       |
| Listed to the worker in 50 or more runs, and called 0 times by anyone                             | `listed, never used`                  |
| In the top 3 rules by cost, and over 500 estimated tokens per load                                | `costly rule`                         |
| A generic reviewer runs more often than the pack reviewer, in a repo that has one                 | `pack reviewer bypassed`              |
| A rule cited in 3 or more reviews in one repo                                                     | `rule not followed: clarity or load?` |
| Suppressions per 100 lines higher after install than before                                       | `quality: look`                       |
| Non-sigil skill or agent used 5 or more times                                                     | `catalog gap`                         |
| Same role, one language's rules cost over 2 times the other's per session                         | `parity: slim <language>`             |
| A role in one language only, used 5 or more times there                                           | `parity: port to <language>`          |
| Same role drifted in both languages                                                               | `shared candidate`                    |

| Case                                                         | Expected                                       |
| ------------------------------------------------------------ | ---------------------------------------------- |
| Fixture with 12 sessions, one unused skill                   | `removal candidate`                            |
| Fixture with 3 sessions, one unused skill                    | "too early", no `removal candidate`            |
| Non-sigil skill used 5 times, and 4 times                    | The first is a `catalog gap`, the second isn't |
| Two repos, one artifact drifted in both                      | `fix in catalog: 2 repos`                      |
| Two repos, one artifact drifted in one                       | `fix in catalog: project-specific?`            |
| `ts-npm` and `py-dependencies` both drifted, same role       | `shared candidate`                             |
| Two repos with 12 sessions each, one artifact unused in both | `removal candidate: everywhere`                |
| Skill listed in 60 worker runs, used 0 times                 | `listed, never used`                           |
| `agent-skills:review` 10, `py-code-reviewer` 4               | `pack reviewer bypassed`                       |
| `py-code-quality` cited in 3 reviews                         | `rule not followed: clarity or load?`          |
| TypeScript rules 8k per session, Python 3k                   | `parity: slim typescript`                      |
| Suppressions 0.5 before, 1.2 after                           | `quality: look`                                |
| Every finding                                                | Has its rule, evidence and fix target          |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## Step 7: `/sigil-audit` and the workflow `[inline: changes the shared workflow rules]`

Files: `skills/sigil-audit/SKILL.md`, `~/.local/bin/sigil-audit` (a symlink, like the others). The daily flow doesn't change.

- `/sigil-audit` runs the script and shows its output as it is, with no model commentary. `disable-model-invocation: true`, so it
  never fires by itself and costs nothing when unused.
- `/sigil-audit explain` reads that day's Markdown report and the installed files of each flagged artifact, then suggests
  catalog changes: wording where a rule looks misunderstood, cuts where it costs, removals, ports between languages. This is the
  clarity review, and the only part that spends tokens, only when typed.

Test: run `/sigil-audit` once in a real session: script output, no model analysis.

## Step 8: First real run `[inline: reading the first results]`

Run it on the real data and check its counts by hand against one transcript and one worker stream. Fix anything that's wrong.
Replace the "Known already" table with the first results, so the plan keeps one set of numbers.

Then, in the sigil repo: record the numbers in `docs/plan-catalog-slim.md` step 7 and close it, and open or update `real-usage`
issues for each confirmed finding. Expected at least: port the #210 slim to TypeScript, decide the worker fit of the
implementation skills, fold back the three drifts, give Go and Rust their `-code-reviewer` and `-security-auditor` like the other
five languages, and a fixed reviewer report format if step 1 found the rule cite unreliable.
Note that Python has no lab evals, as context on the issues; a new eval still waits for evidence, per sigil's
`plan-real-usage.md`.

Test: one skill count, one rule count and one worker count match a manual count.

## Step 9: The pack reviewer first in `/next` `[inline: changes the shared workflow rules]`

Files: `skills/next/SKILL.md`, `CLAUDE.md`.

Approved by the owner on 2026-11-20, as long as it works the same for every language. It does, by file name, not by language:
sigil ships `<prefix>-code-reviewer` and `<prefix>-security-auditor` for Python, TypeScript, React, Angular and C#, and a shared
`code-reviewer`; Go and Rust get theirs from step 8's issue.

- `skills/next/SKILL.md` finish step 2: if the repo's `.claude/agents/` has a `*code-reviewer.md`, run it on the whole feature,
  plus the `*security-auditor.md` beside it when there is one and the diff touches input handling, auth, secrets or subprocess
  calls. With more than one reviewer installed, run the one whose language the diff touches. Otherwise run
  `/agent-skills:review`, as today. One review per feature, never both.
- `CLAUDE.md`, Working model: the independent-pass line names the repo's installed reviewer first, then the current list.

Test: `grep -n 'code-reviewer' skills/next/SKILL.md CLAUDE.md` shows both lines. After the next finished plan in a sigil repo,
the ledger shows the repo's reviewer and no `agent-skills:review` for that session, and `sigil-audit` drops
`pack reviewer bypassed` there.

## Step 10: Fixes before the next run `[worker:medium]`

Files: `bin/sigil-audit`, `bin/tests/test-sigil-audit.sh`.

Written 2026-11-27 from the review of the 2026-11-25 run. Not built yet: the script lives in the developer's Claude Code
config, not in this package. `docs/plan-lean-catalog.md` step 8 waits for these.

**1. Count an artifact from its own install date.** Sessions, worker runs, uses, listings and tokens for one artifact
start at that manifest entry's `installedAt`, not at the repo's earliest one. The repo header keeps the repo's period.
Each artifact row carries its own session count, and the findings that need "10 or more sessions" or "50 or more runs"
read that count. An artifact below it is "too early", as a repo is today.

**2. Keep a slice off its baseline day.** `--since D` starts at 00:00 local time on `D` and includes it. A new
`--until D` stops before 00:00 on `D` and excludes it. A before-and-after pair is `--until D` and `--since D`, so no
event is in both. The header prints both bounds as `since..until`, with the end marked as excluded. The Nov 25 slice and
its baseline both counted Nov 20.

**3. `--publish` writes a report that can be committed.** The default output and the files under `state/metrics/sigil/`
stay as they are, for reading on the machine. With `--publish <file>` the script also writes a Markdown report in which:

- each repo is `repo-a`, `repo-b`, ... in the order of the report, everywhere its path or folder name would print, the
  findings included;
- each plan file is `docs/plan-NN.md`, numbered across the report in order of first appearance;
- the home directory is `~`;
- the first lines say the report is redacted and how.

The letters and numbers are stable between runs: the mapping is kept in `state/metrics/sigil/names.json`, a new name
takes the next free label, and the mapping is never written to the published file. The 2026-11-25 report was redacted by
hand, twice; its labels (`repo-a` to `repo-c`, `plan-01` to `plan-77`) seed the mapping.

| Case                                                                              | Expected                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Repo installed on day 1, one skill added on day 8, 12 sessions, 4 after day 8     | That skill: 4 sessions, "too early"                               |
| The same skill, 12 sessions after day 8, unused                                   | `removal candidate`                                               |
| A skill listed in 60 worker runs, 20 of them after its install                    | Listed 20, no `listed, never used`                                |
| One event at 23:59 on Nov 19, one at 00:00 on Nov 20                              | `--until 2026-11-20` has the first, `--since` the second          |
| `--until` and `--since` on the same day, counts added                             | Equal to the count with neither flag                              |
| `--until` before `--since`                                                        | An error that names both, exit 2                                  |
| `--publish out.md`, fixture repo folder `secret-app`, plan `docs/plan-billing.md` | Neither string is in `out.md`; `repo-a` and `docs/plan-01.md` are |
| `--publish` run twice, a second repo added between                                | The first repo keeps `repo-a`, the new one is `repo-b`            |
| `--publish`, the published file                                                   | Does not hold the home directory or `names.json` content          |
| No `--publish`                                                                    | Output as before, names in full                                   |

Test: `bash ~/.claude/bin/tests/test-sigil-audit.sh`.

## After this plan

Catalog changes are made in sigil, each from a `real-usage` issue, in a sigil plan. Rerun `/sigil-audit` one to two weeks after
each catalog release; `history.jsonl` shows whether cost, drift, suppressions and reviewer findings moved.
