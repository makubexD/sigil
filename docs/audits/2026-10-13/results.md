# Results

## Verdicts

- **Code review:** APPROVE, nothing Critical. It raised two Required follow-ups on the prune change. The
  first, prune removing a rule the user picked on purpose, is WIZ-5. The config writers still use
  `replaceMerge`, `previousOpFor` and `ensureHomeBackup`, and kind support is still read only through
  the capability helpers.
- **Eval S1 (cli):** pass, 12/12 with evidence, 0 invented. Fixture sha256 unchanged.
- **Eval W3 (wizard):** pass, 11/11 with evidence, 0 invented. Fixture sha256 unchanged.
- **cli-auditor and wizard-auditor:** the findings below. Each one was reproduced or cited file:line
  before it was accepted.

## Fixed on `chore/pre-release-audit`

| Id                  | Finding                                                                                          | Commit    |
| ------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| CLI-1, WIZ-5        | `prune --apply` could remove an inlined rule the user had picked, on an older manifest           | `948e94d` |
| WIZ-3, WIZ-6        | Guided equivalent commands left out `--force`, `--target` or `--project-dir`                     | `28edb63` |
| WIZ-7               | Guided prune tests covered only orphaned entries                                                 | `28edb63` |
| CLI-2, CLI-3, WIZ-4 | `prune` help, `cli-flags.md` and `consuming.md` described only orphaned artifacts                | `3afe50b` |
| CLI-7               | The VS Code MCP warning suggested writing the value into `.mcp.json`, which is usually committed | `8b1d3eb` |
| CLI-6               | `update`'s inlined notice went to stdout; `update` also did not repeat the MCP warning           | `6c921c3` |

Ambiguous inlined copies (no record of whether the user picked them) are reported, never removed. The
user chose that at the gate.

## Deferred

| Id    | Finding                                                             | Why deferred                                           |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| CLI-4 | Usage errors exit 1, not 2                                          | Breaking for scripts; predates this work. Own change   |
| WIZ-2 | Cancel and decline exit 0, not 130 / 1                              | Same exit-code contract as CLI-4; decide them together |
| WIZ-1 | Prompts and the terminal check use stdout, not stderr               | Breaking across every prompt; predates this work       |
| CLI-5 | Errors and warnings start with `✗` / `⚠`, not `error:` / `warning:` | Cosmetic                                               |
| CLI-8 | `prune --apply --json` does not say what it removed or kept         | Additive                                               |
| CLI-9 | `--yes` is described three ways across prune, add, update           | Cosmetic                                               |
| WIZ-8 | Applying a prune removes the empty folder `init` created            | Cosmetic                                               |

## Still to do

WIZ-3 live check: run `sigil prune --force` in a scratch project, accept the guided apply, and confirm
the `--force also deletes N file(s) you edited` warning and the equivalent command.
