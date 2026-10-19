# Skill-firing probe

Does an installed skill fire for a request it covers, and stay quiet for a neighbouring request it
does not? A skill costs nothing until it fires, and it fires on its `description` and `whenToUse`
alone (the listing), so firing is tested before any skill content is (`docs/audits/2026-10-16/`
§ 8, E8, adapted from agent-skills' firing eval). This probe is recorded before any edit to a skill's
listing, and re-run to accept one.

| File                 | Contents                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `prompts.json`       | One should-fire (`Fn`) and one should-stay-quiet (`Qn`) request per model-invocable skill |
| `probe.mjs`          | The runner (below)                                                                        |
| `fixture-workspace/` | A small npm workspace (`packages/core`) with a dependency and drifted tests               |
| `coverage.md`        | The listing phrase each prompt pair depends on (`npm run evals:check`)                    |
| `results.md`         | The hypothesis, registered before any run, then dated rows                                |
| `runs/*.jsonl`       | One record per run: prompt, run, sigil SHA, model, expected skill, the skill that fired   |

The nine skills are every TypeScript and shared skill a model can invoke. `feature` and
`ts-release` set `disableModelInvocation`, so they never fire on their own and are not probed.
Prompts avoid the trigger phrases quoted in each `whenToUse`, so a skill has to fire on what the
request means, not on a matching string. A quiet prompt borrows its skill's vocabulary for a request
no catalog skill covers.

## A run

`node probe.mjs --sigil <checkout> --out runs/<name>.jsonl [--runs 3]`, from this folder, after
`npm run build` in the checkout. For each prompt and run it:

1. makes a fresh project in the OS temp dir: a copy of the prompt's fixture
   (`../code-quality/fixture-review`, `fixture-workspace/`) or an empty folder;
2. installs every TypeScript skill with `sigil add kind:skill --language typescript --target claude`
   (the shared ones come too);
3. runs `claude -p "<prompt>"` with project settings only and nothing appended, and stops it at the
   first skill call, after 6 other tool calls, or when it finishes.

A run counts only if every catalog skill loaded (the `init` event lists them). Claude Code also
loads its own skills (`debug`, `code-review`, `verify`, …); one of those firing on a quiet prompt is
reported, not counted against the catalog. A run that ends in an API error (usage limit, outage) is
not recorded; re-running the same command fills only the missing runs.

Known confound, as in `../code-quality`: the user-level instruction file loads in every run.
