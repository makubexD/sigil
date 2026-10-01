# Capability Map: Guided sigil

Goal: someone with no knowledge types `sigil` (or `npm run sigil`) and is guided by the state of the
current directory; help is reachable and readable everywhere.

| Module id         | Responsibility                                                                                          | Depends on                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `cli-surface`     | Help prints everywhere; grouped root help, one-line summaries, footer; bare non-TTY → stdout, exit 0    | —                                              |
| `project-context` | Pure detection of directory state (targets, manifest, health, catalog checkout) plus `recommendNext`    | —                                              |
| `guided-verbs`    | Wizards for `uninstall`, `update`, `prune`, `init`; shared installed-artifact picker                    | `project-context`                              |
| `home-menu`       | Bare `sigil` in a TTY: status header, recommended step, routes to every flow, loops until Quit          | `cli-surface`, `project-context`, `guided-verbs` |
| `docs`            | Getting help, the menu, guided verbs, npm `--` note, regenerated cli-flags, wizard registry, CHANGELOG  | all (touched per module, final sweep)          |

Build order: cli-surface → project-context → guided-verbs → home-menu → docs.

Specs: `SPEC-guided-sigil.md` (all modules, one file; each module section is independently testable).
Tasks: `tasks/todo.md`.
