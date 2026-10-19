# Coverage: firing doctrine → delivered description

The firing probe measures whether a skill fires on its `description` and `whenToUse` (the listing
the model reads). Each row names the phrase one prompt pair in `prompts.json` depends on: the case
the skill covers, or the neighbour it excludes. A `skill:<id>` row reads the skill as it ships:
title, description, `whenToUse` and body. `scripts/check-skill-evals.mjs` fails when a phrase
disappears, so a listing edit that would invalidate a recorded probe is visible.

| doctrine                                 | file                                 | phrase                                                    |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| F1: a package not yet installed          | skill:typescript/ts-add-package      | I need a library for X                                    |
| Q1: an upgrade needs no vetting          | skill:typescript/ts-add-package      | not for bumping an existing package                       |
| F2: dependency CVEs and staleness        | skill:typescript/ts-audit-deps       | any known CVEs                                            |
| Q2: code-level security is elsewhere     | skill:typescript/ts-audit-deps       | code-level (not dependency-level)                         |
| F3: exported symbols without TSDoc       | skill:typescript/ts-document         | missing TSDoc                                             |
| F4: a file with no tests                 | skill:typescript/ts-generate-tests   | when a source file has no tests                           |
| Q4: a failing or missing run is not this | skill:typescript/ts-generate-tests   | Not for fixing an existing failing test                   |
| F5: drifted tests across files           | skill:typescript/ts-sync-tests       | orphaned tests for deleted files                          |
| F6: an empty directory                   | skill:typescript/ts-new-project      | in an empty directory                                     |
| F7: a package in an existing workspace   | skill:typescript/ts-scaffold-project | adding a new package to an existing workspace or monorepo |
| F8: command grammar and flags            | skill:cli                            | design the command tree                                   |
| F9 vs F8: an interactive setup           | skill:cli                            | Not for interactive setup wizards                         |
| F9: a guided first-run setup             | skill:wizard                         | guide new users through setup                             |
