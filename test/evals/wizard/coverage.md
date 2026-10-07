# Coverage: every item of the standard and every seeded defect traces to a reference line

Checked by `scripts/check-skill-evals.mjs`: the phrase in the third column must appear in the named file
(a path in the skill as it ships, or `rule:<id>`).

| item                                     | file                       | phrase                                                     |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| WD1 terminal check before prompting      | references/contract.md     | stdin and stderr are both terminals                        |
| WD2 prompts on stderr                    | references/contract.md     | A wizard is conversation, not payload                      |
| WD3 back navigation                      | references/architecture.md | the review offers **Back**                                 |
| WD4 nothing wizard-only                  | references/flow.md         | **Nothing wizard-only.**                                   |
| WD5 reuse validators                     | references/flow.md         | **Validators are the command's own**                       |
| WD6 same code path                       | references/architecture.md | same function the parser dispatches to                     |
| WD7 review and equivalent command        | references/flow.md         | Show the equivalent command lines                          |
| WD8 no partial state                     | references/contract.md     | Asking changes nothing                                     |
| WD9 destructive only after review        | references/contract.md     | confirmed by a single keystroke mid-flow                   |
| WD10 in help, help-safe                  | references/flow.md         | prints help and runs nothing                               |
| WD11 cancel exits 130                    | references/contract.md     | A cancel is not success                                    |
| readiness scan                           | references/readiness.md    | Run this scan before designing                             |
| engine owns navigation                   | references/architecture.md | the navigation belongs to a small engine                   |
| scripted testing                         | references/testing.md      | The scripted prompter                                      |
| parity test                              | references/testing.md      | **parity**                                                 |
| colour order                             | references/contract.md     | `TERM=dumb` (disables)                                     |
| no secrets in flags                      | references/contract.md     | never accepts secrets as visible text                      |
| non-interactive run only with --no-input | references/contract.md     | never changes anything by accident                         |
| secrets through env                      | references/architecture.md | Secrets go to the command through its environment variable |
| given values keyed by step id            | references/architecture.md | Given values are keyed by step id                          |
