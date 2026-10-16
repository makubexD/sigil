# Agent dispatch probe

Does a model pick the right installed agent for a request that does not name one? Agents are
dispatched on their `description` alone, and a TypeScript project gets seven `ts-*` agents plus the
shared ones (`code-reviewer`, `cli-auditor`, `wizard-auditor`). This probe looks for real
misdispatch before any "Not for …" clause is added to a description: lexical overlap between
descriptions is low (Jaccard ≤ 0.10 for 223 same-language pairs), so a similarity rule cannot say
where a clause is needed.

| File           | Contents                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| `prompts.json` | Requests P1–P8, each with the agent its wording points to and the neighbour(s) it borders |
| `probe.mjs`    | The runner (below)                                                                        |
| `coverage.md`  | The description phrases each expected agent is told apart by (`npm run evals:check`)      |
| `results.md`   | The hypothesis, registered before any run, then dated rows                                |
| `runs/*.jsonl` | One record per run: prompt, run, sigil SHA, model, expected and picked agent              |

## A run

`node probe.mjs --sigil <checkout> --out runs/<name>.jsonl [--runs 3]`, from this folder, after
`npm run build` in the checkout. For each prompt and run it:

1. copies `../code-quality/fixture-review` (a small TypeScript project, `src/orders.ts`) into a fresh
   temp directory;
2. installs every TypeScript agent with `sigil add kind:agent --language typescript --target claude`;
3. runs `claude -p "<prompt> Use the most suitable subagent."` with project settings only, and stops
   it at the first subagent call.

The suffix asks for a subagent, so the probe measures which one is chosen, not whether one is. A run
that ends without a subagent is recorded with its reason. A run that ends in an API error (usage
limit, outage) is not recorded; re-running the same command fills only the missing runs.

Known confound, as in `../code-quality`: the user-level instruction file loads in every run.
