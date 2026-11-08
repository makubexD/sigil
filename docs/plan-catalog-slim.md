# Plan: slim the Python catalog from real use

Step 3 of `docs/plan-real-usage.md`, run early on the only real install (`MakuVisaApptScheduler`, Nov 5 to 8: 6 sessions,
51 worker runs). Each step links its `real-usage` issue. The consumer-side cleanup is already in MakuVisaApptScheduler
PR #2.

## Facts

- 7 Python rules match `**/*.py` and load about 7.5k tokens on the first Python read, then again after each compaction:
  19 loads each, about 142k tokens over 6 sessions.
- `py-git` is one of them (1.15k tokens), and its rendered body repeats "No Secrets in History" (`shared/git` through
  `extends`, plus its own). `react-git` repeats it too.
- Skills `py-document`, `py-generate-tests`, `py-sync-tests` and `feature`: 0 uses. Older repo commands with the same jobs
  sat next to them.
- Agents: `py-architecture-reviewer` used once; `py-code-reviewer` 0 times, while the global `agent-skills:code-reviewer` ran
  6 reviews.

## Step 1: py-git and react-git scope and duplicate section `[worker]` (#209)

Files: `catalog/languages/python/rules/py-git.rule.md`, `catalog/languages/react/rules/react-git.rule.md`,
`scripts/rule-load-baseline.json`.
Change: set `py-git`'s `appliesTo` to `["**/.gitignore"]` only. Delete the `## No Secrets in History` section from both
language rules, keeping the one in `catalog/shared/rules/git.rule.md`. Check the other `*-git.rule.md` files for the same
repeat and remove it there too. Then `npm run build && npm run rule-load -- --baseline "py-git scope, duplicate section"`.
Test: `npm run build && npm run validate && npm run rule-load` shows python lower than before; the rendered `py-git` has
one "No Secrets in History" (`node dist-cli/cli.js get python/py-git | grep -c 'No Secrets in History'` prints 1).

## Step 2: validate flags a repeated H2 after extends `[worker]` (#209)

Files: `src/validate/index.ts` (or a new `src/validate/heading-checks.ts`), a new `test/validate/heading-checks.test.ts`.
Change: for each rule, flatten its `extends` chain the way `src/resolve.ts` does, and report an error naming the rule and
the heading when the same `## ` heading appears twice in the result.
Test: `npm run test:built -- heading-checks`. Cases: a child repeating a parent's H2 is an error naming both; distinct
headings pass; the real catalog passes after step 1.

## Step 3: cut the always-on Python rules to about 3k tokens `[inline: judgment on what to cut]` (#210)

Files: `catalog/languages/python/rules/py-async.rule.md`, `py-code-quality.rule.md`, `py-conventions.rule.md`,
`py-documentation.rule.md`, `py-logging.rule.md`, `py-security.rule.md`, `py-project-layout.rule.md`, `py-testing.rule.md`,
`scripts/rule-load-baseline.json`.
Change: keep the specific, checkable rules (each one a thing a reviewer could point at in a diff); drop general material
the model already knows (SOLID, KISS/YAGNI explanations, long examples). Target: everything that loads on a plain `.py`
file (`rule-load` python: the seven `**/*.py` rules plus `shared/orchestration`) at or under 12 KB rendered, from 27.8 KB;
`py-testing` cut by the same bar. Amended Nov 8: the first draft listed only five rules, but `py-security`,
`py-project-layout` and `shared/orchestration` alone are 8.7 KB of the load, so 12 KB needs them too.
Test: `npm run build && npm run rule-load` shows python at or under 12 KB; `npm run validate`; `npm run evals:check`.

## Step 4: py-packaging only in a library pack `[worker]` (#211)

Files: `packs.yaml`, `catalog/README.md`.
Change: add a `python-library` pack holding `python/py-packaging` (and anything else only libraries need), and exclude
`py-packaging` from `python-tooling` (use the pack's existing exclude mechanism, or list artifacts if it has none).
Test: `npm run build && node dist-cli/cli.js add pack:python-tooling --target claude --dry-run --yes --project-dir "$(mktemp -d)"`
lists no `python-py-packaging`; the same with `pack:python-library` lists it; `npm run validate`.

## Step 5: warn when a skill overlaps an existing command `[worker]` (#212)

Files: `src/commands/add/co-install.ts` (next to `warnMissingPreloads`), `test/commands/add-overlaps.test.ts`.
Change: after planning, for each skill being installed for Claude, strip the language prefix (`py-`, `ts-`, …) and warn
when `.claude/commands/<rest>.md` or `.claude/skills/<rest>/` already exists in the project:
`⚠  <skill id> overlaps .claude/commands/<rest>.md; keep one.` Warn only, never block.
Test: `npm run test:built -- add-overlaps`. Cases: existing `commands/generate-tests.md` with `py-generate-tests` warns;
no such file, no warning; an existing `skills/sync-tests/` with `py-sync-tests` warns.

## Step 6: prefer the pack's reviewer `[inline: user-facing copy]` (#213)

Files: `catalog/languages/python/rules/py-conventions.rule.md`, the matching TypeScript and React conventions rules.
Change: one closing line: for code review in this repo, use the installed `<lang>-code-reviewer` agent rather than a
general-purpose reviewer. Measure its token cost in `rule-load`.
Test: `npm run build && npm run validate && npm run rule-load`.

## Step 7: reinstall in MakuVisaApptScheduler and keep measuring `[inline: judgment]`

After the PR merges, `sigil update` in MakuVisaApptScheduler for Claude and Copilot. Through about Nov 18, rerun the usage
count (rule loads and tokens per session, agent and skill uses) and record it here, then close or update the issues.
