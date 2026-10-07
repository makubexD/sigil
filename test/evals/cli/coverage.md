# Coverage: cli_docu.md → skill

Every item of the original CLI guidance (`cli_docu.md`, plus the gaps added in the plan) has exactly one home.
`scripts/check-skill-evals.mjs` fails if the file is missing or the phrase is not in it. A file is a path
in the skill as it ships (stack parts are `references/stack-<stack>.md`) or `rule:<id>`.

| cli_docu item                                                    | file                       | phrase                            |
| ---------------------------------------------------------------- | -------------------------- | --------------------------------- |
| CLI as a small language, public interface                        | SKILL.md                   | small language                    |
| Git as inspiration, not copied blindly                           | references/grammar.md      | borrow from git                   |
| Modes: new / existing / refactor                                 | SKILL.md                   | refactor                          |
| Audit before modifying an existing CLI                           | SKILL.md                   | audit before                      |
| Discovery: every surface, incl. Docker/Podman, Makefiles, CI     | references/auditor.md      | podman                            |
| Search the whole repo for real usage                             | references/auditor.md      | actual usage                      |
| Current model: command tree                                      | references/auditor.md      | command tree                      |
| Per-command card: purpose … exit behavior … examples             | references/findings.md     | exit behavior                     |
| Hierarchy: nouns/verbs, grouping, depth justified                | references/grammar.md      | depth                             |
| Naming: list / show-all / fetch / get-all                        | references/grammar.md      | show-all                          |
| Singular/plural consistency                                      | references/grammar.md      | singular                          |
| Positionals are identity; no ambiguous sequences                 | references/grammar.md      | deploy production api 3 true      |
| Options: long names, short aliases, booleans, defaults, required | references/grammar.md      | short alias                       |
| Progressive discoverability of help                              | references/grammar.md      | progressive                       |
| Output: human vs machine, stable, no needless decoration         | references/contract.md     | decoration                        |
| stdout vs stderr                                                 | references/contract.md     | stdout is the payload             |
| Errors: what, which input, correction                            | references/contract.md     | did you mean                      |
| Exit codes (0 / 1 / 2 usage)                                     | references/contract.md     | usage error: unknown command      |
| Composability: jq, grep, awk, scripts                            | references/contract.md     | jq                                |
| Finding classes, six                                             | references/findings.md     | cosmetic                          |
| Findings are not equally important                               | references/findings.md     | severity                          |
| Target grammar as CURRENT → TARGET                               | references/findings.md     | current → target                  |
| No breaking change without approval                              | SKILL.md                   | explicit yes                      |
| Refactor: preserve business/domain logic, incremental            | references/migration.md    | incremental                       |
| Search usage before changing a command                           | references/migration.md    | search the repository             |
| Deprecation path old → warning → new                             | references/migration.md    | is deprecated and will be removed |
| Don't keep a bad structure forever                               | references/migration.md    | forever                           |
| Prefer / reject command shapes                                   | references/grammar.md      | app execute --resource users      |
| Method chaining as inspiration, not a Fluent Interface           | references/grammar.md      | fluent interface                  |
| Final validation list                                            | references/findings.md     | validation list                   |
| Final command reference                                          | references/findings.md     | command reference                 |
| Unfamiliar developer can predict and discover                    | references/findings.md     | unfamiliar                        |
| Build: declarations drive parser and help                        | references/architecture.md | single source                     |
| Tests spawn the real binary                                      | references/testing.md      | real entry point                  |
| Characterization tests before refactor                           | references/testing.md      | characterization                  |
| Stack guidance                                                   | references/stack-python.md | clickexception                    |
| Portable rules text for adopt                                    | rule:cli-rules             | cli rules                         |
