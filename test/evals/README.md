# Skill evals

Behavioral evals for the `cli` and `wizard` catalog skills, moved here from `_Others/cli-skill` and
`_Others/wizard-skill`. Nothing here is compiled or run by `npm test`, and `test/` is not published.

| Folder    | Contents                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cli/`    | `scenarios.md` (S1–S7), `key.md` (answer key; `fixture/shipit.mjs` has 12 planted defects), `results.md`, `coverage.md`    |
| `wizard/` | `scenarios.md` (W1–W6), `key.md` (`fixture-flawed/` has 11 planted defects), `results.md`, `coverage.md`, clean `fixture/` |

## Mechanical check (CI)

`npm run evals:check` runs `scripts/check-skill-evals.mjs` over every folder here. It reads the skill
as it ships (SKILL.md, `references/`, and each language's stack part as `references/stack-<stack>.md`)
and checks that no harness tool names appear, the size caps hold, relative links resolve, and every
`coverage.md` phrase is still in its file. It needs a current `dist-cli/` and is part of `ci:local`.

## Scenario runs (manual, before a release that changes either skill)

The scenarios need a model, so CI does not run them. For each run:

1. `npm run catalog:build`, then use `dist/claude/plugins/cli-builder/skills/<skill>` as `<SKILL>`
   (the built folder has the stack references; the catalog source folder does not).
2. Copy the fixture into a fresh directory as `<DIR>` and give a fresh agent the scenario prompt.
3. Grade the answer with `key.md`; never show the agent the key. Add a dated row to `results.md`.

Pass bars: S1 at least 10 of 12 defects, W3 at least 9 of 11, none invented.

S6 and W5 (adopt) are retired: the catalog skills have no adopt mode. `results.md` keeps their
history and the old paths (`stacks/*.md`, `adapters/`), which predate the catalog layout.

## Later

Port the scenarios to the `claude plugin eval` format (`case.yaml` or `prompt.md` plus `graders/*.md`
written from `key.md`) for scored runs against a no-plugin baseline.
