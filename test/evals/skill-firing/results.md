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

| Date | Probe | Commit | Model | Result |
| ---- | ----- | ------ | ----- | ------ |
