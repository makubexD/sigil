# 2026-10-12: does Copilot deliver a skill's rule twice?

The "double rule delivery" probe from `tasks/todo.md` (SPEC-skill-anatomy.md, Probe row). sigil's
Copilot target inlines a skill's `uses.rules` bodies into `SKILL.md` and also writes each rule as
`.github/instructions/<rule>.instructions.md` with `applyTo`. This probe checks whether the model
gets both copies. Each copy carries its own codeword:

| Codeword    | Copy                                               |
| ----------- | -------------------------------------------------- |
| COBALT-3318 | inlined in `.github/skills/probe-rules/SKILL.md`   |
| MAPLE-7741  | `.github/instructions/probe-style.instructions.md` |

`src/app.ts` exists so the `**/*.ts` glob has a file to match.

## Run it

- **Copilot CLI:** copy `probe/` **outside any git repo** (the CLI reads workspace files from the git
  root), `git init` it, and run `copilot -p "What are the probe rule codewords?"`. Count only the
  codewords returned without a `view`/`grep` call (`--output-format json` shows the calls).
  To test a broad glob, change `applyTo` to `"**"`.
- **VS Code:** open `probe/` as its own workspace, open `src/app.ts`, then in Copilot Chat
  **Ask** mode send `What are the probe rule codewords?`

## What the result decides

- **Both codewords:** the rule arrives twice. Fix it centrally in the Copilot spec: either stop inlining
  rules that also ship as `.instructions.md`, or stop writing the file for skill-only rules.
- **COBALT only:** the skill copy is the only delivery; nothing to change.
