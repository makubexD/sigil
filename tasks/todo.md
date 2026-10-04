# Catalog standard: task list

Status: M3: P1, T13, T11, T14 done; next T12 (doc re-verify results).

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
- [ ] ⚠ R1 Release minor

## Milestone 2: catalog standard and guards

- [x] T1 ADR
- [ ] V1 → moved to the end (needs a machine with a Copilot licence)
- [x] ⚠ T2 Delete the stray `add` file
- [x] T5 Prevent (import, new, move)
- [x] T6 Detect (`catalog-layout` rule)
- [ ] T13 → moved to M3 (V1 pending)
- [x] T7 Content fixes
- [x] ⚠ T8 ADO MCP env token and org scrub
- [x] T9 `cli-builder` pack
- [x] T10 Auditor lookup (P2)
- [x] Phase 5 review
- [ ] ⚠ R2 Release minor

## Milestone 3: provider conformance (branch `feat/catalog-standard-m3`)

- [x] P1 Commit the V1 probe to the repo with instructions (portable to another machine)
- [x] T11 Provider limits as spec data
- [ ] T12 Re-verify the cited docs
- [x] T14 Claude validator in CI
- [x] T13 Markdown links for skill references (docs-backed; V1 at the end confirms the backtick case)
- [ ] Phase 5 review

## Milestone 4: target-layer core (byte-identical)

- [ ] T16 Generic emitter
- [ ] T17 One provider registry
- [ ] Phase 5 review
- [ ] ⚠ R3 Release minor
- [ ] V1 Copilot reference-loading check on a licensed machine (user) → relax or keep the link rule; record in the ADR
- [ ] Phase 6 close-out
