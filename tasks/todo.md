# Guided sigil — tasks (see SPEC-guided-sigil.md)

## cli-surface

- [x] T1 Root bare/help behaviour: exitOverride, handleFatal CommanderError, bare argv handled before parse (non-TTY stdout exit 0, typo → error). Verify: test/cli-root.test.ts
- [x] T2 Summaries + commander ^14 + groups + footer. Verify: cli-root + cli-flags + help-accuracy tests, full suite

## project-context

- [x] T3 Verify restore-of-missing command; fix status footer. Verify: test
- [x] T4 detectProjectContext + recommendNext. Verify: test/project-context.test.ts

## guided-verbs

- [x] T5 Installed picker step
- [x] T6 uninstall guided
- [x] T7 update guided (+ --yes)
- [x] T8 prune guided
- [x] T9 init guided

## home-menu

- [ ] T10 runHome + root wiring (TTY)
- [ ] T11 Browse/search/author routes

## docs

- [ ] T12 Docs, cli-flags regen, CHANGELOG, retire briefs, cleanup of SPEC/map/tasks, ci:local, PR
