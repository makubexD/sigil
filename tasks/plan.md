# Repo benchmark → catalog code-quality: implementation plan

## Status 2026-10-16: Part 1 (PR0–PR9 below) is done. Part 2 is next.

### What Part 1 covered, and what it left out

Part 1 was the code-quality slice of the brief (`_Others/Req.md`). Outcomes:

- P0 doctrine fixes merged (#59).
- The eval harness exists.
- D2 merged.
- PR4, PR5, PR6 and PR7 were dropped by evals.
- PR8 merged unmeasured; B2 is running to measure it.
- PR9 v1 merged (#72).

The brief asks for 14 deliverables. Part 1 produced thin recon notes (about 700 B per repo, no file paths) and a
code-quality gap list. These were never produced:

- repo profiles with cited paths;
- a cross-repo capability inventory and an overlap matrix;
- a per-capability verdict;
- an SDD assessment;
- a language × topic coverage matrix;
- a precedence policy;
- a token strategy;
- a traceability matrix.

Several "ideas worth taking" in `docs/audits/2026-10-14/README.md` never became plan items:

- ECC: format/typecheck hooks at Stop, and a BLOCK/WARN review severity table;
- agent-skills: "count the concepts a reader must hold", and a required verification section;
- ponytail: "no case, no finding";
- dotnet: USE FOR / DO NOT USE FOR on skills (25 of 44 have no negative trigger); a token-size validator.

### Lesson Part 1 carries forward

- Behaviour-shaping prose added to rules mostly had no measurable effect (PR4, PR5, PR6 and PR7 dropped).
- Removing prose did have an effect (D2, p = 0.029).
- So in Part 2, every adopted _prose_ item is eval-gated, the same way as in Part 1.
- Deterministic items (hooks, scripts, validators, conformance rules) and _coverage_ gaps (a missing capability) are
  gated by acceptance tests instead.

### Part 2: the full benchmark, then adopt / copy / strengthen into sigil

Each capability found in the 4 repos gets exactly one verdict against sigil:

| Verdict        | Meaning                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| **have**       | sigil already covers it at the same quality or better; cite the sigil path          |
| **adopt**      | take it close to verbatim; only if the license allows, with attribution             |
| **adapt**      | take the idea, rewritten to sigil's structure (families, lexicon, provider-neutral) |
| **strengthen** | build a stronger version than the source; say what makes it stronger                |
| **reject**     | with a reason                                                                       |

Phases:

1. **R: recon.** 6 read-only agents, writing to the scratchpad:
   - ECC, split into skills, and rules/agents/hooks/commands;
   - dotnet/skills;
   - agent-skills;
   - ponytail;
   - sigil itself, in the same schema.

   Each one produces:
   - a deterministic full listing (path, kind, bytes, description);
   - a deep read of every code-relevant artifact, with a disclosed sampling strategy;
   - a profile (Deliverable A);
   - an inventory in JSONL (category, responsibility, trigger, scope, quality with evidence, quotes with line
     numbers);
   - a LICENSE check.

2. **M: matrix (me).**
   - Merge the inventories into a capability matrix, marking unique, duplicate, complementary, conflicting and
     missing capabilities.
   - Assign a verdict per capability.
   - Build a language × topic coverage matrix for TS, Node, Angular, React, C# and Python.
3. **P: panel.** The 4 roles plus a rebuttal round on the candidate list, as in Part 1.
4. **V: verify.** Check each surviving candidate against sigil's code and catalog, since panel claims are not facts.
5. **D: docs.** One PR, `docs/audits/2026-10-16/`:
   - brief deliverables 1–14, adapted (sigil _is_ the target architecture, so D4 maps the brief's concerns A–E onto
     it);
   - the inventory and the matrix;
   - a traceability matrix;
   - a roadmap with acceptance criteria.

   Also fix the stale PR9 row in `docs/audits/2026-10-14/results.md`.

6. **I: implement.** One PR per roadmap item, under the same standing procedure.
   - New skills, agents or kinds that change the product surface are listed for the user's confirmation first.
   - Fixes, validators and eval-gated prose go ahead directly.

Constraints carried over:

- SDD/`feature` gets an assessment only; its changes are optional and the user decides.
- Publishing and the release are low priority and come last.
- Read-only in the 4 repos; no network.

---

# Part 1 (done)

## Context

The benchmark (recon of 4 repos, a blind pilot, a 4-role panel and a rebuttal round) found that sigil's _structure_
is ahead of ECC, dotnet/skills, agent-skills and ponytail. The problems are in its _content_:

- doctrine that contradicts itself;
- a line that licenses inflation ("add the smallest correct version… (a logger)");
- reviewers with no design, simplicity or scale lens;
- no measurement of whether the rules help.

In the pilot (n=1), sigil's rules produced more rigorous code that was 74% larger, with an unrequested logger, abort
signal and policy types. Goal: rules that produce minimal, readable, scalable code, with proof from an eval.
`feature` stays thin.

**Corrections from verification (2026-10-14):**

- **Git-rule narrowing (G6a) is dropped.** `ts-git` already inlines `shared/git`, so the real cost is about 3.9 KB,
  not 6.7 KB. Commit guidance has no trigger file. `feature` is `disableModelInvocation`, so it can't carry the rule
  either. The audit records this as "rejected after verification".
- **The scratchpad harness double-counts `shared/clean-code` and `shared/git`.** Every byte figure is recomputed in
  PR1 before any budget is set.
- **Reviewer change (G2) uses a heading in `standard.yaml`, not a template.** `family-skeleton` skips templated members.
- **Red flags (G8) fold into G2.** The reviewers' "Design and simplicity" section _is_ the red-flag list. Nothing is
  added to the generator rules.

## Standing procedure (every PR)

- **Branching and commits:**
  - each PR has its own branch;
  - RED is shown first;
  - one commit per task, staged by name;
  - merge before the next branch is cut (snapshot hashes conflict otherwise).
- **Build, record and check:**
  - prose changes → `npm run snapshot:update`, committing `test/fixtures/output-snapshot/` with the change;
  - add a changelog line under `[Unreleased]`;
  - put `npm run rule-load` before/after in the PR body (from PR1 on);
  - `npm run ci:local` green.
- **Merge:** push → PR → green CI → `gh pr merge N --merge`, with the commit trailer `Co-Authored-By: Claude Opus 5.5`.
- **Never committed:** `tasks/`, `.mcp.json`, `_Others/Req.md`.

## Sequence

### PR0 `chore/repo-benchmark-report`: record the evidence (docs only)

- `docs/audits/2026-10-14/README.md`:
  - taxonomy of the 4 repos;
  - the verdict, as amended by the corrections above;
  - panel positions, dissents and rebuttals;
  - the pilot method and its n=1 limit;
  - the double-count correction;
  - the rejected items with their reasons.
- `docs/audits/2026-10-14/results.md`: one row per item with its status.
- `docs/audits/2026-10-14/evidence/`: recon summaries, panel files and pilot outputs copied from the session
  scratchpad, which is lost when the session ends.
- Fix the stale index in `docs/audits/README.md`: add 2026-10-06, 10-12 and 10-14.
- → **GATE A2:** you confirm or trim PR1–PR9.

### PR1 `chore/rule-load-script`: a trustworthy byte measurement

- `scripts/rule-load.cjs`, plus an npm script `rule-load`, outside `ci:local`.
- It reuses `dropInlinedBaseRules` (`src/select/selection.ts`, via `dist-cli`). It does not re-implement selection;
  that is how the double count happened.
- It reports:
  - Claude path-scoped bytes per sample file, for each of the 5 languages;
  - Copilot repo-wide bytes (`**/*` rules land in `copilot-instructions.md`).
- **RED:** `test/rule-load.test.ts` asserts that `shared/git` and `shared/clean-code` are each counted once for
  `src/a/b.ts`. The ported scratchpad logic fails it.
- **Accept when:** the TypeScript git cost reads about 3.9 KB. The real per-language baseline gets recorded in
  `results.md`.

### PR2 `fix/doctrine-contradictions`: P0 defects, exempt from the eval gate

**New guard ("fix the class"):** `test/catalog-doctrine.test.ts`.

- It loads and resolves the catalog through `dist-cli`, so it checks the text agents actually receive.
- It holds two small tables:
  - **RETIRED** `{pattern, why}`: checked against every artifact of every kind.
  - **CANONICAL** `{family, phrase}`: every family member (read via `src/catalog-standard.ts`) must contain the phrase.

Tasks:

- **T1: duplication doctrine (G1).**
  - RED: RETIRED `/duplication is (a bug|worse than)/i`, and CANONICAL code-quality "wrong abstraction costs more than
    duplication".
  - GREEN: rewrite the DRY bullet in `catalog/shared/rules/clean-code.rule.md`: extract on the third copy, only when
    the copies share a reason to change; duplicated _knowledge_ is a bug at the second copy.
  - Delete the DRY line in `catalog/shared/templates/code-quality.template.md`; the heading becomes "KISS / YAGNI".
- **T2: inflation licence (M1).**
  - RED: RETIRED `/add the smallest correct version|\(a logger/i`.
  - GREEN: rewrite the Legacy bullet: "if the project lacks it, say so in your summary; don't add infrastructure the
    task didn't ask for."
- **T3: catch/log conflict (M3).**
  - RED: RETIRED `/either log with context or re-?(throw|raise)/i`, which hits ts, cs and py. Plus CANONICAL "only at a
    top-level boundary" for the code-quality and code-reviewer families.
  - GREEN, in the template:
    - one shared sentence ahead of the error-handling slot: handle, or rethrow with the cause; log-and-continue only
      at a top-level boundary;
    - delete the conflicting sentence from the ts, cs and py slots;
    - align all 5 `*-code-reviewer.agent.md` error items (React gains one).
- **Bytes:** about neutral.

### PR3 `test/code-quality-eval`: the measurement harness (no catalog change)

`test/evals/code-quality/` follows the cli/wizard convention.

| File                     | Contents                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | The protocol                                                                                                                       |
| `scenarios.md`           | Tasks T1–T4 for development; **T5–T6 held out**; R1 = a reviewer scenario seeded with inflation and an O(n²) / per-item I/O defect |
| `surface.json`           | The surface each task asks for (exports, option fields, files)                                                                     |
| `key.md`                 | Hidden checks, plus a judge rubric with 2 axes (readability, minimalism)                                                           |
| `fixture/`               | Node 22 ESM TypeScript project with no dependencies                                                                                |
| `fixture-hidden/<task>/` | Hidden tests                                                                                                                       |
| `measure.mjs`            | Measurement script (below)                                                                                                         |
| `results.md`             | Hypotheses **written down before any run**, then dated rows: arm SHA, model id                                                     |
| `runs/*.jsonl`           | Raw run records                                                                                                                    |
| `coverage.md`            | Phrases that `evals:check` verifies                                                                                                |

`measure.mjs`:

- `run <dir> --task Tn` records:
  - hidden tests passed and failed;
  - LOC, not counting tests;
  - **inflation**: exported symbols, option properties and files beyond `surface.json`, counted with the TypeScript
    compiler API.
- `compare a.jsonl b.jsonl` pairs runs by (task, run) and reports wins/losses/ties plus an exact one-sided sign-test p.

`scripts/check-skill-evals.mjs`: an eval folder made only of `rule:`/`agent:` coverage rows is valid without a catalog
skill. `rule:<id>` reads the _resolved_ body.

- RED: `npm run evals:check` fails with "no catalog skill 'code-quality'".

How a run works:

- `git worktree` at the arm's SHA, then build.
- A fresh temp copy of the fixture.
- Install rules with `dist-cli/cli.js add` (the TypeScript pack for Claude; arm "none" installs nothing).
- Run `claude -p` headless, with the same model for every arm.
- Run `measure.mjs`.
- A blind judge from a different model scores the pair. It is reported, never a gate.

**Baseline B0:** arms "none" and "current" at master after PR2, 3 runs × 6 tasks = 36 runs, done before PR4 merges.
An optional v0 arm (before P0, 18 runs) tests whether PR2 alone removed the logger.

### P1: eval-gated

Each candidate is 18 runs. Preregistered acceptance:

- hidden tests: candidate ≥ baseline, and no regression on T5–T6;
- inflation: one-sided sign test, p ≤ 0.05;
- `rule-load` for TypeScript does not grow against B0.

If fewer than 10 of the 18 pairs differ, there is no measurable problem → **drop the item**. The merged candidate
becomes the next baseline.

- **PR4 `feat/scope-to-request`** (G3 + SME M2): the template's SEARCH FIRST block becomes a ladder:
  write only what the task asks → does it need to exist → stdlib → installed dependency → codebase ≥80% → smallest
  new version. Drop "ask before proceeding".
  - RED: a coverage row `rule:typescript/ts-code-quality | write only what the task asks`.
- **PR5 `feat/code-quality-guards`** (G4, G5 + senior M2/M4/M7): template prose ahead of the slots:
  - patterns only when a second variant exists today;
  - size limits are review signals, not gates; split by responsibility;
  - inject dependencies only at I/O boundaries;
  - per-environment config vs fixed constants;
  - a data structure chosen for a stated scale is not premature optimization.
  - Trim the generic Strategy/Factory sentence from the 5 `design-patterns` slots; those bytes pay for PR4 and PR5.
  - RED: RETIRED `/before proceeding/`, plus a coverage row per guard.
- **PR6 `feat/reviewer-design-simplicity`** (G2 + G8 for reviewers + M5):
  - add "Design and simplicity" to the code-reviewer family `sections` in `catalog/standard.yaml`
    (after "Review dimensions");
  - RED: `sync --check` shows family-skeleton errors on all 5 members;
  - GREEN: a section written in each language's own idiom:
    - unrequested surface;
    - an abstraction with one implementation;
    - O(n²) / per-item I/O / unbounded memory;
    - names that need a comment;
    - bug-shaped test criteria (empty, one or many inputs; failure path; ties).
  - Gate: on R1, the candidate finds ≥ baseline+2 of the seeded items, with no invented findings.

### P2

- **PR7 `feat/agent-negative-triggers`** (G7): a `description-collision` conformance rule (warning) within agent
  families (RED first), then "Not for…" clauses inside each agent's `description`.
- **PR8 `chore/clean-code-debt-naming`** (G10 + M6): add two `clean-code` lines:
  - a `shortcut:` debt marker;
  - domain-role names, predicate booleans, units in names.

  Report the bytes, since `clean-code` is repo-wide on Copilot. Measure these in the next candidate run.

- **PR9 `docs/consumer-overlays`** (G11, in scope): `docs/decisions/consumer-overlays-2026-10.md`.
  - **Model:** an overlay is a manifest-recorded consumer fragment, reapplied at the target write layer with the
    `replaceMerge` pattern. The 4-stage pipeline is untouched, and the overlay is never read via `PKG_ROOT`.
  - **Drift and precedence:** hashes are taken after the overlay. Precedence: user > project > overlay > defaults.
    An overlay may narrow, never widen.
  - **Cost:** it touches update, uninstall and prune. The CTO's "kill" is recorded as dissent.
  - **Spike** (one day, not merged): Claude scaffold, rule `paths` narrowing. It answers:
    - how to check that an overlay is a subset;
    - how it is recorded in the manifest;
    - does `update` reapply it;
    - is the overlaid file `intact`;
    - LOC.
  - The findings, plus a go/no-go, are appended to the doc.

### Last (per standing rules)

WIZ-3 live check (you), an optional G6a live probe only if the byte budget proves impossible, then the npm release.

## Killed or left alone

- **Killed:**
  - blanket red-flags sections;
  - a core/on-demand split inside a rule (it would need a new kind);
  - G6a narrowing (see the corrections above).
- **Left as is:** `feature`.

## Risks

- **The byte budget may only close through the PR5 slot trims.** If it doesn't, ask for an explicit +x% budget
  rather than letting it grow quietly.
- **The model changes between runs.** Record the model id and re-run B0 if it changes.
- **After PR2, "current" may already show little inflation.** The ≥10-pair rule then drops P1 items, which is intended.
- **Eval cost:** 36 runs for B0 plus 18 per candidate, as headless runs. That's about 90 runs for P1 in total.

## Verification

- `npm run ci:local` is green on every PR.
- `test/catalog-doctrine.test.ts` guards retired phrases across all artifacts.
- `family-skeleton` enforces the reviewer section.
- `npm run rule-load` reports before/after bytes.
- `test/evals/code-quality/results.md` holds the preregistered hypotheses and the B0 and candidate rows, with sign-test
  p-values.
- Each P1 merge cites its row.
