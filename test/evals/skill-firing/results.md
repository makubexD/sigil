# Results

## Hypothesis (registered 2026-10-19, before any run)

**Probe S0**: catalog at master on the day of the run, prompts F1–F9 and Q1–Q9 × 3 runs (54
runs), `claude-opus-5-5`, Claude Code 2.1.301 or the version recorded with the row.

- **H13**: every model-invocable skill fires when it should and stays quiet when it should not.
  - A skill **fires** when its `Fn` prompt's first skill call names it in at least 2 of 3 runs. A
    built-in skill called first counts as a miss: the catalog skill lost the request.
  - A skill **stays quiet** when its `Qn` prompt calls no catalog skill in at least 2 of 3 runs. A
    built-in skill on a quiet prompt is reported, not counted.
- **Decision rule**: edits change only `description` or `whenToUse`, never a skill body, and only
  where the probe found a miss.
  - A skill that does not fire gets one trigger clause in its `whenToUse`, in the user's words
    from the missed prompt's situation (not the prompt's text).
  - A quiet prompt that fires a catalog skill gets one "Not for …" clause in that skill's
    `whenToUse`, naming the case.
  - If every skill fires and stays quiet, H13 holds and no listing changes.
- **A clause is accepted** when a fresh probe of all 18 prompts (3 runs) gets the missed prompt
  right in at least 2 of 3 runs, and no other prompt loses more than one correct run.
- Reported, not gated: tool calls before the skill fired, and which built-in skills fired.
- Limits, stated in advance: one model, TypeScript only, prompts written by someone who has read the
  listings (each avoids the quoted trigger phrases, but not the ideas behind them).

**Probe S1** (registered 2026-11-26, before any run): the `Fn` prompts of S0 unchanged, 3 runs each,
`claude-haiku-5-5`, catalog at master on the day of the run. Prompts whose skill has since become
user-invoked only are left out.

- **H14**: Haiku fires each skill in at least 2 of 3 runs, as Opus did in S0.
- Why: in the baseline gate (`../baseline/results.md`) Haiku called `ts-generate-tests` in 3 of 15
  runs that had it installed. S1 says whether that is the model or those prompts.
- **Decision rule**: no listing changes from S1 alone. If H14 fails, the miss is reported per skill
  and a wording change is tried only where Opus and Haiku both miss.
- The quiet prompts are not run: a model that fires less cannot fail them.

## Runs

| Date       | Probe                                     | Commit                                                     | Model              | Result                                                                                                                                                              |
| ---------- | ----------------------------------------- | ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | S0 (`runs/s0.jsonl`), Claude Code 2.1.301 | catalog `3b96e03`, runner `4cd25fe`                        | `claude-opus-5-5`  | **H13 holds**: 54 of 54 runs correct; each of F1–F9 fired its skill 3 of 3, each of Q1–Q9 stayed quiet 3 of 3                                                       |
| 2026-11-26 | S1 (`runs/s1-haiku.jsonl`)                | catalog `e215772` plus the unmerged baseline request files | `claude-haiku-5-5` | **H14 fails**: 13 of 21 runs fired. 3 of 3: `ts-audit-deps`, `ts-document`, `ts-sync-tests`. 1 of 3: `ts-generate-tests`. 0 of 3: `ts-add-package`, `cli`, `wizard` |

**S0.** No listing changes, per the decision rule. Reported, not gated:

- Tool calls before the skill fired: 0 in 20 runs, 1 in 7 (F1, F2 and one F7 run read a file first); mean 0.26.
- No built-in skill fired on any prompt, fire or quiet.
- The quiet runs called no skill at all: 15 reached the 6-tool-call cap, and 12 finished first (all of Q2, Q3 and
  Q8, and one run each of Q4, Q5 and Q6).
- 24 runs (F6–Q9) were first rejected by a session usage limit and re-run after the reset, as the protocol requires.
  The runner change in `4cd25fe` only creates the records folder; the catalog under test is master `3b96e03`.
- What this does not show: firing on other models, in other languages' skills, or on prompts written by someone who
  has not read the listings (see Limits).

**S1.** No listing changes, per its decision rule: Opus fired all seven of these in S0, so no skill is
missed by both models.

- Haiku does call a skill when the request sits close to its listing: three skills fired in every run.
- The four it missed are requests where it could start on the task directly (add a library, write
  tests, build a command-line tool, build a wizard). It began the work in the first six tool calls
  without calling the skill.
- This explains most of the baseline gate's low count for `ts-generate-tests` (3 of 15): the same
  model fires it 1 of 3 here, on a prompt written to match its listing.
- Not recorded: cost (a run is stopped before its result event) and the model each run reported. Runs
  of this length cost under a cent on Haiku in the baseline gate.
