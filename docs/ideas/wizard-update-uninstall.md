# Wizards for update, uninstall, status, prune and init

## Objective

Interactive wizards for the consumer verbs that today need flags or ids: pick installed artifacts
from the manifest to update or uninstall, preview drift, confirm, then run the existing command
logic. `init` asks for its target instead of requiring `--target`. Installed through the normal
`sigil <verb>` entry (and the [home menu](home-menu-wizard.md)); output per target is unchanged.

## Evidence

- Wizard files exist for `add` (`src/wizard/add.ts`, `src/wizard/steps/add/`), `new`
  (`src/wizard/new.ts`, `src/wizard/steps/new/`) and `edit` (`src/wizard/edit.ts`) only; there is
  no update, uninstall, status, prune or init wizard under `src/wizard/`.
- `src/cli.ts:259` registers `uninstall <ids...>`: ids are a required argument.
- `src/cli.ts:126-128` registers `init` with `.requiredOption('--target <name>', ...)`.
- `src/cli.ts:230`, `220`, `243` register `update [ids...]`, `status`, `prune` as flag-driven only;
  `prune` previews by default and needs `--apply` (in its option list, `src/cli.ts:243-257`).
- `src/wizard/CLAUDE.md:173` records "Search deferred": a `Search by keyword` entry is wanted once a
  kind exceeds ~30 items; not implemented.
- `src/wizard/types.ts:49-51` provides `isInteractiveTTY()`.

## Out of scope

- The bare-`sigil` home menu ([home-menu-wizard](home-menu-wizard.md)).
- Changing manifest format or drift semantics (`classifyConfigDrift`, `replaceMerge`).
- Web or GUI front ends.

## Success criteria

- `sigil uninstall` with no ids in a TTY lists manifest entries (with dependents shown) and
  uninstalls the multi-selection through the existing refcount-aware code.
- `sigil update` with no ids in a TTY shows the update preview and asks before writing.
- `sigil init` with no `--target` in a TTY asks for claude or copilot; non-TTY still errors.
- Non-TTY invocations are unchanged (existing tests pass untouched).
- Keyword search entry added to the add wizard or explicitly re-deferred in `src/wizard/CLAUDE.md`.
- `docs/guides/consuming.md` and `src/wizard/CLAUDE.md` updated in the same change.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That the existing command implementations separate input resolution from execution cleanly enough
for a wizard to supply inputs, the way `add` does via `fromWizardResult`.

## Open questions

- One generic "pick installed artifacts" step shared by update/uninstall, or per-verb steps?
- Should the wizard show the fragment diff for config kinds (ADR follow-up in
  [distribution-channels-2026-09](../decisions/distribution-channels-2026-09.md) section 7)?
- Does `status` need a wizard at all, or only a better default render?
