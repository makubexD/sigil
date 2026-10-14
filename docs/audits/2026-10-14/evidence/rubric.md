# Benchmark rubric (fixed 2026-10-14, before scoring)

The rubric scores catalog artifacts (skill, rule or agent) on how well they lead an agent to the goal code.
Each criterion is scored 0–4, then multiplied by its weight. Items are scored blind: they are labeled A/B/C/D,
and their repo names are removed.

| # | Criterion | Weight | 4 = | 0 = |
|---|---|---|---|---|
| C1 | Code-quality leverage | 25 | Concrete, checkable guidance (do/don't pairs, thresholds) that changes the code produced | Platitudes ("write clean code") |
| C2 | Efficiency and minimalism | 15 | Pushes the smallest correct solution and names overengineering explicitly | Silent on it, or invites abstraction |
| C3 | Scalability and structure | 15 | Boundaries, layering, dependency direction, growth paths | None |
| C4 | Readability | 10 | Naming, size limits, intent, and comments that explain why | None |
| C5 | Triggering precision | 10 | Clear when to use / when not to use, and names its neighbors | Vague or overlapping |
| C6 | Context cost | 10 | Small always-loaded footprint, with depth loaded on demand | Large text loaded always or per file |
| C7 | Enforceability | 10 | A verification step or checklist, backed by a lint, test or eval | Nothing checkable |
| C8 | Maintainability of the artifact | 5 | One source of truth, no duplication, consistent skeleton | Duplicated or contradictory |

Score bands: ≥80 strong · 60–79 adequate · <60 weak.
Rules: a claim needs a file path. "No case, no finding" applies to defects. When two scores differ by more
than 1 point on a criterion, the difference is recorded rather than averaged away.
