# SPEC: one artifact anatomy, as data

Status: proposed, waiting for the owner's go. Evidence: 4 research agents plus an adversarial
review (2026-10-06).

## The question

Browsing `catalog/` does not read as one standard. `shared/skills/cli` has `SKILL.md` plus 12
reference files, while `languages/angular/skills/ng-add-package` is `SKILL.md` only.

## What the evidence says

- **Both shapes are correct.** Every official source (agentskills.io spec, Anthropic's skill
  best practices, Claude Code, VS Code/Copilot, Cursor) says only `SKILL.md` is required.
  `references/` is recommended when a skill passes about 500 lines, or when it holds variants that
  are used one at a time (one file per framework or stack, read one).
  - Inlined, `cli` and `wizard` would be 1134 and 1267 lines.
  - Each run reads one of their five stack files.
- **What is missing:**
  1. The anatomy is not written anywhere a person browsing would see it.
  2. The rule is not data and is not checked.
     - Three language skills carry references by accident: `py-generate-tests`,
       `react-generate-tests` and `ts-scaffold-project`.
     - The root cause is that Python and React `generate-tests` load `*-conventions`, where their
       siblings load `*-testing`.
     - The shared artifacts (`cli`/`wizard` and their auditors and rules) are in no family.
  3. Reference files are copied byte for byte (`src/targets/emit-files.ts:44-46`).
     - They skip the per-AI lexicon.
     - They are not covered by `provider-term-leak`, `platform-path-leak`, `provider-limits` or the
       trust scan.
     - There are 0 leaks today, but nothing prevents one.
  4. Copilot `add` delivers each `uses` rule twice: inlined in `SKILL.md`, and as `.instructions.md`.

## Decision

**One anatomy per kind, declared in `catalog/standard.yaml`. Shape varies only where the data says
why.**

- **Skill** = `<name>/SKILL.md` plus an optional flat `references/`.
  - A reference is allowed only when its family declares it, by role:
    - `stack`: one `stack-<id>.md` per declared stack, each with the family's stack-file
      skeleton;
    - `core`: named files;
    - `brief`: an agent hand-off, paired with its agent;
    - `examples`.
  - A family that declares no role is `SKILL.md`-only.
- **Agents, rules, prompts and config kinds** are single files, `<id>.<kind>.md`.
- **Families:**
  - The shared pairs get families: `cli`/`wizard`, their auditors, and their rules.
  - Base rules (`shared/clean-code`, `shared/git`) are declared as bases, not families.
- **Within a family:**
  - members set exactly the family's frontmatter keys;
  - members load the matching rules (`uses` parity);
  - titles follow one pattern.
- **Recorded, not changed:**
  - Every stack file ships, because the task picks the CLI's stack, which can differ from the
    repo's language.
  - `cli`/`wizard` stay shared: 66–68% of each is language-neutral, and Go and Rust have no
    namespace.

## Plan

| PR    | Pri   | What                                                                                                                                      | Output for users                                         |
| ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1     | P0    | References go through the lexicon in `emitFile`. Leak, limit and trust checks cover references. Class fix, all three targets.             | Byte-identical                                           |
| 2     | P0    | Data and checks, plus the generated `catalog/README.md` (listed below).                                                                   | Unchanged (author-only)                                  |
| 3     | P0/P1 | One content release (listed below).                                                                                                       | One "update available" wave; edited files stay protected |
| Probe | P1    | Copilot double rule delivery: a short live probe in the owner's Copilot session (with V1 and F4), then a central fix in the Copilot spec. | Per the probe                                            |

**PR 2 changes:**

- In `standard.yaml`: reference roles per family, families for the shared pairs, exact `keys`, and
  `uses` parity.
- New checks:
  - the reference set;
  - stack coverage;
  - the stack-file skeleton;
  - the title pattern;
  - the brief↔agent pairing.
- A `catalog/README.md` anatomy page, generated from `standard.yaml`. CI fails when it is stale.

**PR 3 changes:**

- Python and React `generate-tests` load `*-testing`, and their references fold into that rule:
  deduplicated, no text lost.
- `ts-scaffold-project`'s templates move inline.
- A test proves `update` removes the old references.
- The `cli` stack files move onto one skeleton.
- Titles:
  - "New Project (X)" vs "Add Project (X)";
  - the "(Language)" suffixes;
  - a shared form for artifacts with no language.
- The report block is added to Angular and C# `generate-tests`.
- `ng-release` gets the API-compat step.
- `skillContext: fork` is decided per skill on its merits.

**Cut** (churn with no value; each one rewrites installed files):

- step-heading renumbering (the skeleton check already ignores it);
- moving H1s;
- frontmatter key order;
- a trailing-period rule;
- single-member families for base rules.

## Guards

- `family-skeleton` and `catalog-layout` grow; `validateCatalog` is unchanged.
- Output snapshot with the removal guard.
- Frozen install and every-pack smoke tests stay green.
- CI timings are compared after each merge.
