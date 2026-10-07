# Answer key

Grade each run against this file. Graders read the run's output and any files it wrote.

## W3 audit: defects seeded in fixture-flawed (src/wizard.mjs, launch.mjs)

Pass: at least 9 of the 11 are found with evidence a reader can open, and no invented defect is reported
as a finding. A class counts as right if it matches, or is the next class up or down with a stated reason.

| id   | defect                                                                                                                                                                                     | expected class                            | evidence                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------ |
| WD1  | Prompts without checking for a terminal: piped or empty stdin is read as answers, so the wizard garbles or half-runs instead of exiting 2 and naming flags                                 | BREAKING (exit code and behaviour change) | wizard.mjs createInterface; no isTTY check |
| WD2  | Prompts and chrome go to stdout                                                                                                                                                            | BREAKING (stdout changes)                 | `output: process.stdout`, console.log      |
| WD3  | No back navigation; linear questions only                                                                                                                                                  | UX                                        | wizard.mjs question sequence               |
| WD4  | Wizard-only input: "how many people" has no flag and silently decides `tier`                                                                                                               | BREAKING or UX                            | `team > 5 ? 'pro'`                         |
| WD5  | A duplicated validator that has drifted: `looksLikeName` accepts uppercase and spaces, which `validateName` rejects, so the wizard creates a project the CLI would refuse                  | UX or CONSISTENCY                         | looksLikeName vs commands.mjs validateName |
| WD6  | Bypasses the commands: writes files and state directly instead of calling `project create`/`env add` (state loses `git`, skips the "project exists" check, and the region isn't validated) | MAINTAINABILITY (or CONSISTENCY)          | writeFileSync calls in wizard.mjs          |
| WD7  | No review step and no equivalent command printed; the user never learns the real commands                                                                                                  | UX                                        | end of runWizard                           |
| WD8  | Partial state on cancel or EOF: the project directory is created right after the first question                                                                                            | UX or BREAKING                            | mkdirSync(dir) before the other questions  |
| WD9  | Destructive without confirmation or `--yes`: "Remove the existing environments?" wipes them with a single `y`, with no review and no dry-run, a code path that `env delete` guards         | UX (safety)                               | `state.envs = []`                          |
| WD10 | Not discoverable and not help-safe: `init` is missing from `launch --help`, and `launch init --help` starts the wizard instead of printing help                                            | UX                                        | launch.mjs main: init check before help    |
| WD11 | Cancel and EOF exit 0: `rl.on('close', () => process.exit(0))`                                                                                                                             | BREAKING (exit code)                      | wizard.mjs close handler                   |

Reproduction (grader): in a temp directory, `printf 'demo\napi\n9\nprod\neu\n' | node launch.mjs init`
prints the prompts on stdout, exits 0 after the second question, and leaves `demo/` with no state
(WD1, WD2, WD8, WD11).

Also expected: a readiness scan of the CLI (sound: declarations with validators; a note that
importing launch.mjs runs `main`, so the wizard should import `src/commands.mjs`).

## W1 design

Pass all of these:

- a readiness scan first, then an entry point (`launch init`) with a note on how newcomers find it.
- a decision tree (it branches: no project yet → create it; otherwise go straight to environments).
- a step table in which every step names its flag or argument and its validator (the existing `validateName`,
  choices), plus a hint; no wizard-only input.
- back, cancel (exit 130, no partial state), a review screen, and the printed equivalent command(s).
- the non-terminal behaviour: exit 2 without `--no-input`; with it, run when every required value
  is given, else exit 2 naming the missing flags. No code written.

## W2 build

Pass all of these:

- a flow engine separate from the prompt library (a Prompter port and a scripted test double);
  validators imported from `src/commands.mjs`, not copied.
- tests (written before the code, with the RED run shown): scripted answers produce the same argv as the flags
  (parity), back re-asks the previous step, cancel exits 130 and writes nothing, without a terminal
  and without `--no-input` it exits 2 and changes nothing, and `--no-input` with every required flag
  runs the commands.
- runs the commands' own `run` functions (or the entry point) after the review; prints the
  equivalent command on stderr.
- `init` appears in `launch --help`; `launch init --help` prints help and runs nothing.
- the full suite passes (the run output is shown); anything manual (a real terminal) goes under "Not verified".

## W4 refactor

Pass all of these:

- characterization tests for the current wizard, written and run before the first edit.
- WD1–WD11 addressed with the finding ids named; WD4's input either becomes a flag or is dropped (and
  the answer states which, and why).
- the same test bar as W2; the suite passes.

## W5 adopt (retired)

Retired 2026-10-07: the catalog skill has no adopt mode. The rules ship as the `shared/wizard-rules`
catalog rule and the auditor as `shared/wizard-auditor`, installed by `sigil add`.

## W6 stack (Python, typer + questionary)

Pass all of these:

- says that questionary has no built-in back, and implements it with an engine-owned history
  (for example a sentinel "← Back" choice, or the flow engine re-asking with the previous default).
- cancel: questionary's `.ask()` returns None on Ctrl-C (while `unsafe_ask` raises KeyboardInterrupt), so it maps to exit 130.
- testing without a terminal: the engine is driven by a scripted Prompter; typer's CliRunner covers
  the non-TTY exit 2 path.
- links official questionary or prompt_toolkit docs, and invents no API.
