# Plan: decide on a UI beyond the terminal

Source: `docs/ideas/ui-beyond-terminal.md`. Branch: `docs/plan-ui-beyond-terminal` (plan and steps on one PR).

This brief produces a decision, not a feature. Nothing ships to users from it. Every step is judgment work (comparing
options, writing a decision, scoping a follow-up) or a throwaway spike, so every step is inline.

## Evidence, re-verified on master (`b7e362a`, v0.6.0)

| Brief says                                                     | Today                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No HTTP server code in `src/`                                  | Still true.                                                                                                                                                                                                                                                                           |
| `build` writes `registry.json` (`src/commands/build.ts:60-65`) | Moved: `writeRegistry` at `src/commands/build.ts:91-97`; the shape is `RegistryEntry` in `src/registry.ts:24-36`.                                                                                                                                                                     |
| The registry carries descriptions, dependencies, kinds         | Partly. 167 artifacts, 147 KiB. Each has `id`, `kind`, `title`, `description`, `tags`, `platforms` (all six targets), `relatedArtifacts`, and `uses` for skills. **No pack membership, no body, no install command.** `language` is absent on shared artifacts.                       |
| The `add` command a page would show is stable                  | Recheck in step 1 (`sigil add <kind>:<id> --target <t> --yes`).                                                                                                                                                                                                                       |
| (not in brief) Other browsable surfaces already exist          | `catalog/README.md` (generated, describes the standard, not the artifacts); the Claude marketplace (`/plugin` in Claude Code browses packs); Antigravity plugins under `dist/antigravity/plugins/`. GitHub Pages is not enabled on the repo (`has_pages: false`); the repo is public. |

## Steps

### 1. Compare the options `[inline: judgment, the decision itself]`

Answer the brief's open questions from evidence, not guesses:

- Audience: who would use a non-terminal surface, given every install path ends in a CLI or an AI tool's own plugin
  UI? Check what each target's own UI already shows (Claude `/plugin`, Copilot, Cursor, Antigravity `agy plugin`)
  from their official docs.
- What a catalog page needs that `registry.json` lacks (packs, the `add` command per target, a body excerpt).
- For each option (static site from CI, local `sigil serve`, VS Code extension, generated Markdown index, none):
  effort, audience, maintenance cost, and what it adds over today.

Write `docs/decisions/ui-beyond-terminal-2026-11.md` with the table, the recommendation and why. Test:
`npx prettier --check docs/decisions/ui-beyond-terminal-2026-11.md`.

### 2. Spike the chosen option, if it is a generated site or index `[inline: throwaway, measures the decision]`

Only when step 1 recommends a static site or a generated index. A script in the session scratchpad (never committed)
reads `dist/registry.json` plus `packs.yaml` and writes pages into the scratchpad. Record in the decision: what was
missing from the registry, page count and size, and how long generation takes. Nothing from the spike is committed
except those findings. Skip this step, and say so in the decision, when step 1 recommends none or an extension.

### 3. Close out the brief `[inline: scoping a follow-up is design]`

- If the decision is "do it": write `docs/ideas/<option>.md` in the brief shape (Objective, Evidence, Out of scope,
  Success criteria, Riskiest assumption, Open questions) and add it to the table in `docs/ideas/README.md`.
- Delete `docs/ideas/ui-beyond-terminal.md`, remove its row from `docs/ideas/README.md`, and repoint every link to
  it at the decision (`grep -rn ui-beyond-terminal docs README.md CLAUDE.md`).

Test: `npm run ci:local` passes; `grep -rn 'ideas/ui-beyond-terminal' .` returns nothing outside `.git`.
