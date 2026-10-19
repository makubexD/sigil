# ECC `skills/` tree - Deliverable A (recon agent ecc-skills)

Repo: C:\WorkSpaceMaku\Others\ECC, MIT, commit b92f181b (HEAD dated 2026-10-11). Scope: `skills/` only. Rules, agents, commands, hooks and scripts belong to another agent; where a skill points at them I say so and did not verify them.

Convention: **fact** = read in this session (path:line); **inference** = my reading of facts; **heuristic** = script/regex output, not read.

## Sampling disclosure
- Listed by script: all 613 files in 311 skill folders (`listing.tsv`: 311 SKILL.md, 77 reference files, 53 other docs, 129 scripts, 43 assets).
- Read in full or with fenced code collapsed (headings + all prose): coding-standards, tdd-workflow, error-handling, python-patterns, angular-developer (+ effects.md, testing-fundamentals.md), react-patterns, react-performance (lines 1-300), verification-loop, search-first, strategic-compact, context-budget, token-budget-advisor, skill-comply (SKILL.md plus grader.py head).
- Read as headings + first lines + rule-keyword lines only (not the full body): frontend-patterns, backend-patterns, dotnet-patterns (plus its async and anti-pattern sections in full), csharp-testing, nestjs-patterns, bun-runtime, vite-patterns, python-testing, api-design, security-review (plus auth section), security-scan, agent-security-hardening, mcp-dependency-review, gateguard (evidence and anti-patterns in full), safety-guard, django-security, fastapi-patterns, django-patterns, django-tdd, django-verification, plan-orchestrate, blueprint, intent-driven-development (operating rules in full), contract-first, delivery-gate, plan-canvas, change-impact (mostly full), plankton-code-quality (config protection and ratchet in full), loop-design-check (core in full), test-collaboration, module-regression, living/docs-governance, brownfield-retrospective, context-and-decisions, story-lifecycle, orch-pipeline (full) and two orch ops, production-audit, ADR, hexagonal, inherit-legacy-style, conventional-commit-review, git-workflow, codehealth-mcp, e2e-testing, eval-harness, ai-regression-testing, skill-stocktake, rules-distill, santa-method, iterative-retrieval, repo-scan, codebase-onboarding, prompt-caching-strategy, agent-eval, latency-critical-systems, data-throughput-accelerator, database-migrations, mcp-server-patterns, react-testing, mle-workflow. About 100 skills in all.
- Not read beyond name, byte size and 160-char description: the other ~210 skills (logistics, finance, healthcare, homelab, network, media, design taste, marketing, science, Java/Kotlin/Go/Rust/Swift/PHP/Perl/C++ stacks, etc.). Classification of them is heuristic (`classify.js`).

## Purpose and users
**Fact**: 311 curated skills (`skills/<name>/SKILL.md`, `name` + `description` frontmatter) shipped as the skills layer of the Everything-Claude-Code bundle (`docs/SKILL-PLACEMENT-POLICY.md:7-14`). **Inference**: users are Claude Code (and, per other docs, Codex, Cursor and similar) developers who install the bundle selectively and want ready-made playbooks for languages, frameworks, process and agent operations. About one third of the skills are not about code quality at all (heuristic: ~106 skills / 963KB in business, network, media, science and design domains).

## Core capabilities (heuristic split by name, 311 skills)
| Group | Skills | SKILL.md bytes |
|---|---|---|
| Language / framework / data engineering (Python, Django, Angular, React, Java, Kotlin, Go, Rust, Swift, PHP, DB, Docker/K8s, API design) | 81 | ~1.03MB |
| Planning, spec, review and repo-process (orch-*, blueprint, intent, contract-first, ADR, git, onboarding, loops) | 50 | ~0.39MB |
| Context, token and agent operations (budget, compact, caching, learning, evals) | 50 | ~0.35MB |
| Testing and verification | 11 | ~0.12MB |
| Security | 13 | ~0.11MB |
| Other domains | 106 | ~0.96MB |

## Architectural model
- **Authoring**: one markdown file per skill. Frontmatter is `name`, `description` (311/311), `metadata.origin` (280), optional `license` (19), `tools` (11), `author`/`homepage`/`repo`. **Fact** (heuristic count by script).
- **Composition**: no templating or inheritance. Reuse is by prose cross-reference ("Related Skills", 70 skills; "Use `frontend-patterns` for ..." in coding-standards/SKILL.md:12-16). **Inference**: guidance is duplicated by hand across sibling skills.
- **Progressive disclosure**: only a few skills use it. 77 `references/` files exist, 35 of them in angular-developer (angular-developer/SKILL.md:54-139 is an index of "Read [x.md]" pointers). Most skills are single files, p50 7.7KB, p90 18.8KB, max 42.3KB (gateguard).
- **Distribution**: curated `skills/` is listed in `manifests/install-modules.json` (policy doc line 20); learned/imported/evolved skills live under `~/.claude/` and carry `.provenance.json` (policy doc lines 24-65). Not reviewed beyond this.
- **Activation**: description matching ("When to Activate" in 153 skills, "When to Use" in 138); some skills document a hook (gateguard, strategic-compact, plankton) whose implementation sits outside `skills/`.

## Key components with paths
- Language: `skills/python-patterns`, `python-testing`, `dotnet-patterns`, `csharp-testing`, `error-handling`, `coding-standards`.
- Framework: `angular-developer`, `react-patterns`, `react-performance`, `react-testing`, `nestjs-patterns`, `fastapi-patterns`, `django-*`.
- Process: `tdd-workflow`, `orch-pipeline`, `intent-driven-development`, `change-impact`, `contract-first`, `test-collaboration`, `search-first`, `verification-loop`.
- Quality enforcement: `plankton-code-quality`, `gateguard`, `delivery-gate`, `safety-guard`.
- Measurement: `skill-comply` (with 1,114 lines Python + 1,138 lines tests), `eval-harness`, `agent-eval`, `benchmark*`.
- Context cost: `context-budget`, `strategic-compact`, `token-budget-advisor`, `prompt-caching-strategy`.

## Target platforms and assumptions
Claude Code first (hooks, PreToolUse/Stop, `/compact`, `/context`, subagent names, `claude -p`). Several skills mention Codex (context-budget/SKILL.md:30-31). `scripts/ci/validate-skill-host-compat.js` exists (488 lines, not read). **Inference**: skill bodies often assume ECC agents and commands exist (react-patterns/SKILL.md:270-271, orch-pipeline/SKILL.md:87-96), so they are not portable without the bundle.

## Language and framework coverage (see `coverage.tsv`, depth 0-3)
- **Angular**: strongest. 35 refs cover signals, resource, effects, DI, routing, forms, testing, CLI/MCP (depth 2-3 on most topics); security and error handling thin (1).
- **React**: strong. react-patterns, react-performance (Vercel-derived 70+ rules), react-testing (depth 3 for idioms, async, testing, performance).
- **Python**: strong on idioms/testing/tooling (3); security only via Django (2); no profiling.
- **TypeScript**: no dedicated skill. Types are depth 1 (grep finds no discriminated unions, strict tsconfig, branded types); errors and testing are good via generic skills.
- **Node**: no dedicated skill. Express/Next patterns in backend-patterns; no event-loop, unhandled-rejection, worker_threads, node:test, prototype-pollution coverage (greps return none).
- **C#**: 2 skills. Idioms/async/errors/testing at depth 2; security and performance 0; no nullable-reference-types, analyzers or BenchmarkDotNet content.

## Lifecycle coverage
Spec (intent-driven-development, blueprint, contract-first) - plan (plan-orchestrate, orch-pipeline, search-first) - implement (tdd-workflow, language skills) - verify (verification-loop, eval-harness, ai-regression-testing, skill-comply) - review (codehealth-mcp, santa-method, conventional-commit-review) - ship (production-audit, deployment-patterns, canary-watch) - maintain (living-docs-governance, brownfield-retrospective). Coverage is broad; depth varies a lot.

## Customization and precedence
Within `skills/`: only `learned/imported/evolved` roots outside the repo (policy doc) and per-project style files created by `inherit-legacy-style` (`.ai-style-rules.md`, inherit-legacy-style/SKILL.md:116-120). No overlay or narrowing mechanism observed in `skills/`.

## Validation and CI of the skills tree
**Fact**: `scripts/ci/validate-skills.js:7-14` checks that each folder has a non-empty SKILL.md with `name` and an inline `description`; frontmatter findings default to WARN (:17-20). No body-size, duplication, link or behaviour checks seen there. **Fact**: behaviour measurement exists only as the opt-in `skill-comply` tool (not run by CI as far as I read). Per-skill unit tests exist under `tests/ci/` for some skills (e.g. agent-security-hardening-skill.test.js; names only, not read).

## Token implications (measured by script)
- **Always-loaded if all 311 are installed**: 311 `description` strings = 95,581 B + 5,453 B of names, about 101KB (est. 25K tokens at 4 B/token); average description 307 B, longest 569 B (flox-environments). Full frontmatter blocks total 120,392 B but only name/description are normally listed (inference).
- **On demand**: SKILL.md bodies total 2.96MB; whole tree 4.98MB. Per invocation a skill costs its body: p50 7.7KB, p90 18.8KB; tdd-workflow 21.6KB, security-review 23.1KB, gateguard 42.4KB.
- **Code share**: 36% of SKILL.md bytes sit inside fenced code (1.07MB). frontend-patterns is 83% code lines (546/658); backend-patterns 78% (440/563). **Inference**: much of that is tutorial code an LLM already knows.
- **Duplication** (`duplication.tsv`, 8-word shingle containment, .md only): skill-to-skill near-copies are rare; only ito-inference vs ito-training (0.49, 392 shared shingles). Skill-vs-rule overlap is the real duplication: coding-standards vs rules/typescript/patterns.md 0.32; rust-testing vs rules/rust/testing.md 0.28; rust-patterns vs rules 0.18; fsharp-testing vs rules 0.18; react-testing vs rules/react/testing.md 0.13 (108 shingles). Structural repetition: "When to Activate/Use" headings 291 times, "Anti-Patterns" headings 115 times; parallel families (5 TDD, 5 verification, 5 security by framework).
- Positive: context-budget refuses tool use for live-usage questions (context-budget/SKILL.md:21-24); angular-developer shows a low-cost reference layout. Negative: token-budget-advisor adds a question before each answer; inherit-legacy-style adds a per-turn declaration.

## Strengths
1. Several skills are written for model failure modes (rule-gaming, self-review blind spots, silent skipping): plankton:59, ai-regression-testing:22, search-first:181.
2. Honest proportionality rules: intent-driven-development:73, contract-first:28, orch-pipeline:41 (size tiers).
3. An actual measurement tool for rule/skill adherence with tests (skill-comply).
4. React/Angular guidance is current and opinionated, with explicit anti-patterns.

## Weaknesses
1. Size and scope: 311 skills, one third off-topic for code quality; up to 42KB bodies; 36% code-by-bytes.
2. Weak TypeScript/Node/C# depth (above); security skill is generic web with Supabase/Solana sections.
3. Internal contradictions and small defects: coding-standards memoizes by default (coding-standards/SKILL.md:413-428) while react-patterns forbids it (react-patterns/SKILL.md:61); catch-and-rethrow drops cause (coding-standards:125-128); JWT sample lacks algorithm/expiry pinning (backend-patterns/SKILL.md:352-362); angular-developer/SKILL.md:154 credits security-review with Angular content it lacks.
4. Hard-coded thresholds: 80% coverage, 50-line functions, "no skipped tests".
5. Evidence for effectiveness is thin: gateguard rests on two A/B tasks (gateguard/SKILL.md:37-45).

## Maintenance burden (inference)
High: 3,931 commits, 311 skills hand-written, 6 locale mirrors of skills under `docs/*/skills` (e.g. ja-JP 2.5MB), cross-skill references by name with no resolver (the angular cross-ref error above is an example), and framework-parallel families that must be kept consistent by hand.

## Licenses and attribution (needed if ideas are reused)
- Repo MIT, "Copyright (c) 2026 Affaan Mustafa" (LICENSE:1-3).
- `skills/osint-investigation` is CC-BY-SA-4.0 with its own LICENSE.txt (skills/osint-investigation/SKILL.md:4; LICENSE.txt:1) and is adapted from shoyann/RZK-The-Hunter (SKILL.md:6, :364): share-alike applies. Avoid copying it into an MIT catalog.
- 8 logistics/ops skills are Apache-2.0 (e.g. skills/carrier-relationship-management/SKILL.md:4, energy-procurement:4, production-scheduling:4) and 10 are MIT (e.g. verification-loop:4).
- `react-performance` is adapted from Vercel Labs react-best-practices, credited as MIT at react-performance/SKILL.md:573.
- `ck` (author sreedhargs89, ck/SKILL.md:7-8), `token-budget-advisor` (external source, :119-122), `autonomous-loops` (credits at :145, :214, :382, :607-609), motion-* (author "jeff") name third parties but give no license text.
- `angular-developer` has no attribution in its directory (grep: none). **Inference**: structure resembles Angular's own published agent skills; license unconfirmed, so check upstream before copying wording.

## Open questions
- Which skills are installed by default profiles (manifests, other agent) and therefore what the real eager cost is.
- Whether `skill-comply` results exist anywhere for the language skills.
- Whether the hook implementations behind gateguard and plankton match their skill descriptions.

## Top ideas worth taking (ranked)
1. **Verified RED gate**: a test counts as RED only if compiled, executed and failed for the intended reason (skills/tdd-workflow/SKILL.md:159-172). Raises correctness of TDD claims; evidence: none beyond the text.
2. **Treat plan/input files as untrusted data** and whitelist validation commands (tdd-workflow/SKILL.md:24-37). Cuts prompt-injection risk; evidence: none.
3. **Protect lint/format/type configs from edits and detect diffs at Stop** (plankton-code-quality/SKILL.md:57-63). Stops rule-gaming; evidence: hooks described, no eval.
4. **Complexity ceiling ratchet, never grandfather** (plankton-code-quality/SKILL.md:290-329). Prevents drift without a big-bang refactor; evidence: cites a real upstream PR with numbers (hunk, 80 vs worst 78).
5. **Right-size the process by blast radius** with a security/public-API floor (orch-pipeline/SKILL.md:41-54). Cuts ceremony and tokens on small tasks; evidence: none.
6. **Do not infer business rules from code; mark them as assumptions** (intent-driven-development/SKILL.md:65-71), with revision handling for unmet criteria. Raises requirements correctness; evidence: none.
7. **Progressive disclosure**: thin index SKILL.md plus per-topic reference files (angular-developer/SKILL.md:54-139). Cuts per-invocation tokens (11KB index vs 131KB total); evidence: structural only.
8. **Measure compliance without asking for it**: supportive, neutral and competing prompts, LLM classification plus deterministic ordering (skill-comply/SKILL.md:13-16; scripts/grader.py). Gives behavioural evidence for rules; evidence: 1,138 lines of tests for the tool, no result set.
9. **Machine-decidable done-criterion and reconciliation against external fact; veto a loop unless 4 conditions hold** (loop-design-check/SKILL.md:37-56). Stops runaway or gamed loops; evidence: none.
10. **Memoize only when measured; no useEffect+fetch** (react-patterns/SKILL.md:61,178) and **impact-ordered performance rules** (react-performance/SKILL.md:22-33). Avoids both overengineering and the biggest perf losses; evidence: ruleset adapted from Vercel (credited :573).
11. **Self-review has the same blind spot as the writer; use tests as the independent check** (ai-regression-testing/SKILL.md:22-46). Raises bug detection; evidence: one narrated production case.
12. **Fact-forcing instead of "are you sure?"** with cost-limited gating (gateguard/SKILL.md:21-33,700). Evidence: two A/B tasks, +2.25 mean (weak).
13. **Impact from real imports/calls, unknowns labelled unverified** (change-impact/SKILL.md:7,62) and **one authoritative contract** (contract-first/SKILL.md:42,92). Evidence: none.
14. **Zero-tool answer to "how much context is left"** (context-budget/SKILL.md:21-24) and **compact at phase boundaries only** (strategic-compact/SKILL.md:80-87). Saves tokens; evidence: none.
15. **Say which search channels were unavailable** (search-first/SKILL.md:181) and **package manager is not test runner** (tdd-workflow/SKILL.md:100-114). Cheap honesty and correctness rules.
