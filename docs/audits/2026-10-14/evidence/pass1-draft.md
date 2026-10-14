# Pass 1: my synthesis (draft for panel review)

## What each repo is (categorized)
| Repo | Core identity | Main code-quality lever | Main weakness |
|---|---|---|---|
| ECC | A harness "OS": 311 skills, 21 rule languages, hooks | Common + per-language rule layering; runtime hooks (format/typecheck at Stop) | Bloat (100+ skills unrelated to code), duplication, universal dogmas |
| dotnet/skills | Curated .NET domain skills (tests, MSBuild, EF, perf) | Evidence gate: a skill must beat a no-skill baseline (sign test); USE FOR / DO NOT USE FOR descriptions; overlays | No general design or readability skill; heavy process for contributors |
| agent-skills | Process lifecycle (spec → ship) + review/simplify | Required sections (Rationalizations / Red Flags / Verification), checked by lint | No language idioms; ~13 KB skills; routing eval only |
| ponytail | Minimal-code behaviour prompt | 2.6 KB always-on ladder; "no case, no finding"; `shortcut:` debt marker | Pushes too little abstraction; thin tests; its benchmark measures what it optimises |
| **sigil** | A single source that compiles to many targets: families/skeletons, path-scoped rules for 5 languages | The strongest *language-specific* design content (SOLID, size limits, layering, coupling, error chains) | See the gaps below |

Conclusion: none of the four is a model for the *structure* sigil needs. Sigil already leads on structure
(single source, families, `sync --check`). Each repo offers **content ideas and verification ideas**,
not architecture.

## Sigil gaps, by code-quality category (evidence)
| # | Gap | Evidence | Class |
|---|---|---|---|
| G1 | **Contradiction about duplication.** clean-code: "Duplication is worse than a bad abstraction; over-abstraction is worse than mild duplication. Extract at three examples." The template says "DRY: Duplication is a bug." | `shared/rules/clean-code.rule.md`, `shared/templates/code-quality.template.md` | defect |
| G2 | **The reviewers have no design / simplicity / scale dimension.** `ts-code-reviewer` checks correctness, errors, security, types, conventions, tests and contract. It never asks about overengineering, N+1, O(n²), unbounded growth or readability. | `languages/typescript/agents/ts-code-reviewer.agent.md:59-95` (and its siblings in the same family) | defect |
| G3 | **Search-first is incomplete.** It covers only "reuse from the codebase (80% overlap)". It never asks "does this need to exist?", and has no stdlib or installed-dependency rungs. | template § SEARCH FIRST | improvement |
| G4 | **The design-pattern slot invites abstraction** ("Use Strategy…, Factory…, Builder…") with no "only when a second variant exists" guard. That pulls against YAGNI. | `ts-code-quality` slot `design-patterns` (and siblings) | improvement |
| G5 | **Size limits are absolute** ("split before proceeding"). They lack the guard "split by responsibility, never only by line count / never into helpers that exist only to shorten". | `structure-limits` slot | trade-off |
| G6 | **Per-file rule load of 35–52 KB (≈9–13k tokens)** for every touched source file. Much of it is reference material (npm, project-layout, git, documentation) that only matters during specific tasks. | harness `rule-load.cjs` | improvement (measure first) |
| G7 | **No negative trigger on any of the 39 agents.** 25 of the 44 skills have none either. | harness `skill-lint.cjs` | improvement |
| G8 | **No red-flags section anywhere, and verification steps in fewer than half.** | harness `skill-lint.cjs` | improvement (family skeleton) |
| G9 | **No evidence that the rules change the output.** Evals exist for cli/wizard only. | `tasks/todo.md` phase 1 | improvement (pilot) |
| G10 | **No convention for deliberate debt** (a `shortcut:`-style marker) and no way to collect such debt. | absent | improvement (small) |
| G11 | **Overlays.** There is no way for a consumer project to narrow a skill's defaults without forking it. | dotnet `OVERLAYS.md` | trade-off (design only) |
| G12 | **`feature` (SDD).** It works well; only small gains are worth having, e.g. a "stop after spec" gate. | user's instruction | leave / tiny |

## Draft implementation list (to be challenged)
- P0: fix G1 (one duplication doctrine); add design/simplicity/scale dimensions to every `*-code-reviewer` (G2).
- P1: turn search-first into a ladder (G3); guard the patterns slot (G4) and the size limits (G5); split
  rules into always-on core and on-demand references (G6); add "when not to use" + "red flags" to
  `standard.yaml` (G7/G8).
- P2: baseline eval pilot harness (G9); debt marker convention (G10); overlay design doc (G11).

## Baseline pilot (n=1 task, 1 run per arm; this is a signal, not proof)
Arm X ran with sigil's TS rules (44.9 KB loaded); arm Y ran with none. A blind judge scored them; the key was revealed only after scoring.
| Axis | X (sigil) | Y (none) |
|---|---|---|
| Correctness | 4 | 3 |
| Efficiency | 4 | 4 |
| Minimalism | 2 | 3 |
| Readability | 3 | 4 |
| Structure | 4 | 3 |
| Tests | 3 | 3 |
| LOC (src) | 184 | 106 |
- X added things nobody asked for (logger, abort signal, firstPage, a RetryPolicy type). Its gains were option validation and an exhaustive switch.
- The judge would merge Y, with a one-line guard added.
- Reading: the rules raise rigor (fail fast, types, docs) but also inflate the solution. That fits G3/G4: no "does it need to exist" rung, while the pattern/DI slots invite extra surface.
- Next: a real pilot needs ≥5 tasks × ≥3 runs, a sign test, and an arm with a trimmed rule set.
