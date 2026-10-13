# 2026-10-13: pre-release audit of `master`

The release gate from `tasks/todo.md`: a fresh full audit of `master` after PRs #49-#52, the first since
the 2026-10-07 eval run (`944b534`). The scope is everything merged since then, 7 commits across 36 files.
The main surface is `prune` (it now removes inlined copies), the new VS Code MCP warning in `add`, and
`update`'s notice about inlined copies.

## Lanes

| Lane                         | What it checked                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| `cli-auditor`                | `node dist-cli/cli.js` against the cli skill, focused on prune/add/update |
| `wizard-auditor`             | The guided verbs and the home menu, focused on `prune-guided`             |
| `agent-skills:code-reviewer` | Five-axis review of `git diff 944b534..master -- src test`                |
| Skill evals S1 and W3        | The built `cli` and `wizard` skills against their fixtures and keys       |

Baseline `npm run ci:local` on `master` was green before the audit started. Findings, evidence and
what happened to each are in [results.md](results.md).
