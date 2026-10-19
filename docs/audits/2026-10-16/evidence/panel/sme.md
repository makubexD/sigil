# AI-agent SME: evals, enforcement, dispatch

**F** = fact (path:line, or computed from `code-quality/runs/*.jsonl`). **I** = inference. Code: `bench2/P/sme-stats.js` and `sme-power.js`.

## 1. Answers

**Q1/E1. Replace the sign test with a paired permutation on task means.**
- Runs are paired by `task#run` (`measure.mjs:201`, F). Run indexes share nothing across arms, so the pairing is arbitrary, and the sign test drops magnitude.
- Simulated power (I), one-sided α = 0.05, at 10/20/30% true reduction (τ = task heterogeneity in the effect):

| Test, 12 tasks × 3 runs | Power at 10/20/30% | Type I error |
|---|---|---|
| sign test | .27/.58/.85 | .03 |
| sign-flip on per-task relative means | .45/.84/.98 | .05 |
| stratified run-level permutation | .55/.92/.99 | .08 |

- The stratified test overstates significance when tasks differ, so report it as secondary. A mixed model is fragile at 10–16 clusters (I).
- The 20% net-win floor never binds. Use a magnitude floor instead (≥ 10%).
- On existing data (F):
  - D2 vs B1: sign-flip p = .063.
  - **The shared B1 baseline is biased.** B1's T5 is 10/3/11, while all 9 other arms average 2.3–6.0, so every comparison against B1 got a free T5 win.
  - T3 is 2/2/2 in every arm, so it carries no information.
- More tasks beat more runs: 16 tasks × 2 runs has about the power of 12 × 3 (I; dotnet `README.md:220-223`, F).

**E2. Trap tasks.** Traps tend to sit at ceiling (F):
- ECC passed 72/72, because its traps were discoverable in the repo (`question-effectiveness.md:161-205`).
- ponytail's baseline was 100% safe on path, SQL and HMAC traps (`agentic-safety.md:51`).

How to build them:
1. Keep a trap only if the `none` arm fails it at least once in 3 runs.
2. State the property in the prompt (like T1's "about 1M orders"), never the mechanism.
3. Detect it with instrumented fakes: max in-flight requests, open handles, retained-map size, AbortSignal observed, `cause` chain. Never use greps, API names or wall-clock limits (`results.md:146-147`, F).
4. Ship a bad reference that fails only the trap test, so the test is shown to fail on the trap and not on style.

**Q2. E3, E4, E8.**
- **E3: P0.** It costs no model calls. Add a `judge.mjs` selftest (ponytail `agentic/README.md:79-92`, F).
- **E4: yes, cli S1 and wizard W3 only.** A `none` run costs $0.23 (F).
- **E8: P1, before any skill-prose eval.** One clause moved firing from 7/27 to 21/27 (`agent-skills/evals/README.md:53`, F). Cheapest design: `claude plugin eval` with one fire and one stay-quiet prompt per skill, 3 runs each.

**Q3. H1 and H2.**
- **Neither hook can show an effect on the current tasks (F).** The 183 archived `src` files hold 0 suppression markers, and an in-memory strict `tsc` found 0 real type errors in 180 runs.

**H1.** Three failure modes:
- `Edit|Write` (`protect-config.hook.md:10`, F) misses MultiEdit and Bash writes, and the harness allows `Bash(node:*)` (`run.mjs:126`, F).
- Under `claude -p`, nobody can answer an "ask" (I, verify).
- Asking on justified suppressions breeds click-through.

The fix:
- Allow justified forms: `@ts-expect-error <reason>`, and `eslint-disable-next-line rule -- reason`.
- Ask only on a bare `@ts-ignore`, an unjustified disable, an added `.only` or `.skip`, or a lowered threshold.
- Compare old content against new.
- Back it up with a Stop-time diff scan.

**H2.** The mechanism matches the docs (`facts.md:4-7`, F). Its failure modes need these fixes:
- Block only on type errors new since session start, in files the agent touched; otherwise pre-existing errors block every Stop.
- Skip when nothing changed, since Stop also fires on Q&A turns.
- Time out at about 90 s and fail open with a message.
- After the single `stop_hook_active` retry, tell the user if the check is still red.

Copilot lists no Stop event (`copilot-hooks.md:21-25`, F, unverified), so H2 is Claude-only.

**Measuring both.** Add `typeErrors` and `suppressions` metrics to `measure.mjs`, which already uses the TS compiler API (`key.md:25-26`, F). Then add pressure tasks (an untyped payload, a check that already fails, a flaky test) and compare a `none` arm with a hook arm. Headless runs can only test H1 as deny-with-reason, which is a proxy for asking (I).

**Q4. R1 precision.** Recall is at ceiling: the base found 5.0 of 7, so a +2 gate needs a perfect candidate (F, `results.md`). Add a precision check:
- **Clean fixture:** add `fixture-review-clean` with about 6 decoys, such as a bounded `Promise.all` over a tuple, a top-level rethrow with `cause`, and a justified disable.
- **Scoring:** count invented findings at mid severity or above, and the "no findings" rate.
- **Evidence (I):** run each finding's failing case. A finding whose case passes counts as invented.
- **Test:** sign-flip over about 13 items, 5 runs per arm.
- **Gate:** recall not lower, false positives not higher.

**Q5. Load mode.** B0 turns went from 8.8 to 13.2 per run at equal correctness (F). Always-loaded rules get executed as procedure on every session; a skill body costs only when it fires (I). The table gives every **E** item one bar regardless of load mode. Instead:
- Byte budgets (A3) apply to rules.
- For skills, test firing (E8) before content.
- Move anything checkable into hooks or CI.
- Gate descriptions like rules: they shape replies even when nothing fires (`agent-skills/evals/README.md:53`, F).
- Misleading always-on text (F1–F3) is applied literally, so fix it with tests rather than evals.

## 2. Verdict changes

| ID | From → to | Why |
|---|---|---|
| E1 | Sign test with a 20% floor → sign-flip on task means, a ≥ 10% magnitude floor, and a fresh baseline run alongside each candidate | Power; the B1 bias; the floor never binds |
| E2 | Add `none` calibration and drop classic security traps | ECC and ponytail traps sat at ceiling |
| E3 | P1 → **P0**, plus a judge selftest | No model cost |
| E8 | P2 → **P1** | Firing confounds content |
| H1 | Ask only on unjustified forms, plus a Stop diff backstop | Bash bypass; click-through |
| H2 | strengthen → **verify first** | 0 type errors in 180 runs |
| R1 | +2 recall gate → per-item test with a clean fixture | Recall at ceiling; precision unmeasured |
| A1/F4 | Deletions must also be non-inferior on trap tasks | A deletion-only eval cannot see lost correctness |

## 3. Eval-v2 spec

- **Tasks.** Each ships a good and a bad reference.
  - **F (fragmentation):** T1, T2, T4, T5, T6 plus 3 new tasks.
  - **C (traps):** 6–8 tasks calibrated on `none`.
- **Runs.** 3 per task (2 once K ≥ 16), against a fresh interleaved baseline run the same day. Record the CLI version.
- **Statistic.** Exact one-sided sign-flip on per-task means, with Holm across F and C.
- **Accept a deletion** when F has p ≤ .05 with at least 10% reduction, C loses no more than 1 pass, and hidden tests and bytes do not get worse.
- **Accept an addition** only when C reaches p ≤ .05.
- **Budget:** at $0.55–0.70 per run (F), calibration is 30 `none` runs (about $8) and each comparison is 84 runs (about $46–59). Add about $11 of `none` runs per new model, 20 short runs for R1 precision, and about 150 short runs for E8.
