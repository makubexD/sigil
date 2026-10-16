# Results

## Hypothesis (registered 2026-10-16, before any run)

**Probe D0**: catalog at master `d285808` (this branch changes no catalog file), prompts P1–P8 × 3 runs, `claude-opus-5-5`.

- **H8**: no description collision among the TypeScript agents. A prompt is _misdispatched_ when
  its first subagent call names a catalog agent other than the expected one in at least 2 of its 3
  runs.
- **Decision rule**: a misdispatched prompt earns one "Not for …" clause, in the description of the
  agent that was wrongly picked, naming the expected agent. No clause is added anywhere else. If no
  prompt is misdispatched, H8 holds and PR7 adds no clause.
- **A clause is accepted** when a fresh probe of all eight prompts (3 runs) has the misdispatched
  prompt right in at least 2 of 3 runs, and no other prompt loses more than one correct run.
- A pick of a built-in agent (`general-purpose`, `Explore`, `Plan`, `claude`) or no subagent at all
  is reported, not counted as a collision: a description clause between catalog agents cannot fix it.
- TypeScript only; the other languages' agents share the same descriptions' shape.

## Runs

| Date | Probe | Commit | Model | Result |
| ---- | ----- | ------ | ----- | ------ |
