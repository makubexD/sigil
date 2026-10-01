# Guided sigil — tasks (see SPEC-guided-sigil.md)

## cli-surface

- [x] T1 Root bare/help behaviour: exitOverride, handleFatal CommanderError, bare argv handled before parse (non-TTY stdout exit 0, typo → error). Verify: test/cli-root.test.ts
- [x] T2 Summaries + commander ^14 + groups + footer. Verify: cli-root + cli-flags + help-accuracy tests, full suite

## project-context

- [ ] T3 Verify restore-of-missing command; fix status footer. Verify: test
- [ ] T4 detectProjectContext + recommendNext. Verify: test/project-context.test.ts

## guided-verbs

- [ ] T5 Installed picker step
- [ ] T6 uninstall guided
- [ ] T7 update guided (+ --yes)
- [ ] T8 prune guided
- [ ] T9 init guided

## home-menu

- [ ] T10 runHome + root wiring (TTY)
- [ ] T11 Browse/search/author routes

## docs

- [ ] T12 Docs, cli-flags regen, CHANGELOG, retire briefs, cleanup of SPEC/map/tasks, ci:local, PR
