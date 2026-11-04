# Plan: OpenCode target, Phase A (setup note)

Part of the [roadmap](plan-opencode-target.md). The [evaluation](decisions/opencode-target-2026-11.md) proved that
`agents-standard` output already reaches OpenCode. This phase says so for users, with the limits, and writes no code. It
ships whatever Phase B finds. Everything stated is V1 (`opencode-ai`), because nothing has run on V2.

Live checks use a free OpenCode model from the isolated home in the ADR's D0, never `~/.config/opencode/`, and never an
Anthropic provider.

## Step 1: Setup page `[inline: user-facing copy]`

Create `docs/setup/opencode.md`, with the header and back links of `docs/setup/antigravity.md`. There is no `opencode`
target yet, and the page opens by saying so. Sections:

- **What reaches OpenCode.** `sigil add --target agents-standard <selector>` writes `.agents/skills/`, each skill with its
  rules inlined. OpenCode lists them and picks them by description (P2, P7). Skills installed for `codex` or `antigravity`
  are the same files, so they already reach it, and `add` refuses a second owner: say to keep the existing one.
- **Repo-wide rules.** `add` writes no `AGENTS.md`. Show the route that does: `sigil build --target agents-standard
--out-dir <dir>`, then copy `<dir>/agents-standard/AGENTS.md` to the project root. Say that this copy has no manifest, so
  `status` and `update` don't see it, and that a project with its own `AGENTS.md` must merge, not overwrite.
- **What doesn't reach it.** Agents, prompts, MCP servers, hooks and settings. `.claude/agents/` isn't read.
- **With Claude output.** Three facts from P1 and P7: a skill in both `.agents/skills/` and `.claude/skills/` gives one
  entry with one body, and which one isn't fixed; a skill marked for the user only in Claude is offered to the model; a
  `CLAUDE.md` is read when there is no `AGENTS.md`. The same goes for user-level `~/.claude/skills/` and
  `~/.claude/CLAUDE.md`, so a user-scope Claude install reaches every project. Give the fix with its effect:
  `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` hides those skills, and `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` stops the
  `CLAUDE.md` fallback.
- **No `.env` guard.** sigil installs no hook on OpenCode. OpenCode's own default asks before a `read` of `.env`, but that
  rule doesn't cover the shell (P4). Point to OpenCode's permission docs, and don't promise more.
- **What was tested.** OpenCode 1.19.4, one free model, date 2026-11-03. Not tested on OpenCode 2.

Don't copy the ADR's tables, and link to its Probe log instead. Plain, short sentences; no plan or probe ids in the prose
except in "What was tested".

Test: `npx prettier --check docs/setup/opencode.md`, then this prints nothing, and each `#heading` link is read by hand
(the repo has no link checker):

```bash
for l in $(grep -oE '\]\([^)#]+' docs/setup/opencode.md | cut -c3- | grep -v '^http'); do
  test -e "docs/setup/$l" || echo "BROKEN $l"
done
```

## Step 2: Link the page `[inline: user-facing copy]`

Three small edits. `docs/guides/consuming.md` stays as it is: it links no other tool's setup page.

- `docs/index.md`: a row after `setup/antigravity.md`, in that table's form.
- `README.md`: under "Other tools", one sentence naming OpenCode and linking the page. Don't call it a target.
- `CHANGELOG.md`: under `## [Unreleased]`, a `### Documentation` entry for the page.

Test: `npx prettier --check README.md docs/index.md CHANGELOG.md`.

## Step 3: Check the page live `[inline: probes OpenCode's own loader and model behavior]`

Follow the page's commands exactly, in a fresh throwaway repo under the scratchpad, with sigil built from this branch
(`npm run build`) and OpenCode from an isolated home.

| Case | Do                                                                                             | Pass                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | `sigil add --target agents-standard` for one skill                                             | `opencode debug skill` lists it from `.agents/`      |
| 2    | The page's `build` and copy route                                                              | The model quotes a heading from the root `AGENTS.md` |
| 3    | Add the same skill for `claude`, then list                                                     | One entry                                            |
| 4    | Same, with `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`                                             | The `.claude` copy is gone and `.agents` remains     |
| 5    | `CLAUDE.md` only, with `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1`                                 | Its instruction isn't followed                       |
| 6    | A skill in the isolated home's `.claude/skills/`, then list, then repeat with the variable set | Listed, then gone                                    |

A case that disagrees with the page is fixed in the page, in this step.

Test: all six pass. The full suite runs once, in the finish.
