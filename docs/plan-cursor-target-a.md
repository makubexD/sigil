# Plan: Cursor target, Phase A (live probe)

Roadmap: [plan-cursor-target.md](plan-cursor-target.md) § Phase A. Output: `docs/decisions/cursor-target-2026-11.md`,
no code. Branch `docs/cursor-probe`, one PR.

Every step is `[inline: probe measures Cursor's own loader and model]`: the worker is DeepSeek and can't run
`agent`, and the answers are Cursor's behavior. Each probe runs in a fresh throwaway repo under the scratchpad
(`git init`, files written by hand, `agent -p --output-format json` or text), never in this repo. The free plan's
request budget is small: one `agent -p` run per question where possible, two at most, and each prompt asks for a short
answer. Record the exact prompt, the Cursor version (`agent --version`) and the observed output for every run.

Trust: project hooks and MCP need a trusted workspace. If `agent -p` asks for trust or skips them, record that as its
own result (Codex's A5 failed open this way), then retry with whatever flag the CLI documents, and record which one.

## Steps

1. **Setup.** `[inline: probe]` Record `agent --version` and `agent --help` (the flags for print mode, trust, model,
   and listing rules/skills/MCP, if any). Make a probe-repo helper script in the scratchpad that creates a fresh
   `git init` repo from a folder of fixture files. No Cursor request is spent.
   Test: `agent --version` prints `2026.10.22-27dcf5f` or a newer version (record which).

2. **A1, rules.** `[inline: probe]` One repo with three `.cursor/rules/*.mdc`: `always.mdc` (`alwaysApply: true`, body
   "the codeword is ALPHA"), `scoped.mdc` (`globs: "src/**/*.ts"`, `alwaysApply: false`, codeword BRAVO), `both.mdc`
   (`globs` + `description`, `alwaysApply: false`, codeword CHARLIE, same glob), plus `notes.md` in `.cursor/rules/`
   (codeword DELTA, must be ignored). Run 1: "List every codeword your rules give you; answer with the words only."
   Run 2: same, with `src/app.ts` named in the prompt.
   Expected: run 1 → ALPHA only; run 2 → ALPHA, BRAVO, CHARLIE; DELTA never. Anything else is a finding against
   Decision 2.

3. **A2 + A3, skills.** `[inline: probe]` One repo with `.cursor/skills/probe-skill/SKILL.md` (description: "Use when
   asked for the probe checksum", body: read `references/value.md` and answer with its content), `references/value.md`
   holding `ECHO-42`, and `.claude/skills/probe-skill/SKILL.md` with the same name and a different answer (`FOXTROT-7`).
   Run 1: "What is the probe checksum?" Run 2: "List the skills you can use, names only."
   Expected for A2: run 1 → `ECHO-42` (skill picked from its description, reference loaded). A3 is open: record whether
   run 2 lists `probe-skill` once or twice and which body run 1 used. One listing (`.cursor` wins) turns Decision 1's
   refusal into a warning; two listings keep the refusal.

4. **A4 + A5, hooks.** `[inline: probe]` One repo with `.cursor/hooks.json` (`version: 1`, `preToolUse` running a script
   that appends its raw stdin to `hook-cursor.log` in the probe repo and exits `2` when the payload names `.env`),
   and `.claude/settings.json` with a `PreToolUse` `Edit|Write` hook that appends to `hook-claude.log` and exits 0.
   Run 1: "Create the file .env containing X=1." Then read both logs and check for `.env`.
   Expected for A4: `.env` is not created, and `hook-cursor.log` holds the payload; record the tool name and every field
   name (`file_path`? `path`?) verbatim, since `protect-config` reads `tool_input.file_path ?? tool_input.path`. A5 is
   open: record whether `hook-claude.log` was written, and whether once or twice per call.

5. **A6, MCP.** `[inline: probe]` One repo with `.cursor/mcp.json`: a stdio server (a 30-line Node script in the repo,
   no dependencies, one tool `probe_env` returning `process.env.PROBE_VALUE`), with `"env": {"PROBE_VALUE":
"${env:SIGIL_PROBE}"}`, and `SIGIL_PROBE=golf-99` exported for the run. Run 1: "Call probe_env and answer with its
   result only."
   Expected: `golf-99`. A literal `${env:SIGIL_PROBE}` means no expansion; no tool means the server didn't start (record
   whether trust is the cause).

6. **A7, read-only subagent.** `[inline: probe]` One repo with `.cursor/agents/reader.md` (`name: reader`,
   `description`, `readonly: true`). Run 1: "Use the reader subagent to create notes.txt containing hi, then run
   `touch made.txt`, then run `ls` and report what each attempt did."
   Expected: neither `notes.txt` nor `made.txt` exists after the run. Record what it said about `ls` (read-only shell
   allowed?) and any mention of web tools. If the CLI has no subagents, record that and mark A7 docs-only.

7. **A8, plugins.** `[inline: probe]` Check `agent --help` and the plugins reference for a CLI install command. If one
   exists: a local marketplace repo with `.cursor-plugin/marketplace.json` and one plugin holding one rule (codeword
   HOTEL), install it, run "List every codeword your rules give you." Expected: HOTEL. If the CLI can't install
   plugins, record that and mark A8 docs-only for Phase F (no request spent).

8. **Decision record.** `[inline: judgment, writing the ADR]` Write `docs/decisions/cursor-target-2026-11.md` in the
   shape of `codex-target-2026-10.md`: how the probes ran, a results table A1-A8, then one section per finding that
   changes a later phase (Decision 1's refusal vs warning, `protect-config` field names, trust behaviour, A5 double
   runs, what `readonly` allows). Update the roadmap's Phase B-F text only where a result contradicts it, and add a
   Phase A "done" line. `npx prettier --write` both files.
   Test: `npm run check` passes; every A-row has an observed result or an explicit "docs-only" with its reason.

9. **Close-out.** `[inline: plan close-out]` `workflow-report .`, `/agent-skills:review` of the decision record, a
   `CHANGELOG.md` line under Unreleased (docs only), PR, `pr-ready`, merge, delete this plan file after merge.
