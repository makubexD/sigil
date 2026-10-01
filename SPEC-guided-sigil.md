# Spec: Guided sigil

Approved plan: `~/.claude/plans/let-s-review-the-whole-cryptic-liskov.md` (condensed here).

## Objective

A zero-knowledge user runs `sigil` (or `npm run sigil`) and is guided according to the state of
the current directory. Help works on every console, is grouped and short, and the docs say how to
get help and see defaults. Audience: anyone who installs artifacts, plus catalog authors.

## Commands

```
Build:  npm run build
Test:   npm test                       (pretest builds)
One:    npm run build && npm run build:test && node --test test-compiled/<path>.test.js
Gate:   npm run ci:local
Try:    node dist-cli/cli.js  (in a scratch dir)   |  npm run sigil -- <args>
```

## Structure

```
src/cli.ts                      Commander wiring (+ root action, groups, summaries, footer)
src/cli-error.ts                single exit point (handleFatal) — learns CommanderError
src/project-context.ts          detectProjectContext, recommendNext (pure)
src/wizard/home.ts              runHome (injectable actions)
src/wizard/steps/installed/     shared installed-artifact picker
src/commands/{uninstall,update,prune,init}.ts   gain guided input resolution
test/cli-root.test.ts, test/project-context.test.ts, test/wizard/{home,verbs}.test.ts
```

## Code style / testing

Match neighbours: `node:test` + `assert/strict`, import from `../dist-cli`, `withTempDir`,
`mockClack`. DAMP tests, `should …` names. TDD: failing test first, one commit per task.

## Boundaries

- Always: non-TTY behaviour of every existing command unchanged (except bare `sigil` → stdout, exit 0);
  `--project-dir` never anchors on `PKG_ROOT`; one exit via `handleFatal`; menu calls `run*`, never duplicates logic.
- Ask first: manifest format, drift semantics, flag set of `add`/`build`/`release`.
- Never: `process.exit` in new code; remove failing tests.

## Modules and success criteria

### cli-surface

- `program.exitOverride()`; help/version set exit code and return so stdout drains (the `npm run sigil help` prints-nothing bug on Windows). `handleFatal` keeps CommanderError exit codes without re-printing.
- `.summary()` on long-description commands; commander upgraded to ^14 for `.helpGroup()` (fallback: no groups).
- Groups: Start here / Browse the catalog / Author the catalog / Build & release.
- Root footer: `sigil` = guided menu; `sigil <cmd> --help` shows options and defaults; `npm run sigil -- <args>`.
- Root action: non-TTY no args → help on stdout, exit 0; stray operand (`sigil instal`) → exit 1 with suggestion. TTY → home menu (help until that module lands).
- Tests: bare/help/--help → stdout, exit 0, empty stderr; `instal` → exit 1 + "Did you mean"; each root command line ≤ 120 cols; footer has `npm run sigil --`. cli-flags/help-accuracy tests parse commands under any group heading.

### project-context

- `detectProjectContext(dir)`: detectedTargets[] (no silent fallback), manifest counts per target, health counts (drifted/missing/orphaned/template-outdated), isCatalogCheckout, looksLikeProject, isHomeDir.
- `recommendNext(ctx)`: ordered actions with reasons (no target → set up; nothing installed → install; missing → restore; drifted → review; orphaned → clean up; catalog checkout → warn + change folder).
- Precondition: verify which command restores a missing whole-file artifact; fix the `status` footer ("Run sigil update") if wrong; recommendations name the command that works.

### guided-verbs

- Shared picker of installed entries (state hints, "required by X").
- `uninstall [ids...]`: no ids + TTY → picker + existing confirm; no ids + non-TTY → SigilError with hint.
- `update`: TTY, no `--yes`/`--dry-run` → preview, then confirm (drifted asks before forcing). Add `--yes`.
- `prune`: TTY, no `--apply`/`--json` → preview, then "Apply cleanup?".
- `init`: `--target` optional; TTY → select with detected preselected; non-TTY → SigilError.
- Each flow prints an "Equivalent command:" line. Tests with `mockClack` incl. one cancellation (no writes).

### home-menu

- `runHome(dir, actions)`; header (folder · target · installed · health); recommended entry first; Use / Browse (list, search→get→install) / Author (checkout only) / Change folder / Show commands / Quit; unavailable entries hidden or disabled with reason; loop re-detects context; SigilError → `log.error` + hint, back to menu; Ctrl+C at menu → exit 0.

### docs

- README quick start + "Getting help" box; consuming.md wizard/menu rewrite + "Getting help and defaults"; index support matrix; troubleshooting entries; cli-flags regenerated; `src/wizard/CLAUDE.md`; CHANGELOG `[Unreleased]`; retire the two absorbed briefs.

## Success criteria (whole)

`npm run ci:local` green; user confirms `npm run sigil help` prints in PowerShell; scratch-project walkthrough matches the docs; CI green on both OS jobs.

## Open questions

- Does `exitOverride` fully fix the Windows output loss? (Verify with the user's console.)
- Commander 14 behaviour changes (excess args) — gated by the suite.
