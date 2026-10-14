# Coverage: code-quality doctrine → delivered text

The code-quality eval measures rules and reviewer agents, not a skill. Each row names a doctrine the
eval's hypotheses depend on and the phrase that must stay in its delivered text. A file is
`rule:<id>` or `agent:<id>`, read resolved (template composed, `extends` bases prepended).
`scripts/check-skill-evals.mjs` fails when a phrase disappears, so a doctrine edit that would
invalidate the baseline is visible.

| doctrine                                       | file                              | phrase                                          |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| One duplication rule, owned by the base        | rule:typescript/ts-code-quality   | a wrong abstraction costs more than duplication |
| Missing infrastructure is reported, not added  | rule:typescript/ts-code-quality   | say so in your summary                          |
| Catch: handle or rethrow; log only at the edge | rule:typescript/ts-code-quality   | log and continue only at a top-level boundary   |
| Reviewer checks the same catch rule            | agent:typescript/ts-code-reviewer | log and continue only at a top-level boundary   |
