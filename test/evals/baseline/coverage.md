# Coverage: what the baseline harness assumes of the catalog

`npm run evals:check` fails when a phrase below leaves its artifact, so the example request file and
the selftest's stub cannot drift from the skill they install.

| Item                                    | file                           | phrase                                         |
| --------------------------------------- | ------------------------------ | ---------------------------------------------- |
| The example artifact is a testing skill | skill:python/py-generate-tests | unit and integration tests in a Python project |
