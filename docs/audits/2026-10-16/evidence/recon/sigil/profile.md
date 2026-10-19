# sigil: recon profile (master 4f3806e, 2026-10-16)

Sampling: **read fully** the feature skill, standard.yaml, packs.yaml, protect-config hook, shared rules/template, `ts-code-quality`, `ts-code-reviewer`, `ts-debugger`, shared `code-reviewer`, `ts-generate-tests`, both audit files, `code-quality/results.md`, `agent-dispatch/results.md`, capabilities.md, `rule-load.cjs`. **Read in part** (headings or first 30-120 lines): other language rules, TS profiler/async/security, cli and wizard skills, spec.md, overlays doc, conformance rule header comments. **Script-measured only**: everything else. `dist/` was read for two file sizes only. **F** fact (path:line), **I** inference.

## Purpose and users
**F** sigil is a TypeScript CLI plus a catalog of rules, skills, agents, prompts, hooks, settings and MCP configs authored once and compiled to Claude Code and GitHub Copilot (CLAUDE.md, `docs/reference/capabilities.md`). Users are teams installing curated bundles with `sigil add`, and one maintainer authoring the catalog; the eval method and audits (`docs/audits/2026-10-14/`) are its evidence base.

## Core capabilities
- **Catalog (F, listing.tsv):** 63 rules, 44 skills (+15 references, +10 stack parts), 39 agents, 2 prompts, 1 hook, 4 MCP servers, 6 settings, 3 templates, 0 workflows (the kind exists but none ships). Five full language sets: TypeScript (also the Node content), Angular, React, C#, Python (11-15 rules, 7-8 agents, 8-9 skills each). Go and Rust have only CLI and wizard stack parts.
- **Delivery:** `add` writes files into a project; `build` writes marketplace plugins and a full Copilot tree.
- **Installer safety (F, CLAUDE.md invariants):** merge-not-overwrite for user JSON, drift classified as intact/missing/modified, home-file backup, conflict partitioning.
- **Authoring gate:** schema validation plus 20 conformance rule files (below).
- **Measurement:** an LLM-run eval for TypeScript rules, a dispatch probe, scenario evals for two skills.

## Architectural model
**F** Four stages: load, validate, resolve (`extends` for rules, `uses` for skills, template slot composition), then a per-provider target (CLAUDE.md "Architecture"). Every (provider, kind) rendering is a data-only `KindEmitSpec`; capability support per kind per channel is declared in one table. Bodies are provider-neutral with `{sigil:term}` tokens translated by a per-provider lexicon (e.g. `{sigil:conventions-file}`, feature/SKILL.md:43). `catalog/standard.yaml` declares every family (members, ordered H2 sections, exact frontmatter keys, severity scale): "one family, one skeleton" (standard.yaml:1-22, 50-420).
**Activation (F):** rules carry `appliesTo` globs; Claude gets `paths:` and loads them when matching files are touched, Copilot gets `applyTo` plus `description` (`src/targets/claude-code/spec/rule.ts:1-8`, `copilot/spec/rule.ts:1-25`). Skills dispatch on `description` + `whenToUse`; agents dispatch on `description` only (CLAUDE.md invariant). Hooks, settings: Claude only. Plugin channel inlines rules into the skills that `uses:` them; rules never ship standalone there (capabilities.md plugin table).

## Target platforms and assumptions
Claude Code (scaffold and plugin), Copilot (scaffold only), agents-standard (skills, rules via inline). **F** Copilot has no hook or settings emitter (capabilities.md:18-19). **I** Copilot loading behaviour rests on vendor docs and manual live campaigns (docs/audits/2026-09-27, 2026-10-06), not CI.

## Languages and depth
Full matrix in `coverage.tsv`. Summary (0-3): TypeScript is the deepest (idioms, types, async, security, testing, tooling all 3; performance is agent-only). Angular is strongest on framework (all 3 except types 2). C# is deep on types, async and NuGet tooling but only 1 on ASP.NET/EF. Python is 3 on async, security, testing, tooling but 1 on types and framework. React is 2 almost everywhere. **Node has no set of its own**: ESM/exports, event loop, `node:` built-ins and execFile live inside the TypeScript rules; no servers, workers, streams pipelines or graceful shutdown. **No topic anywhere** covers integration/e2e, property or mutation testing, API design, database/migrations, or observability beyond structured logging (grep, 0 hits for Playwright|Cypress|e2e).

## Lifecycle coverage
| Stage | In sigil | Source |
|---|---|---|
| Idea / requirements | none native; borrowed | feature Phase 1 calls interview-me, idea-refine |
| Spec, plan | none native; borrowed | feature Phases 2-3 call agent-skills |
| Implement | language rules, new/add-project and package skills | languages/*/ |
| Verify | generate/sync-tests skills, reviewers run the gate | ts-code-reviewer.agent.md:98-113 |
| Review, debug, refactor | reviewer, architecture, security, perf, api-compat, debugger, refactor agents | agents |
| Ship | release skills (manual), git rules | ts-release, shared/git |

## SDD workflow
**F** The only spec-to-ship path is `shared/feature`, a manual-only conductor (`disableModelInvocation: true`, feature/SKILL.md:18) in the `spec-driven` pack. It has **no spec or plan logic of its own**: it invokes the separately installed addyosmani/agent-skills collection by bare name and stops if absent (SKILL.md:33-41).
1. **Size check (Phase 0):** trivial goes to plan mode, a bug goes to a failing-test-first, only features proceed (:62-67).
2. **Idea (Phase 1):** `interview-me`, `idea-refine`, `constraint-driven-development`, run only if the signal applies; GATE 1 = intent in 3 lines + approach + quality bar (:69-80).
3. **Spec (Phase 2):** `spec-driven-development`; GATE 2 = objective, out of scope, success criteria, riskiest assumption, open questions (:82-87).
4. **Plan (Phase 3):** `planning-and-task-breakdown`; each task needs a **Docs:** line and a warning mark if it touches credentials/auth/deletions; GATE 3 then writes SPEC, `tasks/todo.md` and a "Plan:" commit (:89-97).
5. **Implement (Phase 4):** per task RED (show the test failing for the expected reason), GREEN, REFACTOR, DOCS, COMMIT by name, never `git add -A` (:99-113). Marked tasks first run `doubt-driven-development` and need an explicit go (:114-115).
6. **Verify:** full suite, typecheck and CONSTRAINTS checks inside Phase 4 step 3 (:107).
7. **Review (Phase 5):** parallel agent-skills `code-reviewer`, a fresh-context docs-drift subagent citing file:line on both sides, and `security-auditor` only for marked tasks; GATE 5 (:119-130).
8. **Ship (Phase 6):** move surviving facts to README/ADR/conventions file, delete SPEC and tasks/, GATE 6; "Never push. Never force anything" (:42, 132-141).
**Gates enforced vs advised.** **F** All six gates are prose the model must honour ("A hedged reply ... is NOT approval", :31-32). Platform-enforced pieces are only: manual-only invocation, the `protect-config` hook (secrets files), and agent `tools` lists. **F** The conductor has no `uses:` and never calls sigil's own `*-code-reviewer`, `*-generate-tests` or `*-security-auditor` (grep: no match), so the language catalog and the lifecycle skill are **not composed** **I**. **F** No eval, probe or scenario covers `feature`; its only test is structural (`test/targets/feature-skill.test.ts`).

## Customization and precedence
**F** Packs (`packs.yaml`), per-artifact `platforms:`, `extends`/`uses`, and consumer **overlays** (v1 shipped: narrow a rule's path scope only; "It may narrow, never widen", consumer-overlays-2026-10.md:26). The feature skill states "Project rules win" over generic skill advice (SKILL.md:43-45). Precedence between rules is not declared beyond the vendor tool's own merging.

## What sigil validates about itself
| Check | Enforces (F, `src/commands/sync/conformance/rules/`) |
|---|---|
| description-budget (error) | description + whenToUse stay under Claude's 1,536-char listing cut |
| when-to-use-lift (error) | "When to Use" body prose is lifted to frontmatter so routing sees it |
| when-to-use-quality (warn) | whenToUse has concrete quoted triggers and a complements clause |
| declared-but-unemitted (error) | every authored frontmatter key is mapped by some provider spec |
| tool-restriction-coverage (error) | an agent's tool restriction reaches every target or the build fails |
| provider-kind-coverage (error) | every native whole-file kind has an emit spec |
| provider-limits (warn/err) | emitted files respect each provider's documented size limits |
| provider-term-leak (error) | no raw `CLAUDE.md`/`$ARGUMENTS` in neutral bodies |
| platform-path-leak (warn) | no provider-private folder named in shared bodies |
| reference-links (error) | skill references are Markdown links (autofix) |
| family-skeleton + family-anatomy (error) | members have the family's sections, keys, titles, references |
| catalog-layout (error) | placement, id/folder agreement, stack-part layout, vocabulary |
| catalog-symmetry (warn) | a family present in most languages is not missing from one |
| stack-leak (warn) | shared text does not name one stack's libraries |
| body-density (warn) | skill bodies stay procedural, near 90 lines |
| applies-to-rationale (warn) | narrow `appliesTo` explains why |
| related-artifacts (warn) | sibling agents cross-reference |
| redundant-default (warn) | no frontmatter value equal to the schema default |
| deprecated-hygiene (warn) | `deprecated` carries `supersededBy` |
Also a trust scanner (20 secret/hook/injection rules, authoring-time only, spec.md:474-494) and 153 test files. **All structural**: nothing checks that a body changes agent behaviour; that evidence lives only in `test/evals`.

## Token implications
Method: `cost2.cjs` replicates `rule-load.cjs` from source (extends + template composed, inlined bases dropped); it matches the audit's TypeScript 40,865 B within 18 B. `rule-load.cjs` itself needs `dist-cli`, so was not run.

| Language | All rules | Source file open | Test file | Manifest | Descriptions (skills+agents) |
|---|---|---|---|---|---|
| TypeScript | 56.4 KB | 40.9 KB (8) | 46.4 KB | 17.6 KB | 7.4 KB |
| Angular | 64.5 | 49.3 (12) | 46.5 | 9.6 | 7.8 |
| React | 40.8 | 32.3 (9) | 37.9 | 9.2 | 7.4 |
| C# | 56.6 | 37.0 (7) | 42.1 | 25.9 | 6.7 |
| Python | 43.4 | 31.8 (8) | 37.6 | 9.0 | 7.0 |

- **Always-loaded rule bytes: 0 in a language install (F).** Every language rule has `appliesTo`; the universal `clean-code` (2.2 KB) and `git` (3.4 KB) bases are inlined into each language rule and dropped as standalone files. Without a language they are `**/*` rules: Claude `paths: **/*`, Copilot one repo-wide file (4.8 KB in the existing build; `repo-wide-rules.ts:1-20`).
- **Path-scoped (Claude):** a `.ts` edit pulls about 41 KB (about 10k tokens) because one glob matches 8 rules, including git and documentation. **Copilot (I):** same bytes if the model opens each file; it first sees an index of globs + descriptions (1.1-1.7 KB per language) and decides (`copilot/spec/rule.ts:21-26`).
- **On-demand:** skill bodies 2.7-8.4 KB; references 31-39 KB for cli/wizard loaded per mode; agents 3-9.5 KB in subagent context. Plugin mode inlines rules into skills: `ts-audit-deps` 17.2 KB, `ts-release` 15.5 KB per invocation.
- **Full Copilot build:** `.github/AGENTS.md` concatenates all 39 agents, 199 KB in the existing `dist/` (I: only if used as always-on; `add` does not write it).
- **Duplication:** verbatim overlap across languages is low (mean 5-gram containment: rules 0.05, agents 0.13, skills 0.16; release skills 0.50, now templated). Conceptual overlap rule/agent/skill is high but not measured.

## Strengths
1. The only repo in this set that **measured whether its own prose helps** and removed prose that hurt (below).
2. Path-scoped rules: no always-on rule tax in language installs.
3. Structure is data behind a gate; audit findings became conformance rules.
4. The installer treats user files as the user's (merge, backup, drift classes).
5. One neutral source for two vendors, with a generated capability table.

## Weaknesses and Known gaps
- **Rules showed no correctness gain on the eval tasks.** Hidden tests 18/18 with no rules and with rules; cost $4.17 vs $10.14 and 158 vs 237 turns (code-quality/results.md:142). The eval ceiling means it cannot show a benefit.
- **Prose with no measurable effect:** PR4 scope ladder (8 decided pairs, p=0.363, results.md:144), PR5 guards (p=0.377, :145), PR6 reviewer design section (+1 vs +2 gate, :151, audits results:19), PR7 "Not for" clauses (24/24 correct dispatch, so nothing to fix). The driver was prose telling agents when to split functions: removing it cut declarations 161 to 120, p=0.0287 (:152). Round 4's replacement wording made T1 inflate (14 runs, :150). **I** Other languages' structure slots were edited the same way but never measured (:114).
- **Negative triggers:** 15 of 44 skill descriptions say "Not for/do not use" (strict regex in `cost2.cjs`; the audit's looser count is 19, audits README:48); **0 of 39 agent descriptions** do; rules and prompts have none. Agents have no `whenToUse` channel (CLAUDE.md).
- **Validators check structure, not behaviour:** all 20 conformance rules are static; `when-to-use-quality` is a warning.
- **Missing topics (grep, 0 hits):** integration/e2e/property/mutation tests, API design, DB migrations, observability beyond logging, Node servers/workers/shutdown, ASP.NET/EF rules, FastAPI/Django rules, Go/Rust rules and agents (language.yaml only), debug and spec skills of its own, PR/commit-message prompts, any shipped workflow or Stop-time format/typecheck hook (1 hook only).
- **Guidance that can mislead:** `Promise.all` over "independent items" with no concurrency cap (ts-async.rule.md:59-71; ts-performance-profiler.agent.md:61-62); design-pattern list "use Strategy, Factory, Adapter, Builder" (ts-code-quality.rule.md:50-53); unconditional "Inject dependencies" (:28); arbitrary 80% overlap rule (code-quality.template.md:62-65); TS agents default to vitest (ts-debugger.agent.md:35); react-conventions.rule.md:27 prefers `data-testid` against react-testing.rule.md:28.
- **Security by instruction:** reviewers and auditors list `Bash` yet say "read-only by instruction, not sandboxed" (ts-security-auditor.agent.md:7). Only the 3 shared agents set model/effort (`claude:`); 36 language agents inherit.
- **Skill/agent evals:** only cli and wizard skills have scenarios, against an old-skill baseline, not a no-skill one (test/evals/README.md:34-37); no evals for the 41 language skills, 36 language agents, or `feature`.

## Maintenance burden
**I** Five languages with parallel rules, agents and skills mean every cross-cutting edit is 5-way (D2 edited every language's structure slot). `standard.yaml` (15.8 KB) lists members by hand. 327 commits, 153 test files; eval runs repeatedly hit usage limits (results.md:155).

## Open questions
- Does any rule set improve correctness where the baseline fails? (All eval tasks pass at baseline.)
- Do Copilot users load the 41 KB or only an index? Needs a live check.
- Are the unmeasured Angular/React/C#/Python edits safe?
- Is 5-way agent duplication worth it versus one parametrized agent with per-language checklists?

## Top ideas worth taking
1. **Registered-hypothesis, paired-sign-test eval with held-out tasks and a bytes-do-not-grow gate** (`test/evals/code-quality/README.md:49-63`). It stops prose from shipping on belief. Evidence: it rejected four candidates and accepted D2 (results.md:144-152).
2. **Ablate one rule at a time to find what drives a regression** (results.md:45-66, A1 p=0.000122). Evidence: found the split-gate prose.
3. **Do not write "when to split a function" prose**; keep only a God-Object threshold (results.md:94-114). Evidence: declarations 161 to 120, correctness held, judge neutral.
4. **Path-scope every rule and treat resolved bytes per source file as a budget** (`scripts/rule-load.cjs:2`, audit results.md:28-31). Evidence: a script and a test (`test/rule-load.test.ts`), no outcome eval.
5. **Gate conductor with unhedged approvals, RED-must-fail-for-the-right-reason, a Docs line per task and a docs-drift review** (feature/SKILL.md:31-32, 103-105, 123-126). Evidence: none (no eval).
6. **Reviewer and rule must agree on catch handling; fix contradictions as P0 with a doctrine test** (audit results.md:13-15; `coverage.md` phrase gate). Evidence: unit test of phrases.
7. **A conformance rule per audited defect**, e.g. tool-restriction-coverage (a read-only agent must not install with edit) and when-to-use-lift (21 of 23 skills undispatchable). Evidence: sync --check in CI.
8. **Probe agent dispatch before adding a "Not for" clause** (agent-dispatch/results.md). Evidence: 24/24; prevented unneeded edits.
9. **Mark knowingly-left shortcuts with a greppable `shortcut:` comment** (clean-code.rule.md:25). Evidence: B2 shows it costs nothing (1 use in 18 runs, results.md:153).
10. **"Legacy code is not a precedent; report missing infrastructure, do not add it"** (clean-code.rule.md:24). Evidence: removed the logger licence the pilot exposed; inflation 0 in D2.
11. **Hook that states its blind spots and uses exec form for exit-code fidelity on Windows** (protect-config.hook.md:60-81). Evidence: none beyond unit tests.
12. **Overlays that may narrow but never widen**, recorded in the manifest so update re-applies them (consumer-overlays-2026-10.md:19-40). Evidence: spike go/no-go in the doc; no outcome data.
13. **Family skeletons as data** (`standard.yaml`) with a severity scale shared by all report templates. Evidence: CI gate.
14. **Generated capability table + per-provider lexicon tokens** to keep one body honest for two vendors (capabilities.md; `provider-term-leak`). Evidence: the Copilot-told-to-read-CLAUDE.md defect it was built after.
15. **Scenario evals with seeded defects and a pass bar** (cli S1 11/12, wizard W3 11/11, test/evals/README.md:29). Evidence: re-runs recorded; fixed skill text twice after W6 failures.
