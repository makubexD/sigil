# Catalog standard: task list

Status: M1-M5 done (PRs #24-#35). C3a done (sections, severity scale). Open: C3b (P2 templates + cosmetic sweep), then the end block (live checks, one release).

Plan: `C:\Users\kiefer.fernandez\.claude\plans\let-s-execute-the-idea-ethereal-backus.md`
Spec: `SPEC.md`

⚠ marks a task that needs your approval before I start it.

## Milestone 1: safety net and security fixes (branch `feat/catalog-standard-m1`)

- [x] T0 Plan commit
- [x] N1 Output snapshot test (permanent, in-process)
- [x] N2 Frozen install fixture from master 8882c86, plus a migration test
- [x] N3 Smoke test that installs every pack
- [x] S1 An agent's `tools` list can't silently widen (`.min(1)`)
- [x] S2 No frontmatter injection through tool strings
- [x] S3 Reference files are scanned and the loader is hardened
- [x] T3 One table mapping each kind to its folder
- [x] T4 `src/catalog-layout.ts`
- [x] Phase 5 review (code-reviewer, docs-drift, security-auditor) — 6 fix commits

## Milestone 2: catalog standard and guards

- [x] T1 ADR
- [x] ⚠ T2 Delete the stray `add` file
- [x] T5 Prevent (import, new, move)
- [x] T6 Detect (`catalog-layout` rule)
- [x] T13 → done in M3 (Markdown links; V1 in the end block)
- [x] T7 Content fixes
- [x] ⚠ T8 ADO MCP env token and org scrub
- [x] T9 `cli-builder` pack
- [x] T10 Auditor lookup (P2)
- [x] Phase 5 review

## Milestone 3: provider conformance (branch `feat/catalog-standard-m3`)

- [x] P1 Commit the V1 probe to the repo with instructions (portable to another machine)
- [x] T11 Provider limits as spec data
- [x] T12 Re-verify the cited docs
- [x] T14 Claude validator in CI
- [x] T13 Markdown links for skill references (docs-backed; V1 at the end confirms the backtick case)
- [x] Phase 5 review

## Milestone 4: target-layer core (byte-identical)

- [x] T16 Generic emitter
- [x] T17 One provider registry
- [x] Phase 5 review

## Done after M4 (no decision needed)

- [x] Release gate = CI gate, SHA-pinned actions, one Claude CLI pin (PR #24)
- [x] `sigil status` reads config from its root; moved MCP config shows as outdated (PR #24)
- [x] One portable MCP builder for Claude and Copilot (PR #24)
- [x] New target `agents-standard`: Agent Skills in `.agents/skills` + AGENTS.md, CLI and wizard (PR #25)
- [x] `sigil status` notes skills Copilot loads twice (PR #26)

## Milestone 5: family skeleton standard, structure first (spec: `SPEC-family-standard.md`)

- [x] T0 Plan commit
- [x] A1 ADR "one family, one skeleton" + CLAUDE.md template-invariant amendment
- [x] A2 Families as data (`catalog/standard.yaml`: kind, explicit members, ordered sections, required keys, absent gaps)
- [x] A3 One vocabulary as data (`language.yaml` `prefix` + `stack`; `catalog-layout` validates)
- [x] A4 `family-skeleton` conformance check (divergent fixture fails)
- [x] A5 `catalog-symmetry` reads families from data (fixes the package-manager blind spot)
- [x] A6 (P1) Per-language descriptions name their language
- [x] S1 Pilot: debugger + generate-tests families, all three targets
- [x] C1 Declare every family and fit every member's structure
- [x] C2 (P1) Confirmed defects: copy errors, false/double `extends`, `.jsx` gaps, rule globs
- [x] C3a Every optional-section gap filled (sections now required); one severity scale as data, checked
- [ ] C3b (P2) Templates where shared text passes the threshold; cosmetic sweep
- [x] Phase 5 review (code + docs drift, fixed in PR #33); audit fix PR #34; CI speed PR #35 (Windows test step ~67 s → ~34 s)

## End block: before the release (development first; nothing here is dropped)

During development, only automated code tests gate the work: unit tests, the output snapshot,
the frozen install, `sync --check` and the CI validators. Everything below runs last, in this order.

**1. Live, E2E and integration checks**

- [ ] V1 Copilot reference-loading check on a licensed machine (user): relax or keep the link rule, and record the result in the ADR (probe in `docs/audits/2026-10-03/`)
- [ ] F4 Confirm live that VS Code and Copilot CLI expand `${NAME}` in `.mcp.json` (documented by GitHub's MCP JSON reference; not a blocker — a different answer is one `EnvSyntax` value). Also confirm a server without `tools` gets all its tools in Copilot CLI (`--tools` defaults to `*`)
- [ ] Install the `cli-builder` plugin once in Claude Code to confirm the auditor runs with `cli` preloaded

**2. Output-changing decisions (each needs a go)**

- [x] F1 Copilot MCP: portable files only (`.mcp.json`, `~/.copilot/mcp-config.json`), no fallback — decided 2026-10-04; `update` moves older installs
- [x] F2 `allowed-tools`: each tool's own docs — decided 2026-10-05. Claude keeps the list (its docs accept it); Copilot writes the spec's space-separated string (ADR provider baseline)
- [x] B1 Reviewer agents keep Bash (git diff, npm audit, tsc, madge) — decided 2026-10-05; their descriptions already say "read-only by instruction, not sandboxed". No output change
- [x] F3 Keep Copilot prompt files until Copilot skills gain arguments — decided 2026-10-05. Revisit when GitHub documents skill arguments; Agent Host users miss prompts until then

**3. Release and close-out**

- [ ] ⚠ Release minor (one release covering M1-M4 and the work after; includes the breaking ADO env vars). Needs: the npm package name (`sigil` was unpublished by someone else in 2024; maybe a scoped name) and the first manual publish from the owner's npm account
- [ ] Phase 6 close-out
