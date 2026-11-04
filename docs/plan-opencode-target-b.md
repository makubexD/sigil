# Plan: OpenCode target, Phase B (V2 probe)

Part of the [roadmap](plan-opencode-target.md). A spike with no `src/` change: it runs the V1-shaped files on OpenCode 2.
On 2026-11-03 the free quota ran out, so the owner split it: this phase ends with what the loader proves, and everything
needing a model reply moves to the roadmap's [Phase F](plan-opencode-target.md#phase-f-v2-model-backed-checks), last. The questions and the V1 results to compare with
are in the [evaluation](decisions/opencode-target-2026-11.md#open-for-later-steps).

Rules for every run:

- **Install.** V2 goes in a scratch prefix, never `-g`: `npm i --prefix <scratch>/v2 @opencode/cli@2.2.5`, called by its
  full path. Both lines use the `opencode` binary name, so this is what keeps them apart. The global V1 install isn't
  touched, and nothing here runs `opencode upgrade`.
- **Isolation.** As in the ADR's D0: `env -i`, a scratch `HOME`, no `XDG_*` variables, no provider keys, one fresh
  `git init` repo per probe, stdin closed and output in a file. `~/.config/opencode/` holds a real config with an
  OmniRoute env file, so step 1 proves V2 can't see it before any other run.
- **Model.** A free OpenCode model only. Never an Anthropic provider, never `/connect`, and no credentials of any kind.
- **Controls.** "Nothing happened" is never a pass alone. A file that's missing can mean a restriction worked, an `ask`
  was auto-rejected, or the agent never loaded, so each such case names its control.
- **Files.** Same shape as the V1 probes, with no V2-native field. Keep them under the scratchpad; the repo gets only the
  results.

All steps are inline, because each one measures OpenCode's loader or a model's behavior, and the worker would measure
DeepSeek instead.

## Step 1: Install V2 and pass the gate `[inline: probes OpenCode's own loader and model behavior]`

| Case | Do                                                                                                                            | Pass                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | Install as above, then `--version`                                                                                            | Prints `2.2.5`; the global `opencode --version` is the V1                                         |
| 2    | List the commands with `--help`, and check each V1 `debug` command and `run` flag                                             | A loader-level way to list skills, agents and MCP is noted, and `--model`, `--agent`, `--command` |
| 3    | `models` from the isolated home                                                                                               | A free model is listed. Note any Anthropic entry; never use it                                    |
| 4    | One `run` with that model                                                                                                     | It answers with no credentials, and no `auth.json` appears                                        |
| 5    | List every path written under the scratch `HOME` and the repo                                                                 | All inside the scratchpad, and the layout is noted                                                |
| 6    | `debug paths`, or V2's equivalent, then a marker file's `find -newer` over `~/.config/opencode` and `~/.local/share/opencode` | Every path is under the scratch `HOME`, and `find` prints nothing                                 |

Case 6 failing stops the spike at once. If case 3 or 4 fails, the model-dependent probes can't run: finish the loader-only
rows of step 2, then stop and ask. Don't work around it with an account.

Test: all six pass, or the stop above is reported.

## Step 2: Repeat P2, P3, P4 and P6 in V1 shape (U1) `[inline: probes OpenCode's own loader and model behavior]`

Each row is compared with its V1 result in the Probe log. The roadmap's implications for Phase D rest on these, so a
difference is recorded even when the case passes.

| Case | Probe | Do                                                                                  | Pass                                                         |
| ---- | ----- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | P2    | One skill each in `.agents/skills/`, `.opencode/skills/` and `.claude/skills/`      | `.agents` listed and picked; record the other two            |
| 2    | P2    | `dup-skill` with a different body in all three, listed 16 times                     | One entry; note which body wins                              |
| 2b   | P7    | Case 1's repo with `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`, if `.claude` was listed | `.claude` gone, `.agents` remains; the setup page needs this |
| 3    | P3    | `.opencode/command/hello.md`, `$1` `$2`, args `one two three four`                  | `HELLO[one][two three four]`                                 |
| 4    | P3    | `.opencode/commands/plural.md`, `$1` `$ARGUMENTS`, args `aa bb`                     | The plural folder loads                                      |
| 5    | P3    | `explain-diff` shape, quoted and unquoted first argument                            | Same split as V1                                             |
| 6    | P3    | Same, with a quoted first argument holding `"`, a case V1 never ran                 | Result recorded, for Phase D's `explain-diff` decision       |
| 7    | P4    | `mode: subagent` with the D3 allow-list, asked through `task` to write a file       | No file, and the control below wrote one                     |
| 8    | P4    | Same list, `mode: all`, write and shell through `--agent`                           | No file, and the control below wrote one                     |
| 9    | P4    | Object-form `read` keeping the `.env` rules, read `.env`                            | No value, and the log shows the `ask` rejected               |
| 10   | P4    | Same, read `note.txt`                                                               | Text returned                                                |
| 11   | P4    | Object-form `read` plus `bash: allow`, run `cat .env`                               | Recorded only: V1 returned the value                         |
| 12   | P6    | `.opencode/opencode.json` `mcp` with `{env:PROBE_HOST_TOKEN}`, variable set         | Server starts and receives the value                         |
| 13   | P6    | Same, variable unset                                                                | Recorded: V1 started with an empty string                    |
| 14   | P1    | Root `AGENTS.md` asks for a closing word, a second repo with `CLAUDE.md` alone      | Word in the first; none in the second (the V2 guide says)    |

Control for cases 7 and 8: first show each agent in the loader listing with its permissions, then run the same prompt on
an agent with `write` and `shell` allowed. If that one writes no file, the case proves nothing, so it's recorded as failed.

`opencode run` re-quotes an argument holding spaces (Probe log), so cases 3 to 6 pass words separately. For case 6, send
the literal quotes the way a user would type them in the TUI's `/explain-diff`, and record the exact form sent.

After each run note any `$schema`, `.gitignore` or `package.json` V2 added. Case 12 is the one with a config file, so it's
where D0's `$schema` insert shows up, and Phase E's drift hash depends on it.

A case that fails gets one retry with stdin and timeout checked, because V1 had four unexplained hangs. Keep every raw
output in the scratchpad until step 4 has used it.

Test: every row has a result. **U1 passes** only if cases 3, 4, 7, 8, 9, 10 and 12 pass: agents, commands and MCP, the ADR's
gate and what the target adds. Any other row, skills included, is a limit to carry into Phase D or the setup page, not a
failure.

## Step 3: Record the loader result `[inline: decision text and user-facing copy]`

This records a partial result, not a verdict: U1 and U2 stay open until Phase F. Steps 1 and 2 count as done with their
loader rows; their other rows are listed in Phase F.

- `docs/decisions/opencode-target-2026-11.md`: a `### V2 run` section under Probe log with the version, how to run V2, a
  results table and the differences from V1. Update U1 and U2 in "Open for later steps", Status and Decision: the owner
  moved the gate on 2026-11-03, so code no longer waits on U1, and Phase F closes it.
- `docs/plan-opencode-target.md`: mark Phase B done with its date, add Phase F, and change the gates of C.
- `docs/setup/opencode.md`: replace "Not tested on OpenCode 2" with what the run showed and what it didn't.
- `CHANGELOG.md`: under `## [Unreleased]`, extend the setup page's entry.

Test:

```bash
npx prettier --check docs/decisions/opencode-target-2026-11.md docs/plan-opencode-target.md docs/setup/opencode.md CHANGELOG.md
```

Each `#heading` link added is read by hand, because the repo has no link checker. The full suite runs once, in the
finish.

## Run notes, 2026-11-03

Step 1 stopped at case 4: every free model tested answered `Free usage limit reached`, with no credentials in use. These
results keep the loader-only rows across a `/clear`; step 4 moves them to the ADR. The fixtures live in the scratchpad, so
rebuild them from the tables above.

How it ran on 2.2.5:

- npm 12 blocks `@opencode/cli`'s postinstall, so `node_modules/.bin/opencode` only prints an error. The binary in
  `node_modules/@opencode/cli-linux-x64/bin/opencode` runs with no install script.
- `run` has no `--command`, and `debug skill` is gone. `debug agents`, `debug paths`, `debug config` and `mcp list` exist.
- Commands use a background service unless they get `--standalone`. Use it on every run. Set `TMPDIR` too, or `tmp` is
  `/tmp/opencode`.
- Loader facts come from `opencode serve` plus basic auth (`opencode`, the printed password): `/api/skill`, `/api/command`,
  `/api/agent`, `/api/mcp`. Skills and commands stay empty until a session exists, and then fill in about 3 seconds, so
  poll for a project entry. Fixture repos need a commit, or the project is `global`.
- `POST /api/session/{id}/command` stores the expanded text before any model call, so substitution needs no model.

Results so far:

| Case | Result                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | All three listed. Picked: not run                                                                                    |
| 2    | One entry, `.opencode` body, 16 of 16 listings                                                                       |
| 2b   | With the variable, `c-skill` gone, `.agents` and `.opencode` remain                                                  |
| 3    | Pass: `HELLO[one][two three four]`, and `HELLO[one][two]`                                                            |
| 4    | Pass: `PLURAL[aa bb][aa bb]`                                                                                         |
| 5    | Same as V1: unquoted `AUDIENCE[beta gamma reviewer] DIFF[alpha]`, quoted `AUDIENCE[reviewer] DIFF[alpha beta gamma]` |
| 6    | `"` inside double quotes splits (`"a "b" c" reviewer` gives `DIFF[a ]`), `\"` too. `'a "b" c' reviewer` holds        |
| 7-8  | Loader half: agents listed, rules end in `* deny` then the allows. Enforcement and control: not run                  |
| 9-10 | Loader half: `read` rules keep `*.env: ask` after `*: allow`. Enforcement: not run                                   |
| 11   | Not run                                                                                                              |
| 12   | Pass: `connected`, server received the value                                                                         |
| 13   | Same as V1: started with an empty string                                                                             |
| 14   | Inconclusive: instruction entries are empty for both repos without a model turn                                      |

Neither `.opencode/opencode.json` nor the repo changed: no `$schema` insert and no `.gitignore`. V2 can see nothing of the
owner's: `debug paths` stays in the scratch `HOME`, and `find -newer` over the owner's directories printed nothing.

Left for Phase F: step 1 case 4, step 2 cases 1 (picked), 7 to 11 and 14, and U2.
