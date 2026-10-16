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

| Date       | Probe                | Commit                                  | Model             | Result                                                                                                                                                                                                                                                   |
| ---------- | -------------------- | --------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | D0 (`runs/d0.jsonl`) | `0d850a6` (catalog as master `d285808`) | `claude-opus-5-5` | **H8 holds.** 24 of 24 runs picked the expected agent; no prompt misdispatched, no built-in agent picked, every run called a subagent. P3 and P4 read files first (1 to 3 tool calls); the rest dispatched straight away. PR7 adds no "Not for …" clause |

**Reading.** On these eight requests the descriptions already separate the TypeScript agents,
including the generic `code-reviewer` (whose description defers to a language reviewer) from
`ts-code-reviewer`. Limits: the prompts were written by someone who had read the descriptions, so
each leans on a distinguishing phrase; the suffix asks for a subagent; and one language, one model.
A request phrased against the grain (a per-file security check, a "slow and wrong" bug) is not
covered. The probe stays as the check to run before any future description clause.
