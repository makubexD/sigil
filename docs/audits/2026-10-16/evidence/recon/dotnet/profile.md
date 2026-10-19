# dotnet/skills - Deliverable A profile

Repo: C:\WorkSpaceMaku\Others\skills (dotnet/skills, MIT, commit 9de888b8, 2026-10-13). Paths are repo-relative. "Fact" = read at the cited line; "inference" is marked. Read-only analysis; nothing run.

## 1. Purpose and users
The .NET team's curated set of portable agent skills plus host-specific custom agents (README.md:5-8). Users: .NET developers using Copilot CLI, Claude Code, VS Code, Cursor or Codex (README.md:53-146) and contributors. It is a **.NET-only** catalog: 104 shipped skills in 17 plugins, 22 agents (Copilot `.agent.md`), 4 redistributable gh-aw workflow packages, and 6 repo-development skills under `.agents/skills/`. Skill bodies total ~1.4MB, mean 13.4KB (script over plugins/*/skills/*/SKILL.md).

## 2. Core capabilities
1. **Language/framework skills** for C#, MSBuild, NuGet, EF Core, ASP.NET Core Web API, Blazor, MAUI, WinForms, AI/ML.NET, template engine.
2. **A very deep testing cluster** (dotnet-test: 24 skills, 10 agents; dotnet-test-migration: 6 skills + orchestrator): generation, repair, quality audits (anti-patterns, assertion diversity, A-F grades, smell taxonomy, pseudo-mutation gap analysis), coverage/CRAP, testability seams, framework migration.
3. **Performance toolbox**: grep-recipe anti-pattern scan, BenchmarkDotNet, SIMD, AOT/trim, trace/dump collection, EF query tuning, build-perf.
4. **Migration playbooks** (.NET 8->11, nullable, AOT, Thread.Abort, MSTest v1->v4, xUnit/NUnit->MSTest, VSTest->MTP).
5. **A router skill** `csharp-expert` (plugins/dotnet/skills/csharp-expert/SKILL.md).
6. **The most mature skill-evaluation and skill-linting stack found so far** (sections 7-8).

## 3. Architectural model
- **Authoring**: `plugins/<plugin>/skills/<name>/SKILL.md` (+`references/`, `scripts/`, `assets/`) and `agents/<name>.agent.md`; hand-written Markdown with YAML frontmatter (CONTRIBUTING.md:21-44). No generation/compilation step, no templates, no `extends`/`uses`. Reuse is by prose reference and by `disable-model-invocation: true` reference-only skills (4: code-testing-agent, code-testing-extensions, filter-syntax, test-analysis-extensions).
- **Distribution**: four marketplace manifests (.github/plugin, .claude-plugin, .cursor-plugin, .agents/plugins) plus three per-plugin manifests; patch versions are computed from effective content, never hand-edited (CONTRIBUTING.md:43-80). The repo calls this a "compatibility bridge" (CONTRIBUTING.md:22-27).
- **Activation**: model-driven skill selection on `description` only (CONTRIBUTING.md:584-585). No hooks anywhere (listing/grep). One LSP declaration (plugins/dotnet/lsp.json) and an MCP server for binlogs in dotnet-msbuild (CONTRIBUTING.md:96-104; server itself not read).
- **Router**: a *skill*, not an agent. `csharp-expert` classifies intent and detects solution type from manifests (SKILL.md:64-123), ranks candidates (SKILL.md:131-141), invokes the narrowest installed skill or names the marketplace plugin to install (SKILL.md:211-258), and falls back to C# semantics (SKILL.md:291-321). Fact: 21.8KB body.
- **Agents**: used only for orchestration where fan-out pays: `test-engineer` (30KB) coordinates 7 `code-testing-*` workers plus `test-quality-auditor` and `testability-migration` (test-engineer.agent.md:12-21); `test-migration`, `msbuild`, `template-engine` are other front doors. The test-engineer itself says phases need not be agent calls (test-engineer.agent.md:92-97).

## 4. Platform assumptions
Skills follow agentskills.io and run on all five hosts; agents are Copilot-only (Codex ignores them; README.md:14-21). The validator models the **Copilot CLI** skill-menu budget (15,000 chars rendered, SkillProfiler.cs:35-71). Claude-specific constraint (no XML tags in descriptions) is enforced (SkillProfiler.cs:335-348). Skills that call `dotnet`, `pwsh`, BenchmarkDotNet assume those exist.

## 5. Languages and depth
See `coverage.tsv`. Summary: C# depth 3 in testing, refactoring, performance, MSBuild/tooling, migration, EF Core, Blazor; depth 2 in async, types, ASP.NET Core, MAUI, WinForms, serialization; **depth 1 or 0** for general idioms, error handling, architecture, and **security (no dedicated skill, rule, or agent)**, observability, code review, WPF/gRPC/SignalR/Aspire. Other languages appear only in polyglot test-quality skills.

## 6. Lifecycle coverage
Spec/requirements: none. Plan: only inside code-testing (research.md/plan.md). Implement: framework skills + csharp-refactoring. Verify: the testing cluster is the repo's centre of gravity; "verify" is built into most skills via mandatory Validation sections and truthful-reporting rules. Review: no general reviewer; domain reviewers only (MSBuild, tests). Ship: nuget-trusted-publishing, plugin versioning. Debug: runtime diagnostics, binlog analysis.

## 7. Validator (facts, path:line)
`skill-validator check` (eng/skill-validator/src/Check/) runs in CI over every plugin (.github/workflows/skill-check.yml:49-55).
- Name: 1-64 chars, `[a-z0-9-]`, no leading/trailing/double hyphen, equals directory name (SkillProfiler.cs:293-311, 353-359). Agents: name equals filename (AgentProfiler.cs:35-38).
- Description: 10-1024 chars (SkillProfiler.cs:28, 73, 121-132); no XML-like tags (340-348); compatibility <=500 (74, 139-146).
- Files: Markdown links in the body may not use `..` or absolute paths and may be at most 1 directory deep (148-202); any bundled asset <=5MB (75, 204-241).
- Size is a **warning, not an error**: BPE tokens (cl100k) >5000, >2500, <200; plus missing headings, code blocks, numbered steps, frontmatter (243-267). Tiers compact/detailed/standard/comprehensive at 400/2500/5000 (102-108).
- Plugin: whole-plugin rendered skill-menu <=15,000 chars, excluding `disable-model-invocation` skills (CheckCommand.cs:226-254; cost formula SkillProfiler.cs:397-402); duplicate skill names (CheckCommand.cs:388-408); plugin.json fields and Codex manifest shape (PluginProfiler.cs:49-108, 138-310); MCP parity across manifests.
- Security/hygiene: `http://`, script tags without SRI, pipe-to-shell, unknown domains (ReferenceScanner.cs:75-87, 113-133; CONTRIBUTING.md:508-512); bundled scripts, `INVOKES <file>`, non-built-in tools and MCP servers need allow-listing (ExternalDependencyChecker.cs:82, 319).
- **Not enforced** (facts, by absence): `USE FOR:`/`DO NOT USE FOR:` wording (only a template at .agents/skills/create-skill/SKILL.md:51; 66 of 104 descriptions use `USE FOR`, 90 mention a do-not-use clause; counted by script); the 500-line body guidance (CONTRIBUTING.md:202; three skills exceed it); presence of a When-to-use section (only recorded, SkillProfiler.cs:99-100).
- The validator is ~890KB of C# source and includes the evaluate pipeline, so "validator" and "eval runner" share one tool.

## 8. Evals: behavioural, with a statistical decision rule
- **Defined** per skill in `tests/<plugin>/<skill>/eval.yaml` (Vally schema: `stimuli`, `graders`, `defaults`, optional `rubric`, `golden_*`, `expect_activation`). ~109 files, ~900 stimuli (regex count), 57 dormancy cases, 12 grader types; deterministic graders dominate (output-matches ~1,400, run-command ~430 incl. `dotnet test`, file-contains ~290) beside ~850 LLM `prompt` graders. Fixtures are real compilable projects.
- **Run**: baseline (no skills) vs skilled (only the skill) vs plugin (whole plugin) with one model executor and a pairwise LLM judge (dotnet-skills.experiment.yaml:29-45; claude-opus-4.6 at :33-34). Triggered by a maintainer `/evaluate <sha>`; PR runs do not auto-evaluate (CONTRIBUTING.md:468). Agents run through a native Copilot-SDK lane.
- **Scored**: each distinct stimulus gets one W/T/L vote (repeats = reliability only); pass needs >=5 preference stimuli, exact one-sided sign test p<=0.05, and net win >=20% (eng/vally-adapter/README.md:309-321). Dormancy cases are a separate activation contract. Missing/duplicate/errored results fail closed (README:349-352). Judge magnitude is deliberately ignored (eval-quality/README.md:515-551). Legacy C# scoring weights quality 0.40, overall judgment 0.30, completion 0.15 (Models.cs:528-539).
- **Structural gate before running**: 23 checks (eval-quality/README.md:16) incl. fixture-in-git-index and self-test.
- **Overfitting judge** flags evals that reward repeating skill phrasing (OverfittingDetection.md:9-14), informational only.
- **Published results**: README links a live "Skill Value" dashboard (README.md:9-12) with token, time, activation, not-passed rates by model. No result data is committed. Self-disclosed debt: 48 evals grandfathered below the floor, 25 with only 5-7 stimuli (vally-adapter/README.md:605-608). Inference: 84 of 109 files leave `runs` unset (single trial).

## 9. Customization / precedence
Only mechanism: **repository overlays**, piloted on three dotnet-test skills (plugins/dotnet-test/OVERLAYS.md). A repo file `.agents/skill-overlays/dotnet-test/<skill>.md` with `core`, `binding-revision`, `mode: extend` is read by the skill before discovery (writing-mstest-tests/SKILL.md:27-46; frontmatter `metadata: binding: optional-overlay, binding-revision "1"` at :16-19). Mismatch => reported and ignored. Overlays can narrow but never widen tools/scope/network/publication (OVERLAYS.md:48-51). Precedence: user instruction > verified project constraints > overlay > portable default (OVERLAYS.md:53-58). Conflict with the repo => report, don't pick (60-61). Explicitly "instruction composition, not a host-level merge" (66-68). Credit to @JeremyKuhne (OVERLAYS.md:3-8). Inference: 3 of 104 skills participate; cost ~20 lines of body per skill. Otherwise no user/team override layer.

## 10. Token implications
- **Always loaded** (when a plugin is installed): `name` + `description` per skill, mean 646 chars, max 1017, 104 skills (script). Per-plugin menu is capped at 15K chars; dotnet-test (24 skills) is ~14.9K and dotnet-msbuild (18) ~14.1K by my estimate (inference), so the cap shapes the text: descriptions in the test family are long exclusion lists.
- **On activation**: whole SKILL.md (mean 13.4KB ~ 3.4K tokens; 6 skills >24KB) plus references on demand (36 of 104 skills have references).
- **Duplication**: the exclusion partition is repeated in both siblings by design (CONTRIBUTING.md:586-587); the overlay-lookup block repeats in three skills; migration reference docs overlap (inference, not measured).
- **Positive**: AGENTS.md is 1.9KB of pointers (AGENTS.md:3-27); repo-dev skills are not shipped; `disable-model-invocation` reference skills cost no menu space.

## 11. Strengths
1. Measurement culture: every skill is judged against its own unskilled baseline, with tie/loss visibility.
2. Authoring rules learned from failures, each tied to a PR (writing-for-baseline-delta.md).
3. Executable graders on real fixtures (build + test), dormancy cases, golden trajectories.
4. Validator encodes real host constraints (menu truncation, Claude XML tags).
5. High-quality, decision-oriented skill bodies in testing, refactoring, EF Core, perf.
6. Honest about debt and limits (vally-adapter/README.md:601-627).

## 12. Weaknesses
- .NET only; no security skill; no general review, architecture, error-handling, observability.
- Skill bodies are large and eval-shaped; csharp-expert and code-testing carry many rules that read as patches for specific eval prompts (csharp-expert SKILL.md:203-209, 316-321; code-testing SKILL.md:23-86). Inference: raises token cost and fragility.
- Description/menu pressure forces unreadable exclusion lists (test-anti-patterns description).
- Perf reference over-prescribes: ArrayPool is Critical for any `new byte[4096]` (critical-patterns.md:52-53) while SKILL.md:208-213 warns against broad micro-optimisation.
- Doc drift: 22 vs 23 gate checks (AGENTS.md:16, CONTRIBUTING.md:420 vs eval-quality/README.md:16); stale `Assert.ThrowsException` example (unit-test-generation.prompt.md:195).
- Overlay protocol spends body text per skill; the host provides no support.
- Statistical power is low for many evals; comparison judge is an LLM, so "regression" is never asserted.

## 13. Maintenance burden
High. ~890KB validator, 87KB eval gate, 94KB+82KB adapter and tests, 4 marketplace manifests x 17 plugins, CODEOWNERS entries per skill with >=2 owners (CONTRIBUTING.md:14-19), weekly version sync, model-pinned evaluation costs. Tool and CI complexity exceed skill content complexity.

## 14. Open questions
- Dashboard numbers (effect sizes per skill/model) were not accessible offline; the real win rate of the shipped skills is unknown to this recon.
- agentic-workflows/, dotnet-ai, template-engine, MAUI and most migrate-* bodies were not read in depth.
- Whether the C# LSP materially improves refactoring outcomes (csharp-refactoring cites it, no ablation seen).

## Read disclosure
Read fully: AGENTS.md, README.md, CONTRIBUTING.md, OVERLAYS.md, SkillProfiler.cs, create-skill SKILL.md, writing-for-baseline-delta.md, csharp-expert SKILL.md, csharp-refactoring SKILL.md, analyzing-dotnet-performance SKILL.md, unit-test-generation.prompt.md (lines 1-200 of ~14KB). Read in part: CheckCommand.cs (1-420), eval-quality README (1-300, 515-655), vally-adapter README (1-120, 259-450, 601-642), dotnet-webapi (1-260), EF skill (1-150), writing-mstest-tests (1-300), test-gap-analysis (selected ranges), test-engineer agent (1-120), code-testing (1-230), microbenchmarking/vectorization/aot-compat (ranges), critical-patterns (1-120). Descriptions+headings only: ~25 more skills (see inventory). Listed only: remaining ~65 skills, 17 agents, all C# eval runner internals except Statistics/Models headers, dashboard JS. Test fixtures under tests/ are not in listing.tsv.

## Top ideas worth taking (ranked)
1. **Delta-over-baseline authoring rule**: delete anything the unskilled model already writes; encode decisions as "when A do B, never C, verify D" tables with a concrete output contract. `.agents/skills/improve-skill-quality/references/writing-for-baseline-delta.md:9-18, 29-39`. Cuts tokens and raises win rate. Evidence: PR-cited failures (e.g. #926 0% -> improved); eval A/B runs, results off-repo.
2. **Budget the model-visible menu, not just each description**: compute rendered skill-block cost per plugin against the host's real truncation limit. `SkillProfiler.cs:35-71, 397-402`; `CheckCommand.cs:226-254`. Direct token lever. Evidence: unit tests in eng/skill-validator/tests; incident recorded in code comment (SkillProfiler.cs:46-47).
3. **Count distinct tasks, not repeated runs; significance plus practical floor**; fail closed on missing data. `eng/vally-adapter/README.md:282-321, 330-331`. Evidence: `adapt.test.mjs` exhaustive boundary test (README:337).
4. **Gate source-only findings on evidence and allow "no actionable changes"** (anti-overengineering, anti-false-positive). `plugins/dotnet-data/skills/optimizing-ef-core-queries/SKILL.md:37-44`; `analyzing-dotnet-performance/SKILL.md:120, 145-154`. Evidence: eval stimuli (tests/dotnet-data); no standalone proof.
5. **Behavior-preserving refactor gate**: classify each requested op first, defer behavior/API-contract changes, rename by bindings, validate each TFM, PublicAPI/ApiCompat/TypeForwardedTo. `plugins/dotnet/skills/csharp-refactoring/SKILL.md:13-42, 59-68, 148-157`. Evidence: executable fixture eval (`tests/dotnet/csharp-refactoring/eval.yaml:64-101`).
6. **Mutation-thinking test rules**: every assertion must fail under a plausible mutation; "would emptying the function body fail?"; no tautologies; fixture realism. `plugins/dotnet-test/skills/code-testing/unit-test-generation.prompt.md:77-88`. Evidence: code-testing evals (tests/dotnet-test/code-testing).
7. **Pseudo-mutation gap analysis with witnesses** (witness -> original -> mutant; admit only publicly observable). `plugins/dotnet-test/skills/test-gap-analysis/SKILL.md:154-190, 323-340`. Evidence: eval + golden trajectories; none external.
8. **Overlay binding with revision pin, narrow-only authority and stated precedence**. `plugins/dotnet-test/OVERLAYS.md:27-64`. Evidence: fixtures + evals under tests/dotnet-test/*/fixtures/repository-overlay; host support absent (OVERLAYS.md:66-68).
9. **Classify an eval failure before editing skill text** (fixture, harness, reliability, power, eval design, content, routing, cost) in a symptom table. `.agents/skills/improve-skill-quality/SKILL.md:52-69`; `CONTRIBUTING.md:594-600`. Prevents wasted rewrites.
10. **Eval structural gate with git-index fixture check, shrink-only ratchet and selftest.** `eng/eval-quality/README.md:50-57, 83-100`. Evidence: selftest_eval_quality.py (73KB).
11. **Dormancy contracts** (`expect_activation:false` alone, never combined with `reject_skills`) to test restraint and routing. `eng/eval-quality/README.md:191-215`; `CONTRIBUTING.md:332-334`. Guards over-triggering, which costs tokens.
12. **Proportional verification and stop signals**: bound effort (max 3 fix iterations, 2-3 representative files per pattern) and size orchestration to request. `plugins/dotnet-upgrade/skills/dotnet-aot-compat/SKILL.md:220-228`; `code-testing/SKILL.md:179-191`. Evidence: evals (tests/dotnet-upgrade).
13. **Truthful validation reporting** (separate restore/build/test failures, never claim success after failure; preserve runner exit code; parse the real report artifact). `unit-test-generation.prompt.md:119-136`; writing-for-baseline-delta.md:88-94. Evidence: lost trials cited (PR #945).
14. **Router rule: one more decisive artifact instead of loading two skills; no bouncing between skills; routing is not completion.** `plugins/dotnet/skills/csharp-expert/SKILL.md:39, 158, 341-342`. Evidence: coexistence eval (csharp-expert-coexistence.experiment.yaml). Take the rules, not the 21KB body.
15. **Skill-coverage metric** (fraction of a skill's teaching points verified by any eval). `eng/skill-coverage/Measure-SkillCoverage.ps1:7-13`. No outcome evidence.

## Licence / attribution
MIT, "Copyright (c) .NET Foundation and Contributors" (LICENSE:1-3). MIT requires keeping the notice in copies; each skill also carries `license: MIT` (103 of 104 skills; script). CONTRIBUTING.md:263 and :533-536 forbid copying text from other repos, so ideas should be re-written, not pasted. OVERLAYS.md:3-8 credits JeremyKuhne's agent-skills/touki convention; perf patterns cite the official .NET performance blog series (analyzing-dotnet-performance/SKILL.md:13).
