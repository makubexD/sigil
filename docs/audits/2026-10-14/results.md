# Results

Each item from the [README](README.md) verdict and what happened to it. Status values:

- **planned**: not started.
- **merged (#PR)**: shipped.
- **dropped**: an eval showed no measurable effect.
- **rejected**: verification disproved the case for it.

| Item   | What                                                                                                                      | Priority | Gate                 | Status                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PR1    | `scripts/rule-load.cjs`: per-language rule bytes with inlined bases dropped (fixes the double count)                      | tooling  | test                 | merged (#58)                                                                                                                |
| PR2 T1 | One duplication doctrine in `shared/clean-code`; delete "Duplication is a bug" from the template                          | P0       | doctrine test        | merged (#59)                                                                                                                |
| PR2 T2 | Remove the "add the smallest correct version (a logger)" licence                                                          | P0       | doctrine test        | merged (#59)                                                                                                                |
| PR2 T3 | Align catch/log between `*-code-quality` and `*-code-reviewer`; React reviewer gains an error item                        | P0       | doctrine test        | merged (#59)                                                                                                                |
| PR3    | Code-quality eval in `test/evals/code-quality/`, plus baseline B0                                                         | P1       | evals:check          | merged (#60); B0 found no surface inflation, so rounds 2-5 measure top-level declarations                                   |
| PR4    | "Write only what the task asks" plus a does-it-need-to-exist ladder in the template                                       | P1       | eval                 | dropped: 8 decided pairs, p = 0.363 (round 2)                                                                               |
| PR5    | Guards: patterns need a second variant, size limits are signals, DI only at I/O, config vs constants, scale counterweight | P1       | eval                 | dropped: 10 decided pairs, p = 0.377 (round 2)                                                                              |
| PR6    | "Design and simplicity" section in the code-reviewer family                                                               | P1       | reviewer scenario R1 | dropped: R1 found +1 seeded defect, the gate was +2 (#66)                                                                   |
| PR7    | Agent negative triggers in `description`, plus a description-collision check                                              | P2       | conformance          | dropped: dispatch probe D0 picked the expected agent in 24 of 24 runs, so no collision to fix (`test/evals/agent-dispatch`) |
| PR8    | Debt marker and naming lines in `clean-code`                                                                              | P2       | next eval run        | merged (#69); not yet measured by an eval run                                                                               |
| PR9    | Consumer overlays: decision doc plus a one-day spike (not merged)                                                         | P2       | go/no-go in doc      | merged (#63): spike says go; the v1 implementation is not built                                                             |
| D2     | No prose that tells agents when to split a function; only the God Object threshold stays (found by ablation, rounds 3-5)  | P1       | eval                 | merged (#68): declarations 161 → 120, p = 0.0287, correctness held                                                          |
| G6a    | Narrow git rules off source files                                                                                         | -        | -                    | rejected: double-counted bytes; no other Claude delivery path for commit guidance                                           |
| G8     | Red Flags section in every family                                                                                         | -        | -                    | rejected: folded into PR6 for reviewers only                                                                                |
| G12    | Changes to `feature`                                                                                                      | -        | -                    | left as is                                                                                                                  |

Per-language rule load at this audit (bytes for one source file, before any change):
TypeScript 39.6 KB, Angular 47.8 KB, C# 35.8 KB, React 31.3 KB, Python 30.8 KB.

After #69 (bytes): TypeScript 40,865, Angular 49,248, C# 36,990, React 32,328, Python 31,781.
