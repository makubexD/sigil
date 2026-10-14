# 2026-10-14: repo benchmark and catalog code-quality review

The question: what do four public agent-guidance repositories do, and what should sigil's catalog change so
that agents using it write efficient, readable, scalable code without overengineering? The four repos were
read without changes and without assuming any of them is a model to copy:
ECC `v2.2.3`, dotnet/skills (`9de888b8`), agent-skills `v0.6.13` and ponytail `v5.2.0`.

The method ran in this order:

1. A recon agent per repo.
2. Measurement scripts over sigil's catalog.
3. A one-task blind pilot.
4. A first synthesis.
5. A panel review from four roles (principal engineer, senior engineer, AI-agent SME, CTO).
6. A rebuttal round between the roles.
7. A verdict.

The raw material is in [`evidence/`](evidence/). What happened to each item is in [results.md](results.md).

## What each repository is

| Repo          | What it is                                                                | Idea worth taking                                                                                                             | Not worth copying                                                                                           |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ECC           | A multi-harness kit: 311 skills, rules for 21 languages, 71 agents, hooks | Format/typecheck hooks at Stop; a review severity table (block/warn)                                                          | Over 100 skills unrelated to code, the same rule text repeated in skills, universal dogmas ("never mutate") |
| dotnet/skills | .NET domain skills (tests, MSBuild, EF, performance)                      | A skill is kept only if it beats a no-skill baseline (sign test); "USE FOR / DO NOT USE FOR" descriptions; overlay precedence | A very large eval infrastructure; no general design or readability guidance                                 |
| agent-skills  | A spec-to-ship lifecycle plus review and simplification skills            | "Extract on the third use case" and "count the concepts a reader must hold" heuristics; a required verification section       | Skills of about 13 KB each; the same required sections in every skill; CI checks routing only               |
| ponytail      | A 2.6 KB always-on minimal-code rule                                      | A "does it need to exist" ladder; "no case, no finding"; a scale checklist (per-item queries, O(n²), unbounded memory)        | Strong pressure against abstraction; thin tests; a benchmark that measures the thing it optimises (LOC)     |

**Conclusion.** sigil's structure is already ahead of all four:

- one source compiled to several targets;
- families with skeletons checked by `sync --check`;
- path-scoped rules per language.

What the repos offer is content and verification ideas, not architecture. sigil's gaps are in what its rules
say and in proving that they help.

## Measurements

The measurement scripts are in `evidence/tools/`:

- `rule-load.cjs` counts the rule bytes loaded for one source file per language.
- `skill-lint.cjs` counts structural sections in skills and agents.

| Measure                                                                                                                                 | Result                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule bytes loaded with one source file (Claude, path-scoped, every rule of the language installed, inlined bases dropped as `add` does) | TypeScript 39.6 KB · Angular 47.8 · C# 35.8 · React 31.3 · Python 30.8. The first run reported 35–52 KB because it counted `shared/git` and `shared/clean-code` twice; see below |
| Skills whose description or `whenToUse` says when not to use them                                                                       | 19 of 44                                                                                                                                                                         |
| Agents with a "not for" clause in `description`                                                                                         | 0 of 39                                                                                                                                                                          |
| Code reviewers with any design, simplicity or scale check                                                                               | 0 of 5                                                                                                                                                                           |

## Blind pilot (one task, one run per arm)

One agent got sigil's resolved TypeScript rules and another got none. Both implemented the same task:
paginated fetch with retry, per-customer totals, and about 1M orders (`evidence/pilot/task.md`). A third agent
scored the two outputs with their labels removed.

| Axis (0–4)   | With sigil rules | No rules |
| ------------ | ---------------- | -------- |
| Correctness  | 4                | 3        |
| Efficiency   | 4                | 4        |
| Minimalism   | 2                | 3        |
| Readability  | 3                | 4        |
| Structure    | 4                | 3        |
| Tests        | 3                | 3        |
| Source lines | 184              | 106      |

The rules raised rigor: option validation, an exhaustive switch, and documentation on exports. They also
inflated the solution with a logger, an abort signal, a first-page option and policy types that nobody asked
for. The judge preferred the run without rules.

This is one task and one run per arm. It suggests a hypothesis; it does not prove one. The arm with rules also
saw about 45 KB more prompt, so the pilot compares rules against nothing, not good rules against fewer rules.

## Defects confirmed in the catalog

1. **Contradictory duplication doctrine.**
   - `shared/clean-code` says "Duplication is worse than a bad abstraction; over-abstraction is worse than
     mild duplication", and then "extract at three examples".
   - The `code-quality` template says "Duplication is a bug."
2. **A licence to add infrastructure.** The "Legacy code" bullet in `shared/clean-code` says that if the
   project lacks something a rule needs, the agent should "add the smallest correct version of it", with
   a logger as the example. The pilot's unrequested logger matches it.
3. **Reviewer and rule disagree on `catch`.**
   - `ts-code-reviewer` flags a `catch` that only logs; `ts-code-quality` allows "either log with
     context or re-throw".
   - The Angular pair implies the same conflict.
   - The React reviewer has no error-handling item.
4. **No design lens in reviewers.** None of the five `*-code-reviewer` agents asks about unrequested
   surface, single-implementation abstractions, O(n²) work, per-item I/O or unbounded memory.

## Panel and rebuttal

Each role reviewed the first synthesis (`evidence/pass1-draft.md`) and then answered the others' objections
(`evidence/panel/`). Where they agreed and disagreed:

- **All four agreed:**
  - fix the duplication doctrine first;
  - add a design and simplicity lens to the reviewers;
  - measure before changing behaviour-shaping prose;
  - keep `feature` as it is.
- **The SME added the cheapest lever, which nothing in the catalog says today:** "write only what the task asks".
- **The senior engineer added further defects and guards:**
  - the logger licence;
  - unconditional dependency injection;
  - "no hardcoded numeric limits" turning constants into config;
  - coverage-shaped rather than bug-shaped test criteria;
  - no counterweight to "no premature optimization" when the input size is stated.
- **Disagreements, and how they were resolved:**
  - **Overlays:** the CTO first said kill; the owner had put them in scope. The resolution is a decision
    doc plus a spike, with no shipped code.
  - **Red flags:** reviewer families only, not a requirement for every family.
  - **Mechanism for the reviewer lens:** a family section in `standard.yaml`.
  - **Byte budget:** a per-release cap, not a per-edit rule.

## Corrections after the panel

Verifying the panel's proposals against the code changed three conclusions:

- **Narrowing the git rules is rejected.**
  - The panel agreed to narrow the git rules off source files, but its 6.7 KB figure was double-counted.
    `ts-git` already includes `shared/git` through `extends`, and selection drops the standalone base when
    a language git rule is installed (`test/select/selection.test.ts`). So the real cost is about 3.9 KB.
  - Commit and PR guidance has no trigger file, so narrowing would remove its only Claude delivery path.
  - `feature` cannot carry it either, because it is `disableModelInvocation`.
- **The pilot harness also double-counts `shared/clean-code`**, which every `*-code-quality` rule
  inlines. Byte budgets must be set from a corrected script.
- **The reviewer lens goes in a family section, not a template.** `family-skeleton` skips templated
  members, so templating the reviewers would remove the structural check. Red flags for reviewers become
  that section.

## Plan

[results.md](results.md) lists each item with its priority and status:

- **P0 defects ship first, with a test.** They are exempt from the eval gate because they fix
  contradictions, not doctrine.
- **P1 is measured.** Behaviour-shaping changes ship only if a code-quality eval shows less inflation and
  no loss of correctness. The eval follows the `test/evals/` convention: six tasks with hidden tests and a
  declared requested surface, three runs per arm, a paired sign test, two held-out tasks, and hypotheses
  written down before any run.
- **P2 holds the smaller items.**
