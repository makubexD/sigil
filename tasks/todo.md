# Catalog standard: task list

Status: M1 merged (#18, 2497e00); R1 release deferred until after M2 (user). M2 on feat/catalog-standard-m2: T1 done; next V1 prep + T5.

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
- [ ] V1 Reference-link check (you, in VS Code)
- [ ] ⚠ T2 Delete the stray `add` file
- [ ] T5 Prevent (import, new, move) — T5a done
- [ ] T6 Detect (`catalog-layout` rule)
- [ ] T13 Markdown links, only if V1 needs them
- [ ] T7 Content fixes
- [ ] ⚠ T8 ADO MCP env token and org scrub
- [ ] T9 `cli-builder` pack
- [ ] T10 Auditor lookup (P2)
- [ ] Phase 5 review
- [ ] ⚠ R2 Release minor

## Milestone 3: provider conformance

- [ ] T11 Provider limits as spec data
- [ ] T12 Re-verify the cited docs
- [ ] T14 Claude validator in CI
- [ ] Phase 5 review

## Milestone 4: target-layer core (byte-identical)

- [ ] T16 Generic emitter
- [ ] T17 One provider registry
- [ ] Phase 5 review
- [ ] ⚠ R3 Release minor
- [ ] Phase 6 close-out
