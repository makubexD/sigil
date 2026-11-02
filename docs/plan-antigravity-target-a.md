# Plan: Antigravity Phase A, the setup note, and the small neutrality fixes

Phase A of [plan-antigravity-target.md](plan-antigravity-target.md), plus the small fixes from
[target-neutrality-regression-2026-11.md](decisions/target-neutrality-regression-2026-11.md) (V3, V4, V5, V6 and the
V1 doc line). They ship together because the setup note tells users to rely on what sigil writes for other tools, and
those bodies should be neutral before it does. The phase follows
[Rules for every target](reference/architecture.md#rules-for-every-target). Branch: `docs/antigravity-phase-a`.

## Decisions (settled from official docs and the roadmap's direction)

1. **V5, `feature` skill setup:** neutral prose and a link, not a new concept. The agent-skills project keeps its own
   per-tool setup guides, linked from its README's Quick Start
   ([addyosmani/agent-skills](https://github.com/addyosmani/agent-skills#quick-start)), and Antigravity has one there.
   Linking the project's own docs is ground rule 2 (cite the owner's docs) and the cheapest neutral option under ground
   rule 1. Copying commands per tool would go stale with each tool the catalog gains. The mode map becomes neutral
   (a read-only planning mode, then an edit mode), because the mode names differ per tool.
2. **V3, MCP bodies:** the descriptions say "your AI tool", and the per-tool destination lists go. `sigil add` already
   prints where it merged a server, and `docs/reference/config-kinds.md` holds the files and scopes for each tool.
3. **V4, authoring prompt:** point at `docs/reference/capabilities.md`, which `npm run build` generates, instead of a
   list of tools. A generated table cannot go stale.
4. **The setup note says only what a probe showed.** Phase A re-runs the P1/P2 check through `sigil add` itself
   (step 1), not with hand-written fixtures, so the note can say "checked with sigil's own output".

## Step 1: Probe: sigil's `agents-standard` output reaches Antigravity `[inline: probe of Antigravity's own loader; the worker is not the model under test]`

In a fresh `git init` repo under the scratchpad, never in this repo:
`npm run sigil -- add <one skill with uses.rules, one repo-wide rule> --target agents-standard --project-dir <repo>`.
Pick a skill and rule from `catalog/shared/` and add a codeword line to the installed `SKILL.md` and `AGENTS.md`
copies so an answer can't be guessed. Then run
`agy --model gemini-3.8-flash-low --output-format stream-json -p "<ask for the codewords, name the skill>"`.
Record: the `agy --version`, whether the `AGENTS.md` codeword and the skill codeword came back, and whether the skill
was picked by its description. Append the result as an `A1` row under a new `## Phase A` heading at the end of the
ADR's probe log (`docs/decisions/antigravity-target-2026-11.md`).

Test: the A1 row is in the ADR with the version; `npx prettier --check docs/decisions/antigravity-target-2026-11.md`.

## Step 2: `docs/setup/antigravity.md` `[inline: user-facing copy]`

A new setup page in the shape of `docs/setup/cursor.md` (H1 `# Antigravity: use Sigil rules and skills today`).
Sections:

- **What reaches Antigravity today:** `sigil add --target agents-standard` (or `--target codex`) writes
  `.agents/skills/` with each skill's rules inlined. `add` writes no `AGENTS.md` (A1): the root file with the
  repo-wide rules comes from `sigil build --target agents-standard`, copied from `dist/agents-standard/AGENTS.md` to
  the repo root. Antigravity loads both with no settings (ADR P1, P2, A1). The two targets share `.agents/skills/`,
  so pick one. Cite
  [Rules](https://antigravity.google/docs/rules#where-rules-are-stored) and
  [Agent skills](https://antigravity.google/docs/skills#cli-skill-locations).
- **What does not reach it:** nothing written for Claude Code (`CLAUDE.md`, `.claude/`, ADR P6). Rules scoped by
  `appliesTo` are not delivered as scoped rules yet: `agents-standard` inlines them into the skills that use them.
  Don't run `agy plugin import claude` on sigil's plugins: it imports every Claude plugin you have, and for sigil's
  the skills did not reach a session, the agents were skipped and the hooks never load (ADR U7).
- **Approvals in print mode:** `agy -p` cannot prompt, so a tool call with no allow rule is auto-denied. Allow it for
  one session with `--settings '{"permissions":{"allow":["write_file(*)"]}}'`, or in `settings.json`. Cite
  [Settings](https://antigravity.google/docs/settings#setting-up-preferences).
- **Limits:** always-on rules share a 20,000-token budget, and the largest are demoted past it (cite the Rules page).
  Keep `AGENTS.md` lean.
- **What a target will add:** one paragraph linking the roadmap's phases B-F (agents, MCP, scoped rules, hooks,
  plugin).
- **What was tested:** `agy` version, Linux, print mode, signed in with a Google account; the desktop app not checked.

Add a row to `docs/index.md` after the Cursor row:
`| [setup/antigravity.md](setup/antigravity.md) | Use Sigil rules and skills on Antigravity today, before its target ships |`.
Add a CHANGELOG `Unreleased` → `### Documentation` line naming the page.

Test: `npx prettier --check docs/setup/antigravity.md docs/index.md CHANGELOG.md`; every claim in the page has a
citation to antigravity.google or to an ADR probe id.

## Step 3: V3, neutral MCP bodies `[worker:medium]`

Files: `catalog/shared/mcps/filesystem.mcp.md`, `context-mode.mcp.md`, `maku-jam.mcp.md`, `ado.mcp.md`.

- In each `description:`, replace `Connects Claude Code (and Copilot) to` with `Connects your AI tool to`. Change
  nothing else in the description.
- In each body, replace the `**Install target:**` line and the two bullet lines under it (`- Claude Code: …` and
  `- Copilot (VS Code, Copilot CLI): …`) with this one paragraph:
  `**Install target:** \`sigil add\` merges the server into each tool's MCP file and prints where. The files and
  scopes per tool are in docs/reference/config-kinds.md.`
- Then run `npm run build`, which regenerates `catalog/README.md` from the descriptions; commit it too.

Test: `grep -rn 'Claude Code (and Copilot)\|Copilot (VS Code, Copilot CLI): merged' catalog/shared/mcps` prints nothing;
`npm run validate` passes; `npm test` passes (`test/catalog-readme.test.ts` included).

## Step 4: V4, the authoring prompt points at the capability table `[worker:medium]`

File: `catalog/shared/prompts/author-artifact.prompt.md`.

- Replace the quoted line `> Right now that means: Claude Code and GitHub Copilot (both support skill/agent/rule/prompt).`
  with `> Which AIs support which kind is listed in docs/reference/capabilities.md.`
- Delete the `**Platform kind support matrix** (reference):` line and the six-line table under it.
- Keep the `**Vocabulary note**` paragraph, but change its last sentence to
  `Never add sections for one AI — one body, multiple outputs.`

Test: `grep -n 'Claude Code\|GitHub Copilot\|For Claude only' catalog/shared/prompts/author-artifact.prompt.md`
prints only lines outside those three edits (list any it prints in the review); `npm run validate` and
`npm run -s sigil -- sync --check` pass.

## Step 5: V5, neutral setup in the `feature` skill `[worker:medium]`

Files: `catalog/shared/skills/feature/SKILL.md`, `catalog/shared/skills/feature/references/examples.md`.

- `SKILL.md`, the `**Dependency:**` bullet: keep its first sentence. Replace `In Claude Code they are namespaced
\`agent-skills:<name>\`; elsewhere they use the bare name.`with`Some tools namespace them as
  \`agent-skills:<name>\`.`Replace the three install sub-bullets (Claude Code, Copilot CLI, VS Code and other agents)
with one sentence ending the bullet:`If they aren't available in this session, say so, point to the install guide
  for the current tool in the project's README (https://github.com/addyosmani/agent-skills#quick-start), and stop.`
- `SKILL.md`, the `**Mode hints:**` bullet: change `has the mode map for Claude Code and VS Code.` to
  `has the mode map.`
- `references/examples.md`: change the intro to `Use your tool's read-only mode while deciding and its edit mode
while building; the names differ per tool.` Replace the mode-map table's `Claude Code` and `VS Code Copilot`
  columns with one `Mode` column: `Read-only (plan) mode` for phases 0-3, `Approve the plan, then switch to edit mode`
  for accepting it, `Edit mode` for phases 4-6. Keep the `Phase` and `Why` columns as they are.

Test: `grep -n 'Claude Code\|Copilot\|VS Code' catalog/shared/skills/feature/SKILL.md catalog/shared/skills/feature/references/examples.md`
prints nothing; `npm run validate` and `npm run -s sigil -- sync --check` pass (`family-skeleton` included).

## Step 6: V6 and V1's doc line `[worker:medium]`

Files: `catalog/shared/rules/cli-rules.rule.md`, `catalog/shared/rules/wizard-rules.rule.md`,
`docs/decisions/neutral-agent-vocabulary-2026-11.md`.

- In both rules, replace `(Copilot joins applyTo globs with commas, so brace sets can't be used)` (it wraps across a
  line) with `(some tools join globs with commas, so brace sets can't be used)`.
- In the vocabulary ADR, `## Out of scope`: replace `Each hook target already translates them in its \`hook-ops.ts\`;`with`Cursor translates them in its \`hook-ops.ts\`; Copilot and Codex pass them through, which their docs and
  probes accept;`.

Test: `grep -n 'Copilot joins' catalog/shared/rules/*.md` prints nothing; `npx prettier --check
docs/decisions/neutral-agent-vocabulary-2026-11.md`; `npm run validate` passes.

## Step 7: Close-out `[inline: review of the phase]`

- In the regression record, mark V3, V4, V5, V6 and the V1 doc line fixed, with this plan's path; V1, V2 and V7 stay
  open (V1/V2 are roadmap Phase H).
- In `docs/plan-antigravity-target.md`, mark Phase A done with the date.
- `npm run ci:local` must be green.

Test: `npm run ci:local`.
