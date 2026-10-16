# Coverage: dispatch doctrine → delivered description

The dispatch probe measures how a model picks an agent from its `description`. Each row names the
phrase that separates one agent from its neighbours in `prompts.json`. An `agent:<id>` row reads the
agent as it ships: title, description and resolved body. `scripts/check-skill-evals.mjs` fails when
a phrase disappears, so a description edit that would invalidate a recorded probe is visible.

| doctrine                                  | file                                      | phrase                                        |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Generic reviewer defers to a language one | agent:code-reviewer                       | prefer that one                               |
| Per-change review, not a codebase sweep   | agent:typescript/ts-code-reviewer         | per-change generalist gate                    |
| Whole-codebase security sweep             | agent:typescript/ts-security-auditor      | codebase-wide security audit                  |
| Module structure, not single bugs         | agent:typescript/ts-architecture-reviewer | structural and design-level health            |
| Runtime cost                              | agent:typescript/ts-performance-profiler  | performance anti-patterns                     |
| Behaviour-changing fix from a symptom     | agent:typescript/ts-debugger              | does not do behavior-preserving restructuring |
| Behaviour-preserving restructuring        | agent:typescript/ts-refactor-specialist   | never changes observable behavior             |
| Downstream breakage                       | agent:typescript/ts-api-compat-reviewer   | will break downstream consumers               |
