# agent-skills (addyosmani/agent-skills) - recon profile

Repo: v0.6.13, commit aeac41d (2026-10-13), 702 commits, MIT. Read-only analysis. **fact** = read with path:line; **inference** = my reading.

**Sampling disclosure.** Read fully or nearly so: AGENTS.md, CLAUDE.md, LICENSE, manifests, 4 persona files (web-performance-auditor first 80 lines + greps), 8 commands, and the skills using-agent-skills, spec-driven-development, planning-and-task-breakdown, incremental-implementation, test-driven-development, code-review-and-quality, code-simplification, constraint-driven-development. Partly read (headings plus key sections): doubt-driven, context-engineering, security-and-hardening, performance-optimization, debugging, api-and-interface-design, frontend-ui-engineering, source-driven, interview-me. Headings only: shipping, git-workflow, ci-cd, observability, deprecation, documentation, browser-testing, idea-refine bodies, the root `references/` checklists, and the nine `docs/*-setup.md`. Validators: headers plus `skill-lint.js` config. Hooks: docs plus script heads. The context-mode MCP failed to connect, so I used Bash.

## 1. Purpose and users
A skill pack of 25 process-first `SKILL.md` workflows, 4 personas, 9 slash commands, 3 hooks and 7 shared checklists, for "senior software engineers" using AI coding agents (AGENTS.md:9). It targets the whole lifecycle with explicit anti-shortcut machinery. The README says agents "default to the shortest path" and skip specs, tests and reviews (README.md:374). Users are developers on Claude Code first. Codex, Gemini CLI, Antigravity, OpenCode, Copilot, Cursor and Windsurf follow (README.md:360-364).

## 2. Architectural model
- **Authoring (fact):** markdown only. Each skill is `skills/<kebab>/SKILL.md` with `name`+`description` frontmatter and fixed sections Overview, When to Use, Process, Common Rationalizations, Red Flags, Verification (docs/skill-anatomy.md:44-80). Frontmatter is limited to spec keys (scripts/lib/skill-lint.js:45-52).
- **Composition:** skills cross-reference by name, never copy ("Don't duplicate content between skills", docs/skill-anatomy.md:189). Shared checklists sit in root `references/`. Single-use ones sit inside the skill (docs/skill-anatomy.md:126). Three layers: skills (how), personas (who), commands (when) (AGENTS.md:74-76). Personas never call personas (AGENTS.md:78).
- **Distribution:** one `skills/` tree plus per-host adapters. Claude plugin and marketplace, Codex plugin, Gemini TOML, Antigravity TOML, an OpenCode symlink (`.opencode/skills` is mode 120000) and prose setup docs. `validate-versions.js` keeps 5 manifests at one version.
- **Activation:** description match is the main router. Commands are explicit. Hooks are optional and not wired by the plugin (hooks/session-start.sh:4-8). The path-scoped rule `.claude/rules/skills-contributing.md:2-4` fires only on `skills/**`.
- **Precedence (fact):** user-level `.claude/agents` personas override the plugin's (.claude/commands/ship.md:26). There is no overlay system beyond that. Per-agent model/tool controls are deliberately left out of shared files (docs/advanced-per-agent-configuration.md:11).

## 3. Languages and frameworks (see coverage.tsv)
Language-neutral procedure with TypeScript/JS/React examples. C# has no mentions at all (grep of skills/agents/references: 0). Angular appears in one persona bullet (agents/web-performance-auditor.md:97) and one detection hint. Python gets a simplification example, mypy/ruff/pytest-cov names and a Django docs example. Node is covered through security and supply chain (lockfile, install-script gate, audit triage; skills/security-and-hardening/SKILL.md:135-140). Deepest areas: TypeScript testing and security, React performance and accessibility.

## 4. SDD lifecycle (idea to ship)
| Stage | Driver | Writes to disk | Gate / enforcement |
|---|---|---|---|
| Idea | interview-me, idea-refine | optional `docs/intent/<topic>.md` (interview-me:129), `docs/ideas/` via script | Stop-turn rule after confirmed intent (interview-me:124-130); 95% test (:136). Advisory. |
| Spec | `/spec`, spec-driven-development | `SPEC.md` at root (spec.md:17); with Phase 0 a capability map plus `SPEC-<module-id>.md` (spec skill:65) | "STOP YOUR TURN IMMEDIATELY... Planning starts only after the human approves the spec in a later turn" (spec skill:170-174). Advisory text. |
| Plan | `/plan`, planning skill | `tasks/plan.md`, `tasks/todo.md` (planning:33,145-148) | Read-only plan mode (:26-33), human review (:253), never overwrite an incomplete plan (:150-155). Advisory. |
| Tasks | same skill | `tasks/todo.md` checklist, or an external tracker with plan.md as index (:161-164) | Acceptance + verify per task, ~5-file limit, checkpoints each 2-3 tasks (:112, :251). Advisory. |
| Implement | `/build`, incremental + TDD | code, tests, one commit per slice | `/build auto` is the only stateful gate: needs spec at a known path, clean `git status --porcelain`, an unambiguous "approve", then stop on ambiguity or irreversible steps (build.md:31-42). Still prompt-executed. |
| Verify | `/test`, TDD, debugging | failing test, then fix | Prove-It: reproduction test must fail first (TDD:98-117). Definition of Done checklist (references/definition-of-done.md:17-51). Advisory. |
| Review | `/review`, code-simplify, doubt-driven | none (a report) | Five axes; Critical blocks (code-reviewer.md:94). |
| Ship | `/ship`, shipping skill | none (GO/NO-GO report) | Parallel fan-out, default NO-GO on any Critical, rollback plan mandatory (ship.md:68-72). |

**Enforced vs advised (fact/inference).** Nothing blocks the next stage mechanically. No hook enforces a gate, and the shipped hooks cover only session-start, WebFetch caching and simplify-ignore. CI enforces only that producers and consumers agree on artifact path *strings* (scripts/validate-artifact-paths.js:4-9) and that skills are well-formed. Gate behaviour is measurable only through opt-in behavioral evals (spec eval "No implementation code is written", evals/cases/spec-driven-development.json). **Versus plain "plan then code":** adds assumption blocks (using-agent-skills:51-61), a fixed spec (objective, commands, structure, style, tests, three-tier boundaries), human gates per phase, per-task acceptance+verification, a standing Definition of Done, severity-labeled review and a fan-out ship check. It also adds ceremony. The spec skill skips only single-line or unambiguous fixes (spec:20) and applies to anything over 30 minutes (:18). `AGENTS.md:51` demands a skill check "even 1% chance". **Inference:** that is heavy for small tasks and is the main over-process risk.

## 5. Personas
Four files with frontmatter `name`+`description` only, so **no tool restrictions or model fields** (agents/code-reviewer.md:1-4; limits acknowledged in docs/advanced-per-agent-configuration.md:5). Each ends with a Composition block, enforced by lint (skill-lint.js:554-580).
- **code-reviewer:** five axes. Severity Critical / Required / Optional / Nit (:51-57). Template has verdict APPROVE | REQUEST CHANGES, file:line findings, "What's Done Well", Verification Story (:61-87).
- **security-auditor:** six scopes incl. AI/LLM. Severity table Critical to Info with action per tier (:59-65). Report has counts, location, impact, proof of concept, recommendation (:69-95). STRIDE per trust boundary (:106).
- **test-engineer:** test-level decision, Prove-It, scenario table, priority Critical to Low (:20-79). "A test that never fails is as useless as a test that always fails" (:89).
- **web-performance-auditor** (12 KB): quick vs deep mode; "Never fabricate metrics" (:43).
Inconsistency (fact): the review skill labels no-prefix/Critical/Nit/Optional/FYI (code-review-and-quality/SKILL.md:183-189) while persona and command use "Required".

## 6. Code-quality guidance (quoted)
- Concept counting: "Count the concepts a reader must hold to follow the change." (code-review-and-quality:60). Red flag at :380.
- Simplicity: "If you build 1000 lines and 100 would suffice, you have failed." (using-agent-skills:95). "Three similar lines of code is better than a premature abstraction." (incremental:113).
- Scope: "note it - don't fix it" with a NOTICED BUT NOT TOUCHING template (incremental:126-133).
- Change size: ~100 / 300 / 1000 lines (code-review:108-110); file-size watch ~1000 lines (:113).
- Verification sections: the lint requires Overview, When to Use, Common Rationalizations, Red Flags and Verification (skill-lint.js:75-81). The Verification section is a checkbox exit list.
- Test the tests: invert one condition, run, restore (code-review:164).
- Fail-silent hygiene: "silent fallbacks that paper over an unclear invariant" (:62), but debugging's own example returns `DEFAULTS[key] ?? ''` (debugging:224). Contradiction.
- Behavior-change guard: "Simplification that requires modifying tests to pass" is a red flag (code-simplification:311), yet its examples drop `return await` (:195) and use `||` (:211).

## 7. Hooks, commands, validators
- **Hooks (fact):** simplify-ignore (3 events, placeholder rewriting, 37 shell assertions), sdd-cache (ETag-revalidated WebFetch cache, 30 assertions), session-start (injects the 10 KB meta-skill). All need manual settings.json wiring and jq.
- **Commands:** 9 wrappers in three copies (.claude md, .gemini toml, commands toml). `validate-commands.js` checks existence and *description equality only* (header comment: bodies differ intentionally).
- **Repo tests (fact):** about 167 `node:test` cases across 7 files. They test the validators and the eval runner (structure/consistency), not skills' behavior. CI also runs on macOS and Windows (workflow `validate-platforms`).
- **Evals:** Tier 2 deterministic TF-IDF routing over descriptions (91 positive, 52 negative prompts, near-duplicate detection, `--min-rank1 95`). Tier 3 behavioral through headless claude (34 evals: 29 execution, 5 dialogue; 25 fixture sets), opt-in. Plugin evals with/without the plugin (5 cases). Result files are gitignored, so published numbers are narrative: a description clause raised review-skill fires from 7/27 to 21/27 and TDD from 6/24 to 19/24 on pinned runs (evals/README.md:53-55). The rejected-change ledger is empty (evals/skill-impact.md).

## 8. Token implications
- Always loaded: 25 skill descriptions = 8,858 bytes, 4 persona descriptions ~754 chars, 9 command descriptions. CLAUDE.md and AGENTS.md (9.4 KB) are contributor-only.
- On demand: SKILL.md total 343 KB, 25 files, mean 13.7 KB, max 21 KB, max 399 lines (limit warns at 500, skill-lint.js:37). References total ~100 KB and load only when reached (security-and-hardening:77 says "Open the section you need when you reach that code, not before").
- Costly paths: `/ship` (3 subagent contexts plus merge), doubt-driven (up to 3 fresh reviews plus optional cross-model), session-start hook (+10 KB per session).
- Duplication (inference): simplicity/scope appear in using-agent-skills, incremental (Rules 0/0.5), code-review, code-simplification and spec rationalizations. Persona bodies restate review/security/test checklists. Spec and plan templates are both inline and canonical (spec:186,202 admit it).
- Token-saving rules present: skip re-running unchanged verifications (incremental:211), 75% context trim (context-engineering:202), "prefer scripts over inline code" (skill-anatomy:135).

## 9. Strengths
Process rigor with named failure modes; rationalization tables; strong eval discipline for routing, including a measured lever (description wording); consistent skill anatomy enforced in CI; progressive disclosure in security and performance; the constraints skill that makes a bar mechanical; persona orchestration rules with anti-patterns catalog (references/orchestration-patterns.md:282-340).

## 10. Weaknesses
(1) Gates are text, not enforcement. (2) No C#/.NET, essentially no Angular, thin Python/Node runtime guidance. (3) Personas have no tool allowlists, so "read-only" reviewers are not read-only. (4) Severity vocabulary drift (section 5). (5) Examples that contradict their own rules (section 6). (6) Large skills (21 KB) mix core workflow with side topics (code-review includes dependency upgrades and review-speed norms). (7) CLAUDE.md:43-44 says no tests and manual validation, stale against CI. (8) Behavioral evidence is mostly narrative. (9) No consumer overlay/customization system.

## 11. Maintenance burden
702 commits; 190 KB of scripts and tests; three copies of every command; version duplicated in 5 manifests; 9 host docs; a heavy anti-duplication governance (CONTRIBUTING pre-flight, rule file). Description edits can break routing evals, hence the 95% ratchet.

## 12. Licensing
MIT, copyright 2025 Addy Osmani (LICENSE:1-3). Redistribution of copies or substantial portions must retain the copyright and permission notice (LICENSE:12-13). No NOTICE file. `code-simplification` credits the Anthropic Claude Code Simplifier plugin as inspiration (SKILL.md:8). README credits Google engineering practices for concepts (README.md:378). Inbound contributions are MIT (CONTRIBUTING.md:137).

## 13. Open questions
Do the gates hold under autonomous harnesses? Only opt-in evals say. What is the real token cost of a full lifecycle run (16-step sequence)? Is the Om Mishra head-to-head (docs/comparison.md:62-70) reproducible? It is one task. How often do the three severity vocabularies confuse reviewers?

## Top ideas worth taking
1. **Bar-lowering guard: "tightening silent, loosening loud"** - skills/constraint-driven-development/SKILL.md:214, five moves at :206-212. Stops agents from going green by weakening checks. Evidence: 12-test reference guard (scripts/floor-guard-reference-test.js); no behavioral eval.
2. **Constraint = number + command + stage; cost decides placement** - same skill :123-124, :186-200. Turns quality prose into checks and keeps the edit loop fast. Evidence: none beyond tests of the guard.
3. **Hard stop after the spec; approval in a later turn** - spec-driven-development/SKILL.md:170-174. Prevents spec-and-code in one turn. Evidence: eval expectation "No implementation code is written"; run results not published.
4. **Concept-count test for refactors** - code-review-and-quality/SKILL.md:60. Rejects "cleaner" changes that only relocate complexity. Evidence: none.
5. **Review the tests by hand-mutation** - code-review-and-quality/SKILL.md:164. Cheap, concrete check that tests would catch regressions. Evidence: none.
6. **Neutral perf result is a revert; keep an attempt ledger** - performance-optimization/SKILL.md:158-172. Stops complexity accretion and repeated dead ends. Evidence: none.
7. **Description wording is the routing lever; measure with pinned model and repeated runs** - evals/README.md:53-55 plus Tier-2 collision test (scripts/run-evals.js:10). Evidence: stated 7/27 to 21/27 and 6/24 to 19/24.
8. **Surface assumptions, stop on confusion, push back (operating behaviors)** - using-agent-skills/SKILL.md:49-84. Cheap, universal, always-on candidates. Evidence: none.
9. **`/build auto` preconditions (spec path, clean tree, unhedged approval, irreversible=not `git revert`-able)** - .claude/commands/build.md:31-42. Concrete autonomy limits. Evidence: none.
10. **Plan-file overwrite guard** - planning-and-task-breakdown/SKILL.md:150-155. Protects state across sessions. Evidence: rationalization row, no eval.
11. **Producer/consumer artifact-path validator** - scripts/validate-artifact-paths.js:4-9, born from a real regression (PR #93). Evidence: 10 unit tests.
12. **Fresh-context adversarial review that withholds the claim** - doubt-driven-development/SKILL.md:106, bounded to 3 cycles (:189). Evidence: none; cost unquantified.
13. **Trust follows who wrote the value (destructive paths, argv)** - security-and-hardening/SKILL.md:117; supply chain "block scripts before first execution" (:136). Evidence: none.
14. **Do not re-run unchanged verification commands** - incremental-implementation/SKILL.md:211 (also TDD:398). Direct token/turn saving. Evidence: none.
15. **Rejected-change ledger tied to eval scores** - evals/skill-impact.md:3. Institutional memory for failed prompt edits. Evidence: ledger empty, so unproven.
