# Plan: Copilot plugin channel, Phase 3 (Route A docs)

Roadmap: [plan-copilot-plugin-channel](plan-copilot-plugin-channel.md). Decision and results:
[copilot-plugin-channel-2026-10](decisions/copilot-plugin-channel-2026-10.md). Written 2026-10-30
against `5014a9b`. Branch: `docs/copilot-plugin-route-a`, one PR.

Goal: a Copilot user can install sigil's skills, agents and prompts from the marketplace, knows which
plugins not to install, and gets hooks and MCP through `sigil add`. Nothing else in the docs still
says there is no route.

## Decisions

1. **No `plugin` row in `src/targets/copilot/capabilities.ts`.** A `native` row needs a `KindEmitSpec`
   or `provider-kind-coverage` fails, and the table states what sigil emits for a target. sigil emits
   no Copilot plugin; Copilot reads the Claude plugin. So `capabilities.md` doesn't change and Phase 4
   has nothing to regenerate. Only the header comment changes, because it calls the question open.
2. **The stale Copilot statements move from Phase 4 to here.** `README.md`, `publishing.md` and
   `docs/index.md` say there is no plugin channel. Shipping the setup page without fixing them
   contradicts it in one PR. Links to the brief are repointed too, because Phase 4 deletes the brief.
   Phase 4 keeps the ADR, the brief's retirement and deleting the roadmap.
3. **Check the MCP route before recommending it.** The record says `sigil add`'s MCP path "was not part
   of this test", and the new page sends users there. Step 1 runs it once.
4. **The roadmap's "MCP: the plugin beats the project" is not what the docs say.** The documented order
   lists `~/.copilot/mcp-config.json`, then plugins, then `--additional-mcp-config`. A project
   `.mcp.json` isn't in it. The page tells users not to define the same server twice and claims no
   winner. Step 5 corrects the roadmap.
5. **One code step, beyond "docs only": step 6.** A Copilot user browsing the marketplace sees
   `mcp-filesystem` described as connecting "Claude Code (and Copilot)", which is false on this route,
   and nothing warns about the hooks. The description is the only text they see at install time. It
   changes one function and reaches users at the next release. Drop the step if the phase should stay
   docs only.

Not changed: pack descriptions in `packs.yaml`, which say "As plugins, add mcp-filesystem,
hook-protect-config and hook-reviewer-bash-guard". That advice is right for Claude. With step 6 the
named plugins carry the warning themselves.

## Steps

### 1. Live check of `sigil add` MCP on Copilot CLI `[inline: result is Copilot's behaviour]`

In a throwaway git project, with `COPILOT_HOME` set to a throwaway copy of the config as in
[the manual test](plan-copilot-plugin-channel.md#manual-test), and the folder trusted:

```bash
sigil add mcp:shared/filesystem --target copilot --yes
copilot -p "Use the filesystem MCP server to list the allowed directories."
```

One model run. VS Code is not repeated: its sessions ran on the Copilot CLI runtime, so a second run
adds little, and the page says VS Code wasn't tested.

- Expected: the server connects and the allowed directory is the project.
- Pass: replace "its MCP path was not part of this test" in the decision record with the result.
- Fail: record it, stop, and ask. The page can't recommend this route as written.

### 2. Write `docs/setup/copilot.md` `[inline: user-facing copy]`

Same header and tone as `docs/setup/claude-code.md`. Sections, in order:

1. **Add the marketplace.** `copilot plugin marketplace add makubexD/sigil#marketplace`. The `#marketplace`
   is required: bare `makubexD/sigil` fails. VS Code: `chat.plugins.enabled`, then
   `"makubexD/sigil#marketplace"` in `chat.plugins.marketplaces`, install from **Customize**. Say the VS
   Code marketplace install wasn't tested; plugins were loaded from a local clone.
2. **Install.** `copilot plugin install typescript-tooling@sigil`. There is no scope flag: a CLI plugin
   installs per user, so it loads in every project. Names are prefixed:
   `/typescript-tooling:ts-generate-tests` and the agent `typescript-tooling:ts-security-auditor`.
3. **Don't install these on Copilot.** A table, plugin → what happens → what to do:
   - `hook-protect-config`: `.env` is not blocked, and on the CLI `edit` is denied. Use `sigil add`.
   - `hook-reviewer-bash-guard`: every shell command is denied. No Copilot replacement.
   - `hook-worker-mode-guard`: not run, but it has the same `command` + `args` form. No replacement.
   - `mcp-filesystem`: its root is the plugin folder, so it can't reach the project. Use `sigil add`.
   - `deepseek-worker`: needs Claude Code, and depends on `hook-worker-mode-guard`.
   - State the cause in one sentence, and that nothing stops the install.
4. **Hooks and MCP through `sigil add`.** Show this command as a block:
   `sigil add hook:shared/protect-config mcp:shared/filesystem --target copilot --yes`. It writes
   `.github/hooks/sigil.json` and `.mcp.json` (run 2026-10-30). A CLI project hook needs a trusted folder. `sigil` isn't on npm yet: link the README's install. Other MCP
   servers: `mcp-ado`, `mcp-context-mode` and `mcp-maku-jam` as plugins weren't tested, so use `sigil add`.
5. **Limits.**
   - A read-only agent has no edit tool but keeps its shell. `reviewer-bash-guard` never reaches Copilot
     (`add` skips it), so nothing blocks a shell write.
   - An MCP write skips `protect-config`: `filesystem-write_file` doesn't match `Edit|Write`.
   - `$ARGUMENTS` fills by slash command but stays literal if the model loads the skill itself.
   - `/essentials:explain-diff`: `$diff` and `$audience` aren't filled.
   - Skill text is rendered for Claude, so it can name `CLAUDE.md` or `.claude/`. `sigil add` translates
     these; a plugin can't.
6. **Copies of the same artifact.** A project or personal skill or agent with the same name silently
   beats the plugin. `sigil status` doesn't see plugins. For MCP, don't define one server name twice.
7. **Update and remove.** `copilot plugin update typescript-tooling@sigil` (or `--all`),
   `copilot plugin marketplace update sigil`, `copilot plugin uninstall typescript-tooling@sigil`,
   `copilot plugin marketplace remove sigil`. Pinning uses `#marketplace-v<version>`. Say update and
   pinning weren't run.
8. **What was tested.** Copilot CLI 1.0.105 and VS Code 1.143.1, 2026-10-30; five plugins of 21. Not
   tested: the Copilot app, the cloud agent, `dependencies`, Windows, MCP servers that need environment
   values. Link the decision record. For the cloud agent, commit `sigil add` files.

Test: every `copilot` command above appears in `copilot plugin --help` output or the
[CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference);
`npx prettier --check docs/setup/copilot.md`.

### 3. README `[inline: user-facing copy]`

- Add a `<details>` block after the Claude Code one, as the ADR requires: **GitHub Copilot: install
  packs as plugins**. The two commands, the `hook-*` and `mcp-filesystem` warning, a link to the setup
  page.
- Rewrite the **GitHub Copilot** bullet in "Claude Code, Copilot, and other tools": remove "There is no
  plugin channel, and no hooks or settings"; hooks install through `add`, packs from the marketplace,
  settings aren't supported.
- Point the "Use it with GitHub Copilot" row of "Who are you?" at `docs/setup/copilot.md`.

Test: `npx prettier --check README.md`; `grep -n 'no plugin channel' README.md` prints nothing.

### 4. `consuming.md`, `publishing.md`, `docs/index.md`, capabilities comment `[inline: user-facing copy]`

- `docs/guides/consuming.md:457-471`: split the `hook, settings` row. `hook` is merged into
  `.github/hooks/sigil.json`, skipped when `platforms: [claude]`; `settings` stays unsupported. Add a
  `workflow` row: written as a prompt file, `.github/prompts/`. Confirm the path against
  `COPILOT_WORKFLOW_SPEC` first. Replace "There is no Copilot plugin or marketplace channel yet" and the
  brief link with one sentence and a link to the setup page.
- `docs/guides/publishing.md:163`: sigil builds no Copilot plugin output; its Claude marketplace also
  loads in Copilot, with the limits on the setup page. `:184`: same point, link the setup page, not the
  brief.
- `docs/index.md`: add the `setup/copilot.md` row to the doc table, and update row S4, which says "no
  plugin channel".
- `src/targets/copilot/capabilities.ts:2-5`: the comment says the question is settled, with no `plugin`
  channel because sigil emits no Copilot plugin, and links the decision record.

Test: `grep -rn 'no plugin channel\|no Copilot plugin or marketplace\|There is no Copilot plugin' README.md
docs/guides docs/index.md src` prints nothing that's still false. `npm run build`, and
`git diff --exit-code docs/reference/capabilities.md` shows no change.

### 5. Amend the roadmap `[inline: plan edit]`

In `docs/plan-copilot-plugin-channel.md`: tick Phase 3. Remove `publishing.md`, `docs/index.md` row S4,
`README.md` and the `capabilities.md` regeneration from the Phase 4 scope. Correct the MCP claim in the
2b section (decision 4).

### 6. Mark generated hook and MCP plugins as Claude-only `[worker:medium]`

Files: `src/targets/claude-code/plugin-config.ts`, `test/targets/plugin-config.test.ts`, `CHANGELOG.md`.

In `configDescription`, append one constant sentence to every generated plugin's description, after the
environment-variable sentence: `As a plugin, this is for Claude Code only.`

Test cases, written first and failing:

| Case                                             | Expected                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `hook-protect-config` manifest description       | Ends with the sentence                                             |
| `mcp-filesystem` manifest description (no env)   | Catalog description, then the sentence                             |
| `mcp-ado` manifest description (env)             | `Requires the environment variables …` sentence, then the sentence |
| Marketplace entry for `mcp-filesystem`           | Same text as its `plugin.json`                                     |
| The catalog `description` of `shared/filesystem` | Unchanged, so `sigil add` output doesn't change                    |

The existing test near `test/targets/plugin-config.test.ts:190`, which reads the `mcp-filesystem`
description, may need its expected value updated. Change only that value.

Test: `npm test`, and `npm run catalog:build` followed by
`jq -r .description dist/claude/plugins/mcp-filesystem/.claude-plugin/plugin.json`. `CHANGELOG.md`, under
`[Unreleased]`, `### Changed`: generated hook and MCP plugins now say they're for Claude Code only.

### 7. Close-out `[inline: review]`

`npm run ci:local` green, `workflow-report .`, `/agent-skills:review`, PR, merge on green CI. Delete this
plan after merge. Without step 6 this PR changes no behaviour, so it needs no `CHANGELOG.md` entry.

## Success

- A reader of `docs/setup/copilot.md` can install a pack on Copilot CLI, and knows the five plugins to
  avoid and what to use instead.
- No doc still says Copilot has no plugin route, and no doc links the brief for it.
- Every behaviour the page states traces to the decision record, step 1, or a cited doc. Anything
  else is marked not tested.
- `npm run ci:local` green.
