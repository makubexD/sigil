# CTO: return on investment

F = fact (path:line), I = inference; engineer-days (ed) are I. An 18-run arm costs $9.58–$10.17 (results.md:142-153, F);
a 30-run arm (10 tasks × 3) about $17 (I). The binding constraint is elapsed time: 9–15 of 18 runs hit the session
limit and were re-run (results.md:152-153, F).

**Gating principle (I):** prose costs tokens on every load (B0 $4.17 → $10.14, results.md:142, F). A **deletion** needs
non-inferiority; an **addition** needs measured superiority; a **factual error** needs neither, only a RETIRED lock.

## 1. Roadmap

| # | What | Why | Cost | Accept / stop | If it fails, stop doing |
|---|---|---|---|---|---|
| 1 | **Errata sweep (W defects):** F5 (confirmed cs-security.rule.md:84, no separator), F6, F7 (ts-security.rule.md:90 `safeLoad`, F), F9, F10, F12, F13 (cs-async.rule.md:105 `WhenBoth`, F), F14, F16 (ts-testing.rule.md:163 "70%", F), F17+F3, test-gen "Fix any failures" (py:84, react:102, F), protect-config fail-open (principal §3.2) | Wrong code or self-contradiction; no eval needed | 3 ed, $0 | Each has a RETIRED pattern or conditional assertion in catalog-doctrine.test.ts. A fix adding > ~3 lines is new prose: move it to #6 | If > 2 errata prove wrong against docs, require a docs citation per erratum (senior.md:53: API facts from memory) |
| 2 | **F1 concurrency class:** bounded fan-out + F8 shared-context caveat + F11 cancellation semantics; drop the profilers' "Critical" grading of sequential awaits | Recommends unbounded fan-out and crashes (senior F1/F8/F11) | 1.5 ed, $0 | Conditional assertion: fan-out text names a bound; no CANONICAL row forcing prose into react/ng-async | – |
| 3 | **Pin safety carve-outs** before any deletion | O1 is only partial (principal §2, catalog-doctrine.test.ts:48-55) | 0.5 ed | CANONICAL rows for trust-boundary, path, SSRF text | – |
| 4 | **E1:** task-level sign test as primary, unit-tested in `evals:check` (package.json:63); a results.md note that D2 is p = 0.188 at task level | Run-level p overstates the evidence (verdicts.md:17) | 0.5 ed, $0 | Statistic unit-tested | – |
| 5 | **E2+E3: one strategic experiment.** 4 TS trap tasks, each with a bad reference that passes the happy path and fails hidden tests (E3 runs in CI, $0). Run `none` vs current master, 10 tasks × 3 | Decides whether rules earn their 2.4× token cost | 4 ed; ~$35 (+$17 for a pre-#2 arm; runs pin commits, results.md:140) | Registered first; a trap counts only if `none` fails it in ≥ 2/3 runs | **If `none` passes the traps: stop writing correctness prose**, shrink rules to errata + minimal style, kill A1 and C1–C5 |
| 6 | **Deletion ablation:** F4 + F19 + F20 (+ F18) in one arm, non-inferiority gate | D2 is the only measured win, and it came from removal (results.md:152) | 1 ed, ~$17 | Correctness holds, declarations not higher → delete | Bundling; split arms only on regression |
| 7 | **A3 rule-load ratchet in CI** with a reason field | Token cost is the priority; script runs outside CI | 1 ed, $0 | Growth without a reason fails | – |
| 8 | **description-budget onto `limits`** (delete `CHAR_BUDGET`) | Invariant debt (description-budget.ts:20) | 0.5 ed | No numeric provider limit left in conformance/rules | – |
| 9 | **H1 bar-lowering hook** (if the owner approves) | Only deterministic quality enforcement | 2.5 ed, $0 | Principal §5.5 criteria | Do not build H2 |
| 10 | **R1 evidence bar**, only if #5 shows reviewers matter | PR6 missed its gate, +1 vs +2 (results.md:151) | 2 ed + FP scenario, ~$12 | Recall holds, false positives fall | Freeze reviewer prose |

Total: about 16 ed and under $100 in eval spend (I).

## 2. Kills

- **A2** (facts.md:8-9), **H3, T1** (have, facts.md:10-16), **H4, O3, O5, R5** (no measured effect).
- **A1 beyond TypeScript:** each language needs its own task set (~4 ed + $35 each, I); #7 caps cost cheaper.
- **R2, R3, T2, O4, E8:** prose additions that are too small to detect at 10 tasks, which need 9/10 for p ≤ 0.05 (binomial, I).
- **C1–C5 coverage:** see §3. Adding prose has never shown an effect here.
- **F15 as an eval item:** fold into #1 if docs confirm.
- **Sequencing F1 behind the trap baseline (principal §2):** dropped. Runs pin commits, so the pre-fix arm can be run later. Shipping known-bad guidance meanwhile returns nothing.

## 3. Owner decisions

1. **H1** (new hook, Claude only): yes. **H2** Stop typecheck: only after H1, measured on turns.
2. **Copilot hooks** (they exist, principal §2): a second hook target? Not now.
3. **Reviewer Bash guard** (principal §3.3): new PreToolUse surface; verify agent identity reaches hooks first.
4. **C1–C5 coverage:** no, unless #5 shows rules change correctness; then probe-first.
5. **`feature` (S1):** at most one "prefer an installed reviewer" line, never `uses:` (co-installs all five, principal §4).
6. **O6 per-agent model/effort:** no; no evidence, and exact family `keys` make it touch every agent family.

## 4. Is E1/E2 worth it?

Partly. The senior's defects are mostly C#, Python and Angular, and factual (nonexistent APIs, a path check missing its separator). The eval is 6 TypeScript tasks, all at ceiling (verdicts.md:13-19); it cannot detect any of them at any budget. Deterministic fixes (#1–#2) give the best return and must not wait on evals. E1 is nearly free (0.5 ed) and stops us over-reading D2, so do it. E2 earns its cost (about 4 ed and $35–$52) as **one decisive experiment**, not as a standing gate. If `none` already avoids the traps, the rules are a 2.4× token tax with no correctness payoff; cutting to errata plus minimal style then saves more than every prose item combined. If the rules do catch traps, we have the first harness that can justify adding prose. Either way, at 10 tasks the eval detects only large effects (≥ 9/10 tasks). Use it for non-inferiority on deletions and for the strategic question, never to fine-tune wording.
