# Results

Each item from the [README](README.md) verdict and what happened to it. Status values:

- **planned**: not started.
- **merged (#PR)**: shipped.
- **dropped**: an eval showed no measurable effect.
- **rejected**: verification disproved the case for it.

| Item   | What                                                                                                                      | Priority | Gate                 | Status                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- | --------------------------------------------------------------------------------- |
| PR1    | `scripts/rule-load.cjs`: per-language rule bytes with inlined bases dropped (fixes the double count)                      | tooling  | test                 | planned                                                                           |
| PR2 T1 | One duplication doctrine in `shared/clean-code`; delete "Duplication is a bug" from the template                          | P0       | doctrine test        | planned                                                                           |
| PR2 T2 | Remove the "add the smallest correct version (a logger)" licence                                                          | P0       | doctrine test        | planned                                                                           |
| PR2 T3 | Align catch/log between `*-code-quality` and `*-code-reviewer`; React reviewer gains an error item                        | P0       | doctrine test        | planned                                                                           |
| PR3    | Code-quality eval in `test/evals/code-quality/`, plus baseline B0                                                         | P1       | evals:check          | planned                                                                           |
| PR4    | "Write only what the task asks" plus a does-it-need-to-exist ladder in the template                                       | P1       | eval                 | planned                                                                           |
| PR5    | Guards: patterns need a second variant, size limits are signals, DI only at I/O, config vs constants, scale counterweight | P1       | eval                 | planned                                                                           |
| PR6    | "Design and simplicity" section in the code-reviewer family                                                               | P1       | reviewer scenario R1 | planned                                                                           |
| PR7    | Agent negative triggers in `description`, plus a description-collision check                                              | P2       | conformance          | planned                                                                           |
| PR8    | Debt marker and naming lines in `clean-code`                                                                              | P2       | next eval run        | planned                                                                           |
| PR9    | Consumer overlays: decision doc plus a one-day spike (not merged)                                                         | P2       | go/no-go in doc      | planned                                                                           |
| G6a    | Narrow git rules off source files                                                                                         | -        | -                    | rejected: double-counted bytes; no other Claude delivery path for commit guidance |
| G8     | Red Flags section in every family                                                                                         | -        | -                    | rejected: folded into PR6 for reviewers only                                      |
| G12    | Changes to `feature`                                                                                                      | -        | -                    | left as is                                                                        |

Per-language rule load at this audit (bytes for one source file, before any change):
TypeScript 39.6 KB, Angular 47.8 KB, C# 35.8 KB, React 31.3 KB, Python 30.8 KB.
