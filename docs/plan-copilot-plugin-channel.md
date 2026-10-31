# Plan: Copilot plugin channel (roadmap)

Source: [docs/ideas/copilot-plugin-channel.md](ideas/copilot-plugin-channel.md) and ADR Phase 4
([distribution-channels-2026-09](decisions/distribution-channels-2026-09.md) section 6). This is a
phase-level roadmap, written 2026-10-30 against `1b0f61b`. Each phase is one branch and one PR. A
phase that writes code gets a step-level `docs/plan-copilot-plugin-channel-<phase>.md`, which the
owner reviews before anything is built. A recorded no-go counts as done.

Standing procedure: RED first, `npm run ci:local` green, merge on green CI. Close-out per phase:
`workflow-report .`, `/agent-skills:review`, a `CHANGELOG.md` entry when behaviour changes, and the
phase's step plan deleted after merge. Worker steps use `[worker:medium]` or higher. Nothing whose
result is Copilot's behaviour goes to the worker.

## TODO

- [ ] **Phase 0, brief refresh** (`docs/copilot-plugin-brief`): apply [the corrections](#evidence-re-verified)
      to the brief, including the dead link and the out-of-scope line. Fix the same stale citation in
      `docs/ideas/import-copilot-layout.md:22` and `docs/guides/publishing.md:170`.
      `[inline: tiny docs edit]`
- [ ] **Priority fix, not gated: `shared/protect-config` misses `apply_patch`**, found by the Phase 1
      test ([cause 2](decisions/copilot-plugin-channel-2026-10.md#causes)). Shipped behaviour under
      `sigil add --target copilot`. Own branch and PR, RED first with a string `tool_input`, then re-run
      the `.env` check in Copilot CLI and find out whether the hook fires in VS Code.
- [x] **Phase 1, manual test and format decision.** Test done 2026-10-30; results in
      [the record](decisions/copilot-plugin-channel-2026-10.md). **The owner chose a narrowed Route A:**
      Claude format for skills, agents and prompts, no emitter, `sigil add` for hooks and MCP on Copilot.
      The main session ran [the test](#manual-test) on
      Copilot CLI and VS Code (owner's instruction, 2026-10-30), never the worker: the result is Copilot's
      behaviour. Results and the decision go in `docs/decisions/copilot-plugin-channel-2026-10.md`,
      with a route from [the gate](#gate-what-the-result-decides). **Phases 3 and 4 wait for this.**
- [ ] **Phase 2, agent layout.** Not gated: `build` and `add` should agree whichever route wins. It runs
      after Phase 1 only so that a Copilot emitter would start from the finished layout. Scope below.
- [ ] **Phase 3, Route A docs.** Narrowed from the gate's Route A: also say `hook-*` and `mcp-filesystem`
      aren't for Copilot, and use the prefixed names. Route B's spike and Route C are not taken.
- [ ] **Phase 4, close-out.** ADR, generated docs, and the brief's retirement. Scope below.

## Evidence, re-verified

Checked 2026-10-30 against the code, a fresh `npm run catalog:build`, and the live docs.

| Brief says                                          | Now                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capabilities.ts`: no `plugin` channel, `:2-5`      | Still true. Table is `:14-26`.                                                                                                                                                                                                                                                                                                                                                                 |
| `hook` and `settings` are `none`                    | **Stale.** `hook` is `native` (#102). `settings` stays `none`.                                                                                                                                                                                                                                                                                                                                 |
| `index.ts:101-105` writes `.github/AGENTS.md`       | Still true, now `:121-125`.                                                                                                                                                                                                                                                                                                                                                                    |
| `build-helpers.ts:126-133` comment about the split  | **Wrong cite.** The comment is `:58-64` and is about moving the file to the repo root, not per-file agents. The cause is `COMPILED_FILE_KINDS` (`target-helpers.ts:140`), which omits `agent`. Fresh build: 0 files in `.github/agents/`, 39 catalog agents, one 195 KB `AGENTS.md`.                                                                                                           |
| `spec/agent.ts:57` is the `add` path                | Still true, now `:59`.                                                                                                                                                                                                                                                                                                                                                                         |
| Out of scope: hooks, link to `copilot-hooks.md`     | **Dead link.** Now [copilot-hooks-2026-10](decisions/copilot-hooks-2026-10.md). Scaffold hooks shipped; hook _plugins_ are in this test.                                                                                                                                                                                                                                                       |
| About-plugins page: agents, skills, hooks, MCP, LSP | Stale. It now also lists extensions, and four surfaces: VS Code, CLI, the Copilot app, and the cloud (repository settings).                                                                                                                                                                                                                                                                    |
| `.claude-plugin/` for `marketplace.json`, unfetched | **Confirmed**, last in the lookup order. `.claude-plugin/plugin.json` is also read, last too ([CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)). VS Code names a Claude format and warns that support for a format doesn't guarantee every component works ([reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)). |

Found while re-verifying, all of which the test must cover:

- **The marketplace is not on the default branch.** It lives on the orphan `marketplace` branch.
  VS Code documents `owner/repo#ref`. `copilot plugin marketplace add --help` (1.0.105) shows no
  ref syntax, so the CLI may have no direct route to it.
- **Agents may not load.** sigil's plugins ship `agents/<name>.md`. The Copilot plugin pages read
  here describe only `.agent.md`.
- **Hook shape differs.** sigil's plugins nest entries (`matcher` + `hooks: [...]`) with `command` +
  `args` and no `version`. Copilot documents flat entries, with `exec` + `args`. Its docs do say
  PascalCase events work "as used in Claude Code plugins". A hook can fail either way: never firing,
  or, because `preToolUse` fails closed, denying every call.
- **The marketplace text is rendered for Claude.** Of 127 Markdown files in `dist/claude/plugins`, 47
  contain `$ARGUMENTS`, 52 `CLAUDE.md` and 4 `.claude/`. `sigil add --target copilot` translates these
  through the lexicon; a Claude-format plugin can't. Prompts arrive as skills using Claude's
  `arguments`, `$name` and `disable-model-invocation`.
- **`platforms: [claude]` does not hold on this route.** `reviewer-bash-guard`, `worker-mode-guard` and
  `mk-check` never reach Copilot through `add`, but a Copilot user can install them from the
  marketplace. The reviewer guard decision records why it can't work there (no agent fields).
- **`dependencies`.** Only `deepseek-worker` declares one. Not tested, because its guard reads this
  machine's real worker-mode flag.

## ADR phases 2b and 3 are skipped ahead of Phase 4

The ADR's suggested order is `2 → 2b → 3 → 4`. On the owner's instruction this roadmap goes straight
to Phase 4. Phase 4 has no code dependency on either. Phase 4's close-out records the skip in ADR
section 6, so the ADR stops implying they came first.

- **2b (`sigil add --complement`, duplicate guard): not built.** No `--complement` or `enabledPlugins`
  anywhere in `src/`. `status-overlaps.ts` only compares what `add` installed. What the skip costs on
  Copilot: if a project has a `sigil add` copy and the plugin of the same artifact, agents and skills
  are first-found-wins, so the project copy silently beats the plugin, while MCP is last-wins, so the
  plugin beats the project. Nothing warns. Route A or B documents that.
- **3 (Agent Skills conformance): the checks are built; the goal is unproven.** Both limits are enforced
  by `provider-limits` through `agent-skills-limits.ts` since `e5939bd` (2026-10-03), and `name` equals
  the folder because `outputPath` derives from it. Measured on fresh output: 0 mismatches across
  agents-standard (45 skills), Claude plugins (55) and Copilot (45). Longest name 22, longest
  description 589. The ADR's stated outcome, `npx skills add … --skill x` working, has never been run,
  isn't documented, and may need a published tree: `master` holds catalog source with `{sigil:…}`
  tokens, not rendered skills. So Phase 3 stays open in the ADR, narrowed to that install route.

## Manual test

Run 2026-10-30. A re-run must use the prefixed names, `/<plugin>:<skill>` and `<plugin>:<agent>`, and
for rows 11 and 12 must uninstall `mcp-filesystem` first, or the model writes through it and never
reaches the hook. A CLI project hook also needs a trusted folder.

The owner handed this to the main session on 2026-10-30. The list below is the interactive form; it
runs unattended like this:

- **Copilot CLI:** `copilot -p` with `COPILOT_HOME` set to a throwaway folder holding a copy of
  `config.json`, so `~/.copilot` is untouched and cleanup is deleting that folder. Tool permissions are
  granted per run with `--allow-tool`, only inside a throwaway project. Listing commands that have no
  prompt-mode form are answered from the installed plugin files and the session output, and the record
  says so.
- **VS Code:** `code chat -m agent --profile sigil-probe`, so settings stay in a separate profile that is
  deleted afterwards. Answers are read from the session's JSONL under `workspaceStorage/`. Anything that
  can't be driven this way is recorded as not tested, never as a pass or fail.
- **Cost:** each run spends the owner's AI credits (0.37 for a one-word reply), so a check that a file
  listing can answer doesn't get a model run.

Checked on this machine 2026-10-30: Copilot CLI 1.0.105, with `makubexD` recorded in its config (the
token itself was not exercised). VS Code 1.143.1 (snap) with Copilot built in. VS Code sign-in was
not confirmed. `chat.plugins.marketplaces` is set; `chat.plugins.enabled` isn't set explicitly, so
check it.

**Setup.** The project has no `.github/` or `.claude/` on purpose, so nothing shadows a plugin.

```bash
mkdir -p ~/sigil-copilot-probe && cd ~/sigil-copilot-probe && git init
printf 'export const add = (a: number, b: number) => a + b;\n' > add.ts
printf 'KEY=example\n' > .env.example
git add . && git commit -m probe
git clone --depth 1 --branch marketplace https://github.com/makubexD/sigil ~/sigil-marketplace-clone
```

**Copilot CLI: add and install.**

1. `copilot plugin marketplace add makubexD/sigil#marketplace`. If it's rejected, record the error and
   use `copilot plugin marketplace add ~/sigil-marketplace-clone`. Record which one worked.
2. `copilot plugin marketplace browse sigil`. Expected: 21 plugins.
3. Install five, then check with `copilot plugin list`:

   ```bash
   for p in typescript-tooling essentials hook-protect-config hook-reviewer-bash-guard mcp-filesystem; do
     copilot plugin install "$p@sigil"
   done
   ```

**In a session.** Run `copilot` from `~/sigil-copilot-probe`.

4. Skills: `/skills list`. Expected: 8 `ts-*` and `explain-diff`. Note the name each one shows under.
5. Agents: `/agent`. Expected: 7 `ts-*`. Zero means `.md` agents aren't read.
6. Read-only holds: `/agent ts-security-auditor`, then "Use your file edit tool, not the shell, to add a
   comment to add.ts." Expected: it can't, and `git status` stays clean. **Any edit is an unsafe result.**
7. Tools aren't zeroed: `/agent ts-refactor-specialist`, then "Add a doc comment to add.ts." Expected: it
   edits. Then `git checkout add.ts`.
8. Prompt with `$ARGUMENTS`: `/ts-generate-tests add.ts`. Expected: it targets `add.ts`. Failure looks like
   a literal `$ARGUMENTS` or a question about the target.
9. Prompt with named arguments: `/explain-diff "the last commit" junior`. Expected: both `$diff` and
   `$audience` are filled in.
10. `disable-model-invocation`: new session, "explain the diff of the last commit", no slash. Expected:
    `explain-diff` doesn't load by itself.
11. Hook blocks: "Create a file .env containing KEY=1." Approve the tool call. Expected: blocked, and
    no `.env` exists.
12. Hook allows: "Create a file notes.txt containing hello." Expected: created. If this is denied too, the
    hook is failing closed, which is a failure, not a pass.
13. Claude-only guard on Copilot: in the main session and again under `/agent ts-security-auditor`, ask it
    to run `touch guard-probe.txt`. Record what happens in each, then delete the file.
14. MCP: open `/mcp`. Expected: `filesystem` is connected. Then "Use the filesystem MCP server to list the
    allowed directories." Expected: this project, not the plugin's folder.

**VS Code: same test.**

15. Start it from a shell that has nvm's Node on `PATH`, otherwise `node` and `npx` are missing and the
    hook and MCP steps fail for the wrong reason: `code ~/sigil-copilot-probe`.
16. Confirm you're signed in to Copilot. Set `chat.plugins.enabled` to `true`, and add
    `"makubexD/sigil#marketplace"` to `chat.plugins.marketplaces`.
17. Install the same five from **Customize** in the Chat panel.
18. Repeat steps 4 to 14 in Agent mode. Use **Configure Skills**, the agent picker and the MCP server list
    for the listings.

**Clean up.**

```bash
for p in typescript-tooling essentials hook-protect-config hook-reviewer-bash-guard mcp-filesystem; do
  copilot plugin uninstall "$p@sigil"
done
copilot plugin marketplace remove sigil
```

Uninstall them in VS Code too, restore `chat.plugins.marketplaces`, and delete the two probe folders.

**Record.**

| #   | Check                          | Copilot CLI | VS Code |
| --- | ------------------------------ | ----------- | ------- |
| 1   | Marketplace adds; which source |             |         |
| 2-3 | Lists 21; five install         |             |         |
| 4   | Skills load                    |             |         |
| 5   | Agents load                    |             |         |
| 6   | Read-only agent can't edit     |             |         |
| 7   | Writing agent can edit         |             |         |
| 8   | `$ARGUMENTS` filled            |             |         |
| 9   | `$diff`, `$audience` filled    |             |         |
| 10  | No auto-invocation             |             |         |
| 11  | Hook blocks `.env`             |             |         |
| 12  | Hook allows `notes.txt`        |             |         |
| 13  | Claude-only guard behaviour    |             |         |
| 14  | MCP runs, root is the project  |             |         |

Also record both client versions and the date.

## Gate: what the result decides

Mark each cell **pass**, **degraded** (works, but a user sees something wrong, such as a literal
`$ARGUMENTS`), **absent** (silently doesn't load), or **unsafe** (row 6 or 11 fails, or row 12 denies).

| Route                        | Taken when                                                                                                               | Phase 3 is                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: rely on Claude format** | Row 1 works on both surfaces, nothing is unsafe, and the owner accepts any degraded or absent rows as documented limits. | Docs only: `docs/setup/copilot.md`, the README `<details>` block the ADR requires, and the limits: what doesn't load, the three Claude-only artifacts, and the duplicate behaviour. Check whether a capability row is possible: `plugin` rows of `native` need a `KindEmitSpec` or `provider-kind-coverage` fails, so a route with no emitter may have to stay docs-only. |
| **B: add a Copilot emitter** | Any unsafe result, or the absent or degraded rows are ones the owner won't ship.                                         | A step plan for a Copilot plugin output built from `COPILOT_EMIT_SPECS`, which gives the lexicon, `.agent.md` and the `platforms` filter for free. It opens with a spike on the three questions below.                                                                                                                                                                    |
| **C: no-go**                 | The cost of B outweighs the use, given that `sigil add` already serves Copilot.                                          | Record the no-go. Say plainly in `publishing.md` and `consuming.md` that the Claude marketplace is not supported on Copilot.                                                                                                                                                                                                                                              |

Route B's spike must answer:

1. **Format.** GitHub recommends Agent Plugins 1.0 for new plugins, but that standard makes only skills
   and MCP portable; agents and hooks sit under the client-specific `com.github.copilot` namespace. The
   alternative is the legacy Copilot format, which carries them directly.
2. **Where it's published.** Copilot checks `.github/plugin/marketplace.json` before
   `.claude-plugin/marketplace.json`, so one `marketplace` branch might serve both clients, each pointing
   at its own plugin tree. A shared plugin tree is out: Claude would load `agents/x.agent.md` beside
   `agents/x.md`. If row 1 shows the CLI can't read a ref, a manifest on `master` or a separate route has
   to solve that too.
3. **Declaring it.** `plugin` rows in `capabilities.ts`, plugin specs in `spec/`, and how packs and the
   generated `hook-*` and `mcp-*` plugins map.

If row 1 fails on the CLI but works in VS Code, that alone doesn't force B: the owner can ship A for VS
Code and document the local-clone route, or take B.

## Phase 2 scope

Make `build --target copilot` write `.github/agents/<name>.agent.md` by adding `agent` to
`COMPILED_FILE_KINDS`, so both commands use `COPILOT_AGENT_SPEC`.

**Recommendation: drop `.github/AGENTS.md` from `build`** rather than emit both. It is 195 KB that
duplicates the per-file agents, written as repository instructions, so a project that commits it may
pay for it on every request. This removes output, so the owner confirms it in the step plan's review. If kept, `publishing.md` documents
why there are two.

Touches `target-helpers.ts`, `build-helpers.ts`, `index.ts`, `test/targets/copilot.test.ts`,
`output-contract.test.ts`, `doc-refs.test.ts`, `test/fixtures/output-snapshot/build.json`, the
`publishing.md` known limit, and the `CLAUDE.md` invariant that names the aggregate. Success:
`provider-kind-coverage` passes and the `build` and `add` agent files are byte-identical for a shared
install set, or any difference is explained.

## Phase 4 scope

- ADR section 6: the Phase 4 result, the 2b and 3 status from this plan, and section 3's Copilot column
  corrected from the test.
- Regenerate `docs/reference/capabilities.md` if a `plugin` row was added.
- `publishing.md` section 3 and known limits, `docs/index.md` row S4, and `README.md`.
- Move the brief's surviving facts into the decision record, delete it, and remove its row from
  `docs/ideas/README.md`. Delete this plan.

Open after close-out, unless the test happens to settle them: whether the cloud agent installs plugins
from a repo marketplace (docs say "through repository settings"; not tested), and whether Copilot's
skill discovery has a description-length budget like Claude's (the docs read here don't say).
