# Plan: OpenCode target, Phase B (V2 probe)

Part of the [roadmap](plan-opencode-target.md). A spike with no `src/` change: it runs the V1-shaped files on OpenCode 2
and ends in a written go or no-go. U1 is the gate. U2 is recorded only. The questions and the V1 results to compare with
are in the [evaluation](decisions/opencode-target-2026-11.md#open-for-later-steps).

Rules for every run:

- **Install.** V2 goes in a scratch prefix, never `-g`: `npm i --prefix <scratch>/v2 @opencode/cli@2.2.5`, called by its
  full path. Both lines use the `opencode` binary name, so this is what keeps them apart. The global V1 install isn't
  touched, and nothing here runs `opencode upgrade`.
- **Isolation.** As in the ADR's D0: `env -i`, a scratch `HOME`, no `XDG_*` variables, no provider keys, one fresh
  `git init` repo per probe, stdin closed and output in a file. V2 might read other paths, so step 1 checks that first.
- **Model.** A free OpenCode model only. Never an Anthropic provider, never `/connect`, and no credentials of any kind.
- **Files.** Same shape as the V1 probes, with no V2-native field. Keep them under the scratchpad; the repo gets only the
  results.

All steps are inline, because each one measures OpenCode's loader or a model's behavior, and the worker would measure
DeepSeek instead.

## Step 1: Install V2 and pass the gate `[inline: probes OpenCode's own loader and model behavior]`

| Case | Do                                                                 | Pass                                                       |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1    | Install as above, then `--version`                                 | Prints `2.2.5`; the global `opencode --version` is the V1  |
| 2    | List the commands with `--help`, and check each V1 `debug` command | A loader-level way to list skills, agents and MCP is noted |
| 3    | `models` from the isolated home                                    | A free model is listed, and no Anthropic model             |
| 4    | One `run` with that model                                          | It answers with no credentials, and no `auth.json` appears |
| 5    | List every path written under the scratch `HOME` and the repo      | All inside the scratchpad, and the layout is noted         |

If case 3 or 4 fails, model-dependent probes can't run: send what the loader cases can still prove through step 2, then
stop and ask. Don't work around it with an account.

Test: all five pass, or the stop above is reported.

## Step 2: Repeat P2, P3, P4 and P6 in V1 shape (U1) `[inline: probes OpenCode's own loader and model behavior]`

Each row is compared with its V1 result in the Probe log. The roadmap's implications for Phase D rest on these, so a
difference is recorded even when the case passes.

| Case | Probe | Do                                                                             | Pass                                                      |
| ---- | ----- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1    | P2    | One skill each in `.agents/skills/`, `.opencode/skills/` and `.claude/skills/` | All three listed; note whether each is picked             |
| 2    | P2    | `dup-skill` with a different body in all three, listed 16 times                | One entry; note which body wins                           |
| 3    | P3    | `.opencode/command/hello.md`, `$1` `$2`, args `one two three four`             | `HELLO[one][two three four]`                              |
| 4    | P3    | `.opencode/commands/plural.md`, `$1` `$ARGUMENTS`, args `aa bb`                | The plural folder loads                                   |
| 5    | P3    | `explain-diff` shape, quoted and unquoted first argument                       | Same split as V1                                          |
| 6    | P3    | Same, with a quoted first argument holding `"`, a case V1 never ran            | Result recorded, for Phase D's `explain-diff` decision    |
| 7    | P4    | `mode: subagent` with the D3 allow-list, asked through `task` to write a file  | No file                                                   |
| 8    | P4    | Same list, `mode: all`, write and shell through `--agent`                      | No file                                                   |
| 9    | P4    | Object-form `read` keeping the `.env` rules, read `.env`                       | No value returned                                         |
| 10   | P4    | Same, read `note.txt`                                                          | Text returned                                             |
| 11   | P4    | Object-form `read` plus `bash: allow`, run `cat .env`                          | Recorded only: V1 returned the value                      |
| 12   | P6    | `.opencode/opencode.json` `mcp` with `{env:PROBE_HOST_TOKEN}`, variable set    | Server starts and receives the value                      |
| 13   | P6    | Same, variable unset                                                           | Recorded: V1 started with an empty string                 |
| 14   | P1    | Root `AGENTS.md` asks for a closing word, a second repo with `CLAUDE.md` alone | Word in the first; none in the second (the V2 guide says) |

Cases 9 and 10 also settle the file-write side effects D0 warns about: after each run, note any `$schema`, `.gitignore`
or `package.json` V2 added.

A case that fails gets one retry with stdin and timeout checked, because V1 had four unexplained hangs. Keep every raw
output in the scratchpad until step 4 has used it.

Test: every row has a result. **U1 passes** only if cases 1, 3, 4, 7, 8, 9, 10 and 12 pass, which are the three kinds the
target adds (agents, commands, MCP) plus skills. Any other row is a limit to carry, not a failure.

## Step 3: A V1 plugin on V2 (U2) `[inline: probes OpenCode's own loader and model behavior]`

Recorded only; this doesn't gate the target. Reuse P5's plugin from the D5 shape: `.opencode/plugins/sigil-hooks.js`
throwing on a `.env` write through `tool.execute.before`.

| Case | Do                                                  | Record                                                             |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Ask the model to write `.env` with the plugin there | Skip, warn or fail, the exact message, and whether a file appeared |
| 2    | Ask it to write `ok.txt`                            | Whether the run still works around the plugin                      |
| 3    | Check the isolated `.opencode/` afterwards          | Any dependency install, as in D0                                   |

Test: all three recorded. If the `.env` write goes through with no message, say so plainly in the ADR: that is the silent
guard failure the decision named as the reason for `hook: none`.

## Step 4: Record the result `[inline: decision text and user-facing copy]`

This step decides. The go or no-go follows step 2's U1 rule. A no-go needs no further work to count as done.

- `docs/decisions/opencode-target-2026-11.md`: a `### V2 run` section under Probe log with the version, model, a results
  table in the existing form, and the differences from V1. Answer U1 and U2 in "Open for later steps", and fix any D0 to
  D8 V2 note the run disproves. On a no-go, revise Decision and Status: the work ends at Phase A. On a go, add a line
  that U1 passed; the rest of Decision stands unless a result moved it.
- `docs/plan-opencode-target.md`: mark Phase B done with its date and result, and record any change a difference forces
  on Phase C or D (for example the `.env` rule, or `explain-diff`). On a no-go, mark C to E as cancelled.
- `docs/setup/opencode.md`: replace "Not tested on OpenCode 2" with what the run showed, and correct anything else on the
  page that V2 disproves. The `CLAUDE.md` statements hold for V1 only if the run says so; say which line each fact
  belongs to.
- `CHANGELOG.md`: under `## [Unreleased]`, a `### Documentation` entry for the page's change.

Test:

```bash
npx prettier --check docs/decisions/opencode-target-2026-11.md docs/plan-opencode-target.md docs/setup/opencode.md CHANGELOG.md
```

Each `#heading` link added is read by hand, because the repo has no link checker. The full suite runs once, in the
finish.
