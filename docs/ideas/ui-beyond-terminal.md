# UI beyond the terminal (decide if worth doing)

## Objective

Decide whether sigil should offer something non-terminal users can use: most likely a static
catalog browser site generated from the catalog, where each artifact page shows its description,
dependencies and a copy-able `sigil add ...` command. The output of this brief is a decision and, if
positive, a scoped follow-up. Nothing ships from this brief itself.

## Evidence

- No GUI or server exists: a search of `src/` for HTTP server code (`createServer`, `http.listen`,
  `express`, `node:http`) finds only prose matches in `src/wizard/engine.ts:15` and
  `src/wizard/CLAUDE.md`, no server code.
- All interaction is CLI or terminal wizard: `src/wizard/` plus `isInteractiveTTY()`
  (`src/wizard/types.ts:49-51`).
- Data for a browser already exists: `sigil build` writes `registry.json` (`src/commands/build.ts:60-65`,
  an artifact list) and `sigil list`, `sigil get <id>`, `sigil search <query>` read the catalog
  (`src/cli.ts:79-97`).
- The command a page would show is stable: `add` prints "Repeat non-interactively:
  `sigil add skill:shared/hello --target copilot --yes`" (verified by running it).

## Out of scope

- Hosting a service or accounts; a static site only.
- Editing artifacts in the browser.
- A VS Code extension or desktop app (list as alternatives only).

## Success criteria

- A short comparison of options (static site, VS Code extension, local `sigil serve` page, none)
  with effort, audience and maintenance cost.
- A recommendation recorded in `docs/decisions/`; if "do it", a follow-up brief for the chosen option.
- If static site: a spike generating pages from `registry.json` for the bundled catalog, with the
  generated pages not committed.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That non-terminal users exist who would install an npm CLI at all; a site whose command still must
be pasted into a terminal may not help them.

## Open questions

- Is the audience "people choosing artifacts" (a browser suffices) or "people who never open a
  terminal" (needs a real installer)?
- Does `registry.json` carry enough (descriptions, dependencies, kinds) or does the site need the
  resolved catalog?
- Where would it be hosted (GitHub Pages from CI, alongside the marketplace)?
- Should a team's own catalog be able to generate its own site?
