# Results

## Hypotheses (registered 2026-10-14, before any run)

From the benchmark pilot (docs/audits/2026-10-14, n=1): with sigil's TypeScript rules the code was
more rigorous but larger, with unrequested options and types.

- **H1 (B0)**: the current rules inflate. Over 18 paired runs, `current` has more inflation than
  `none` (one-sided sign test, p ≤ 0.05), with hidden-test correctness at least equal.
- **H2 (PR4, scope to request)**: a "write only what the task asks" ladder reduces inflation against
  `current` (p ≤ 0.05) without losing correctness, held-out tasks included.
- **H3 (PR5, guards)**: guards on patterns, size limits, injection, config and scale reduce
  inflation further against the PR4 baseline, under the same acceptance.
- **H4 (PR6, reviewer)**: with the "Design and simplicity" section, the reviewer finds at least
  baseline + 2 of R1's 7 seeded defects, with none invented.

If H1 is false (no measurable inflation in `current`), PR4 and PR5 have nothing to fix and are
dropped, unless correctness is the gap.

## Runs

| Date | Comparison | Commits | Model | Result |
| ---- | ---------- | ------- | ----- | ------ |
