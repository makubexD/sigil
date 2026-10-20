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

## Runs

| Date       | Probe                                     | Commit                              | Model             | Result                                                                                                        |
| ---------- | ----------------------------------------- | ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | S0 (`runs/s0.jsonl`), Claude Code 2.1.301 | catalog `3b96e03`, runner `4cd25fe` | `claude-opus-5-5` | **H13 holds**: 54 of 54 runs correct; each of F1–F9 fired its skill 3 of 3, each of Q1–Q9 stayed quiet 3 of 3 |

**S0.** No listing changes, per the decision rule. Reported, not gated:

- Tool calls before the skill fired: 0 in 20 runs, 1 in 7 (F1, F2 and one F7 run read a file first); mean 0.26.
- No built-in skill fired on any prompt, fire or quiet.
- The quiet runs called no skill at all: 15 reached the 6-tool-call cap, and 12 finished first (all of Q2, Q3 and
  Q8, and one run each of Q4, Q5 and Q6).
- 24 runs (F6–Q9) were first rejected by a session usage limit and re-run after the reset, as the protocol requires.
  The runner change in `4cd25fe` only creates the records folder; the catalog under test is master `3b96e03`.
- What this does not show: firing on other models, in other languages' skills, or on prompts written by someone who
  has not read the listings (see Limits).
