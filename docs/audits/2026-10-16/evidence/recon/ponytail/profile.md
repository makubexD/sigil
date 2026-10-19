# Profile: ponytail (DietrichGebert/ponytail) v5.2.0, commit 2961b52, MIT

Marking: **[F]** fact with path:line, **[I]** inference.

## Sampling disclosure
- Read fully: `AGENTS.md`, all 6 `skills/*/SKILL.md`, `.github/CONTRIBUTING.md`, `scripts/check-rule-copies.js`, `hooks/claude-codex-hooks.json`, `hooks/ponytail-instructions.js`, `hooks/ponytail-map.js`, `hooks/ponytail-activate.js`, `benchmarks/results/2026-10-07-agentic.md`, `benchmarks/agentic/README.md`, `package.json`, `.github/workflows/test.yml`.
- Read in part (first 25-120 lines or targeted greps): `README.md`, `hooks/ponytail-config.js`, `hooks/ponytail-mode-tracker.js`, `hooks/ponytail-subagent.js`, `benchmarks/agentic/{run,compare,complete,judge,tasks}.py`, six other `benchmarks/results/*.md`, `benchmarks/promptfooconfig.yaml`, `behavior.yaml`, `tests/{behavior,correctness,commands,map,activation-map}.test.js`, `INSTALL.md`, `docs/agent-portability.md`.
- Listed only (names/sizes in `listing.tsv`, 202 files): hook runtime/statusline/cursor scripts, `.opencode/plugins/*`, `pi-extension/`, `__init__.py` (Hermes), `scripts/{uninstall,cursor-hooks,publish-openclaw-skills}.js`, remaining 15 test files, `examples/*` (two sampled), `i18n/*`, `assets/*` (50 images), manifests. No network, nothing executed.

## 1. Purpose and users
Ponytail is a single behavioural prompt: "lazy senior developer, the best code is the code never written" [F AGENTS.md:1-3]. Goal: smaller diffs, lower token/cost, without dropping validation/security. Users: individual developers on any of ~20 agents (README badge says 20). Maintainer is one person ("New skills come from me", .github/CONTRIBUTING.md:5-7). It is a style/restraint layer, not a language or framework knowledge pack.

## 2. Core capabilities
1. Always-on rule (3.5 KB skill / 2.7 KB AGENTS.md): 6-rung "smallest complete change" ladder + never-cut list + test reflex + closing "skipped / risk" line [AGENTS.md:9-30].
2. Three levels lite/full/ultra [skills/ponytail/SKILL.md:46-52].
3. `/ponytail-review` (diff) and `/ponytail-audit` (repo): evidence-gated, load-aware findings.
4. `/ponytail-debt`: ledger of `shortcut:` comments.
5. `/ponytail-gain`, `/ponytail-help`: UX cards.
6. Hooks inject the ruleset (session start, subagent start), switch levels, and add a 2 KB codebase map.
7. An agentic benchmark harness and a 3-arm contribution gate for rule changes.

## 3. Architecture model
- Authoring: markdown only. One canonical `skills/ponytail/SKILL.md`; `AGENTS.md` is its compact twin; 7 host rule files are byte copies of AGENTS.md, enforced by CI [F scripts/check-rule-copies.js:19-37]; `.openclaw/skills/` generated from `skills/` [F .github/CONTRIBUTING.md:70].
- Composition: none. No `uses`/`extends`; the 6 skills are independent and review/audit share ~85% prose by hand copy [I, comparing the two files].
- Activation: (a) Claude Code/Codex/Copilot/Cursor/Qoder hooks: SessionStart injects SKILL body filtered to the level, optional map, plus a statusline setup nudge [F hooks/ponytail-activate.js:60-70,72-166]; SubagentStart repeats injection for every subagent (regex-scopable) [F hooks/ponytail-subagent.js:4-10]; UserPromptSubmit handles `/ponytail <level>` and "stop ponytail" [F hooks/ponytail-mode-tracker.js]. (b) Rule-file hosts (Cursor, Cline, Windsurf, Kiro, Copilot instructions, Qoder): permanent always-on 2.6-2.7 KB. (c) Skill hosts: description matches "any coding task" [F skills/ponytail/SKILL.md:3-8].
- Distribution: Claude Code marketplace (two `/plugin` commands), Codex/Copilot/Devin/Grok/Kimi/Gemini/OpenCode/pi/Hermes/Qoder native plugin manifests, npm `@dietrichgebert/ponytail`, ClawHub skills, or copy AGENTS.md [F README.md:128-148; INSTALL.md; docs/agent-portability.md:7-].

## 4. Platforms
Claude Code is the reference and only benchmarked host [F results/2026-10-07-agentic.md:15]. Other hosts are adapters with per-host tests (tests/*-plugin.test.js listed). Hook features need `node` on PATH [F INSTALL.md:3]. ## 5. Languages and frameworks
**None.** grep of `skills/` and `AGENTS.md` for typescript, angular, csharp/.net, python, async, mypy, pytest, jest, xss, csrf, N+1 returns no hits; "react" appears only in the benchmark scoreboard text [F]. The only language-aware code is the map's per-language export regexes (py, js/ts, go, rs, rb, jvm/cs/php/swift) [F hooks/ponytail-map.js:25-35]. Examples in `examples/` are single-shot outputs for email/debounce/CSV/React countdown/rate-limit. See `coverage.tsv`: all language-specific cells are depth 0; language-agnostic cells reach depth 1-2 (testing=2).

## 6. Lifecycle coverage
| stage | coverage |
|---|---|
| spec / requirements | one rule: "A vague request gets the smallest version that does the core job"; ultra "push back" [AGENTS.md:13; SKILL.md:52]. No spec workflow. |
| plan | "Before you write": list every place the change must reach [AGENTS.md:7]. No plan artifact. |
| implement | the ladder; root-cause bug fix; keep codebase structure |
| verify | "Lazy code without its check is unfinished" [AGENTS.md:27]; no verify command/hook |
| review | `/ponytail-review`, `/ponytail-audit` (strong, see below) |
| ship / git / CI | none for consumers (only the repo's own CI) |
| debt | `/ponytail-debt` |

## 7. Review and finding discipline (asked specifically)
- Order of importance fixed: "correct, safe, holds under load, tested, fast, lean" [skills/ponytail-review/SKILL.md:12].
- **Evidence gate**: "Every finding needs a concrete case: 'this input or situation leads to this wrong result'. No case, no finding." [ponytail-review/SKILL.md:59-60; same ponytail-audit/SKILL.md:59-60]. Plus: re-read lines and confirm the caller exists / value can be empty / code really unused [review:61-62]; grep tests, fixtures, config, dynamic refs before calling code unused [audit:61-62].
- **Anti-noise**: "No style taste, no 'consider', no vague worries." [review:67]. Marked `shortcut:` comments are decisions unless load already crosses the ceiling [review:63-64].
- **Context breadth**: read callers of every changed function, grep every caller on signature change [review:21-25]; state and judge against an assumed load [review:26-28].
- **Severity scale**: three groups Must fix (bug, security, data loss, breaks at load) / Should fix (untested risky code, real slowness, duplication, mixed-job function, code that should not exist) / Nice to have [review:76-80]. No numeric severity, no confidence.
- **Report format**: "What this change does", numbered findings each with What this is / Problem / Fix / If we skip it, then `Verdict:`, `Lean: -N lines`, `Not checked:` [review:74-96]. Audit caps at 20 findings and states omitted count [audit:83-84].
- Lean axis has named sub-types delete / reuse / stdlib-native / yagni / merge / split with the guard "Split by job, never by line count" [review:46-55].
- Weak spots: no language checklists; plain-English mandate [review:71-72] raises tokens for expert readers; evidence gate is untested by any eval (the benchmark's review claim "100% of planted problems found, no skill 87%" appears only in an image alt text, README.md:99, [I] no method found in the repo for it; the README alt text was truncated in my read, so treat the figure as unverified).

## 8. Code quality and simplicity guidance
Always-on text (AGENTS.md:9-30, ~2.7 KB): ladder; "No abstraction, wrapper, type conversion, option, config, boilerplate or 'for later' code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition." [:21]; "A one-liner that needs decoding is not short" [:22]; comment only the why [:23]; moved/merged code keeps validation [:25]; prefer edge-case-correct among equal-size options [:26]; shortcut comment format [:28]; never-cut list [:30]. Active every session via hook (full level default) [hooks/ponytail-config.js:16]. Byte cost: ~3.2 KB body per session, repeated per subagent; plus map <=2000 chars. Reviews load only on demand (5.1-5.4 KB).

## 9. Customization and precedence
- Level: session `/ponytail lite|full|ultra|off`; persistent default `/ponytail default <mode>` writes config [F mode-tracker.js ~L55-66]; resolution env `PONYTAIL_DEFAULT_MODE` > `~/.config/ponytail/config.json` (or `%APPDATA%`) > `full` [F hooks/ponytail-config.js:4-10]. `review` can never be a default [config.js:82-84].
- Other knobs: `PONYTAIL_SUBAGENT_MATCHER`, `PONYTAIL_MAP=0`, `PONYTAIL_MAP_CHARS`, `PONYTAIL_QUIET_STARTUP`, `PONYTAIL_HIDE_STATUS`.
- Marker word: tell the agent in project `CLAUDE.md`/`AGENTS.md` [F README.md:175]; the precedence between that text and the injected ruleset is whatever the model decides [I].
- No project-level overlay, no per-language additions, no rule extension mechanism.

## 10. Testing, validation, CI of the repo itself
CI runs `check-rule-copies`, `check-versions`, `npm test` on Node 22 + Python (pandas) [F .github/workflows/test.yml]. Tests (22 files) are mostly structure/adapter conformance: manifests, command files exist for every registered command [tests/commands.test.js:1-10], version agreement, copies in sync. Behavioural tests exist for the repo's own scripts: hooks run via `spawnSync` with windows/stdin cases, map hardening against injected repo text [tests/map.test.js:8-9], fail-open map scenarios [tests/activation-map.test.js:9]. Graders for benchmark are unit-tested with known good/bad outputs [tests/behavior.test.js:1-7]. **No CI test checks that a model follows the prompt**; model behaviour is measured only by manual, paid benchmark runs.

## 11. Benchmark critique (asked specifically)
Method [F benchmarks/results/2026-10-07-agentic.md:10-34]: headless `claude -p`, Opus 5.5, 39 tasks x 5 runs x 3 arms (585 sessions); fresh temp dirs, CLAUDE.md and auto memory off, Bash disabled so nothing is executed by the agent; skill via `--plugin-dir`, transcript checked. Metrics: delivered lines, gzip, output tokens, cost, time, turns; geometric mean of per-task median ratios, 95% bootstrap CI, sign test. Tasks: 12 template features (scored on `git diff`), 18 hidden-check tasks, 6 "build me" apps, 3 "show me" examples. Judges: Sonnet 5.5 blind pairwise for replies; Opus 5.5 for completeness; earlier Sonnet 4.6 over-engineering judge [agentic/README.md:82-92].

Strengths: real agent as baseline (not a bare chatty model) [agentic/README.md:23-24]; a contamination bug in an earlier run disclosed and the result superseded [:196-201]; scorer self-tests with good/bad refs [:79-80]; negative results published (llama3.2 null effect, OpenAI reasoning models cost more, email validator regression on OpenAI) [results/2026-06-15, -06-16, -06-17]; per-task table is published [results:133-172].

Could the numbers be explained by something else?
1. **Task choice / rule-test co-evolution (high risk).** Tasks are author-written and many mirror rules: `tmpl-fe-datepicker` vs rung "house component beats a native widget" [AGENTS.md:15; README.md:92]; `trace-transfer` is the reproducer for issue #245 and the rule "grep every caller" was added to fix it, 1/6 -> 6/6 [results/2026-06-22-issue-245-217-comprehension.md]; `scope-recipients` vs "data it would destroy or expose" [AGENTS.md:7]; `scope-rename`/`conv-*` vs "callers, tests and fixtures" and "keep the structure" [AGENTS.md:20-21]. Contribution policy requires benchmarking changes on tasks where the change "should make a difference" [CONTRIBUTING.md:24], i.e. train-on-test by design. Ponytail 5 was selected by paired runs on the same suite [results:5-8]. No held-out suite is described.
2. **Metric alignment.** LOC/tokens are what the prompt optimizes; the test metric "a test where the logic needs one" was defined by ponytail's own rule and tasks sorted by it before scoring [results:92-98], so +30 points (68% -> 98%) is largely conformance to the instruction, not independent quality. Mutation catch rate where a test exists is 69% vs 77% no-skill [results:105]: tests are less thorough.
3. **Small n.** 5 runs per task-arm; hidden-check pass 87/90 vs 86/90 vs 86/90 [results:66] is not a difference; the authors say "the three arms are level" [results:71]. Privacy task 2/5 in all arms [results:72]. So "no worse" is supported only weakly; "safer" is not claimed in the results file (README says "less code, no less safe").
4. **Baseline.** Strong (real agent, no skill) but the no-skill arm is also uninstructed about terseness; a one-line "Be brief" or YAGNI arm exists in the harness (`brief`, `yagni`, `yagni-oneliner`: run.py:39-41) but the 2026-10-07 table reports only baseline vs two ponytail versions [results:36-46]. Whether 5 words recover most of the gain is not shown in the headline run (the harness note says "Be brief" matched caveman in an independent test, run.py:41).
5. **Self-judging.** Replies judged by a Sonnet-class model and completeness by Opus 5.5, the same family as the agent; against no-skill the reply judge found no significant difference (82:106, p=0.09) [results:121]. Completeness judge sees only the diff on repo tasks and neutralises only `ponytail:`, not the v5 `shortcut:` marker, so it is not fully blind [complete.py:120]; it scores each arm in absolute 0-3 so a leak would matter little. Completeness was 100% for both arms, a ceiling effect [results:84].
6. **Prompt leakage.** Fixed for repo state (temp dirs outside git; AGENTS.md excluded) [results:24-27]. Residual: the skill text and tasks live in the same repo as the harness, and the harness's `bad` refs encode the expected failure. No evidence the model saw task ids.
7. **Statistics provenance.** Bootstrap intervals are in the results [results:38-44] but `compare.py` implements a sign test only [compare.py:2,46]; I found no bootstrap code under `benchmarks/` (grep) [F]; the `Reproduce` section points to `--rescore` [results:186]. Cannot verify how the CIs were produced.
8. **Generalization.** Own docs: no transfer to llama3.2, costs more on gpt-5.x reasoning models, email validation regressions on OpenAI [results/2026-06-15..17]. Headline is Claude Opus 5.5 on Claude Code only. The harness itself says six tasks cannot claim production readiness [agentic/README.md:161-162].
Verdict [I]: the effort/size/cost reductions are plausibly real on Claude (the baseline is fair and the effect is large, e.g. datepicker 335 -> 10 lines), but the correctness/safety claim is "not worse at n=5", and the test-rate gain is partly circular.

## 12. Token implications
Always-on: ~3.2 KB (body) per session, repeated per subagent unless `PONYTAIL_SUBAGENT_MATCHER` scopes it; map adds up to 2 KB; rule-file hosts carry 2.6-2.7 KB permanently. Reply overhead: one or two closing lines. Authors' own data: the net effect can be positive cost on reasoning models because the ruleset is re-sent every call [results/2026-06-17-cost-verification.md]. Repo duplication: 20 rule/skill files, ~62 KB by listing (7 byte-copies of AGENTS.md plus .openclaw copies of 6 skills).

## 13. Strengths
Tiny, specific, ordered; explicit never-cut list; evidence-gated reviews; measured with a fair baseline and honest limits; CI pins safety carve-outs; hook design is fail-open and injection-aware.

## 14. Weaknesses
No language/framework content; global (not per-project) level; statusline nudge and settings handling are off-mission; heavy host-adapter maintenance (13 hook files, ~8 manifests, Windows workarounds); review/audit duplication; benchmark tuned on its own tasks; behaviour not CI-tested; single maintainer.

## 16. Licence / attribution
MIT, "Copyright (c) 2026 DietrichGebert" [LICENSE:1-3]; requires keeping the copyright and permission notice in copies or substantial portions. `skills/ponytail/SKILL.md:10` declares `license: MIT`. `benchmarks/arms/caveman-SKILL.md` is a vendored MIT file from JuliusBrussee/caveman [benchmarks/promptfooconfig.yaml:7], so reuse of that file needs its notice. README asks to install only from the official sources (README.md:154) - not a licence term.

## 17. Open questions
- How were bootstrap CIs and the review "100% vs 87% planted problems" figure produced (code/data not found)?
- Effect of the codebase map alone (no ablation arm).
- Behaviour on non-Claude hosts (Copilot, Codex): untested in the agentic harness.
- Do `lite`/`ultra` levels have any measured effect? Only `full` is benchmarked.

## Top ideas worth taking (ranked)
1. **"No case, no finding"**: each review finding needs a concrete input/situation and a re-read confirmation. `skills/ponytail-review/SKILL.md:59-62`. Cuts false positives and review tokens. Evidence: none directly (no review-quality eval in repo; README alt text claims a planted-problem test, unverified).
2. **Pin safety carve-outs as CI invariants** so rewording cannot drop "validation at trust boundaries / prevents data loss / security / accessibility". `scripts/check-rule-copies.js:44-56`. Prevents silent regression of guard text. Evidence: it is a test that runs in CI.
3. **Ordered reuse ladder with in-repo reuse first**: "Already in this codebase? Use it" before stdlib, dependency, minimal code. `AGENTS.md:11-18`. Reduces duplicated helpers and unneeded deps. Evidence: agentic benchmark -53% LOC, per-task table (results:133-172); `reuse-*` tasks show no change (9/9, 20/19/21 lines), so effect is mainly on open-ended features.
4. **Bug fix = grep every caller, fix the shared function once.** `AGENTS.md:24`. Evidence: `trace-transfer` 1/6 -> 6/6 on Sonnet/Opus (results/2026-06-22-...md), n=6, tuned on that task; in the 10-07 table all arms pass (5/5).
5. **Cheap precomputed codebase map at session start** (names per folder, 2 KB budget, fail-open, identifier allow-list). `hooks/ponytail-map.js:2,16,22`; tests `tests/map.test.js:8`. Saves exploration tokens, supports reuse. Evidence: hardening tests only; no effect measurement.
6. **Structured, greppable shortcut debt** `shortcut: <limit>, <when to upgrade>` plus a ledger skill that tags missing triggers. `AGENTS.md:28`, `skills/ponytail-debt/SKILL.md:36`. Evidence: none.
7. **Evidence discipline in the benchmark harness**: good and bad reference per scorer with `--selftest` before API spend, bad ref correct on the happy path. `benchmarks/agentic/README.md:68,79-80`. Evidence: it is the eval itself.
8. **Completeness judge next to size metrics** so "less code" cannot win by doing less. `agentic/README.md:101-108`. Evidence: 100/100 vs 105/105 (ceiling).
9. **Mutation-style test quality metric** (flip a comparison, drop an `if`, run the agent's own test). `results/2026-10-07-agentic.md:92-110`. Evidence: reported 66% vs 46% over all cells; tool not found in repo.
10. **Inject the ruleset into subagents** (SubagentStart) with opt-in regex scope, since SessionStart context is parent-only. `hooks/ponytail-subagent.js:4-10`. Evidence: bug report #252 in comments; no measurement.
11. **Name the load you assumed and judge scale against it** in reviews/audits; disclose unread parts and cap findings. `ponytail-audit/SKILL.md:22-28,83-84`, `:98`. Evidence: none.
12. **Closing line "what I skipped / did not check, and any risk"** on every reply. `AGENTS.md:3`. The reply judge's main reason for preferring v5 over v4.13 [results:125-126]; vs no-skill no significant difference.
13. **Contribution gate: three arms, a task that should change, a task that might break, >= 6 runs.** `.github/CONTRIBUTING.md:16-29`. Keeps prompt growth honest (rejected 8 edits that did not move the number, results/2026-06-16-robustness-audit.md).
