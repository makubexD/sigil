# Import from a Copilot `.github/` layout

## Objective

`sigil import` accepts a project that already has Copilot customisations
(`.github/instructions/*.instructions.md`, `.github/agents/*.agent.md`, `.github/skills/`,
`.github/prompts/*.prompt.md`) and converts them into catalog artifacts, the way it does for
Claude-style folders. Used by teams adopting sigil from an existing Copilot setup. Output: catalog
source files; targets are unchanged.

## Evidence

- `src/authoring/import/discover.ts:1-12` documents recognising only `rules/`, `agents/` and
  `skills/<name>/SKILL.md` in a "portable Claude template directory"; anything else is
  `unrecognised`.
- `src/cli.ts:206-209` registers `import <source-dir>` with `.requiredOption('--language <lang>')`,
  so even shared (language-less) imports must name a language.
- `src/authoring/import/translate-shared.ts` and `translate.ts` hold per-kind translators
  (CLAUDE.md names them as the places new translators go).
- No Copilot-layout discovery exists: a search of `src/authoring/import/` finds no `.github` reference.
- The Copilot emitters show the layouts to invert: `.github/agents/<name>.agent.md`
  (`src/targets/copilot/spec/agent.ts:57`); read the other `spec/*.ts` files for the rest.

## Out of scope

- Importing from Cursor, Codex or other layouts.
- Importing hooks or settings.
- Round-trip fidelity beyond the fields the Copilot specs map.

## Success criteria

- `discover` recognises the Copilot paths and reports them by kind; unknown files stay
  `unrecognised`.
- Translators map Copilot frontmatter (`applyTo`, agent `tools`) to catalog fields (`appliesTo`,
  `tools`) without hardcoded provider text leaking into bodies (lexicon invariant).
- `--language` becomes optional (or `shared` is accepted) and `--dry-run` previews coverage.
- Round-trip test: `add --target copilot` into a scratch project, `import` it back, diff the catalog.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That Copilot files carry enough structure to infer an artifact `id` and kind; instructions files
have no `name`, so ids must come from filenames.

## Open questions

- How should `.github/copilot-instructions.md` and `AGENTS.md` (single files, many rules) be split?
- Auto-detect the layout, or require a `--from claude|copilot` flag?
- Should import also handle a Claude project's `.claude/` directly (it takes a template dir now)?
