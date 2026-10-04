# Catalog standard: task list

Status: M4: T16 done; next T17 (one provider registry).

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
- [ ] T17 One provider registry
- [x] Phase 5 review

## End block: before the release (development first; nothing here is dropped)

During development, only automated code tests gate the work: unit tests, the output snapshot,
the frozen install, `sync --check` and the CI validators. Everything below runs last, in this order.

**1. Live, E2E and integration checks**

- [ ] V1 Copilot reference-loading check on a licensed machine (user): relax or keep the link rule, and record the result in the ADR (probe in `docs/audits/2026-10-03/`)
- [ ] F4 Verify that Copilot CLI expands `${NAME}` in `.mcp.json` (with V1, on the licensed machine)
- [ ] Install the `cli-builder` plugin once in Claude Code to confirm the auditor runs with `cli` preloaded

**2. Output-changing decisions (each needs a go)**

- [ ] F1 Copilot MCP: write only the portable `.mcp.json`, or keep `.vscode/mcp.json` behind an option (VS Code deprecates it)
- [ ] F2 `allowed-tools`: follow the Agent Skills spec's space-separated form once a provider requires it
- [ ] F3 Migrate Copilot prompts to skills once Copilot skills gain arguments (Agent Host no longer loads prompt files)

**3. Release and close-out**

- [ ] ⚠ Release minor (one release covering M1-M4; includes the breaking ADO env vars)
- [ ] Phase 6 close-out
