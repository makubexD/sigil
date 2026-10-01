# Home menu for bare `sigil`

## Objective

Running `sigil` with no arguments in an interactive terminal opens a home menu (install, update,
uninstall, status, prune) that hands off to the matching command or wizard. Outside a TTY it keeps
printing help. Non-terminal users get one entry point instead of memorising verbs. Output is
target-neutral: the menu only routes; targets are chosen inside each flow.

## Evidence

- `src/cli.ts:37-42` builds `program` (name, description, version) with no `.action(...)`; the file
  ends at `src/cli.ts:392` with `program.parseAsync(process.argv)`. Verified by running
  `node dist-cli/cli.js`: it prints `Usage: sigil [options] [command]` and exits 0.
- `src/wizard/types.ts:49-51` defines `isInteractiveTTY()` (stdin and stdout both TTY); it is the
  existing TTY gate.
- Wizards exist only for `add`, `new`, `edit`: `src/wizard/add.ts`, `new.ts`, `edit.ts`, sharing
  `src/wizard/engine.ts`. Registry rules are in `src/wizard/CLAUDE.md`.
- `src/commands/add/resolve-inputs.ts:25` already errors with "not an interactive terminal" when
  selectors are missing and no TTY, so the TTY pattern is established.
- Update/uninstall/prune/status have no menu entry because they have no wizard; see
  [wizard-update-uninstall](wizard-update-uninstall.md).

## Out of scope

- Building the update/uninstall/status/prune wizards (separate brief); the menu may call the plain
  commands until those exist.
- A GUI or web UI ([ui-beyond-terminal](ui-beyond-terminal.md)).
- Changing any existing command's flags or non-TTY behaviour.

## Success criteria

- In a TTY, `sigil` shows a menu with install, update, uninstall, status, prune, and quit.
- Each choice runs the same code path as `sigil <verb>` (no duplicated logic).
- Non-TTY `sigil` still prints help and exits 0 (test with piped stdin).
- `sigil --help` and `docs/reference/cli-flags.md` stay accurate and machine-independent.
- Unit test for the TTY and non-TTY branches; README and `docs/guides/consuming.md` mention the menu.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That commander lets a root-level default action coexist with subcommands and `--help` without
changing existing exit codes or completion behaviour (`__complete`, `src/cli.ts:374`).

## Open questions

- Does the menu detect an existing `.sigil/manifest.json` and hide update/uninstall when absent?
- Should `sigil` in a catalog checkout also offer author verbs (`new`, `check`)?
- Is the menu worth it before the update/uninstall wizards exist?
