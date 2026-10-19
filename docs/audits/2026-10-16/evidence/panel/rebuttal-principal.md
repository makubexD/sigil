# Principal: rebuttal

## 1. Where others are wrong

- **Senior F2 "stronger than drafted":** react-code-reviewer:75 flags `data-testid` only "where `getByRole`/`getByLabelText` would work". That is consistent with role > testid > CSS, and facts.md calls it drift, not a contradiction. Fix: delete react-conventions:27 (P2).
- **Senior F11 for py:** facts.md confirms it for TS only (py-async:59-61 is correct). Drop the py RETIRED pattern.
- **Senior F16 W:** facts.md rates it D. Fix it as "discover the floor", without the W label.
- **CTO §2 kills (R2, R3, T2, E8):** "9/10 tasks for p ≤ .05" is a sign-test bound. With the SME's sign-flip test, power at 20% is .84, not .58. E8 is a per-prompt firing probe, not a code-quality task eval. Keep E8 at P1, since firing confounds every skill-content eval.
- **CTO row 9 (H1)** should adopt the SME's terms. protect-config.hook.md:10 (`"Edit|Write"`) misses MultiEdit and Bash writes.

## 2. Concessions

- **E2 sequencing → dropped.** The CTO is right: results.md:140 records commits per run, so a pre-F1 arm can be run later. F1 ships now.
- **E1:** I take the SME's version: sign-flip on per-task means, a ≥10% magnitude floor, and a fresh baseline per candidate. The `task#run` pairing is arbitrary (measure.mjs:201), and B1's T5 values are biased.
- **F9 → T** (senior). It contradicts clean-code:21.
- **H2 → verify first** (SME), since there were 0 type errors in 180 runs.
- **Errata F5–F7 and F12–F14** are accepted, each with a docs citation. The senior's API facts are from memory.

## 3. Final top 5

1. **Errata + concurrency class (T, P0):** F1/F8/F11-ts, F3/F17, F5–F7, F9, F10, F12–F14, F21, and protect-config fail-open. Accept when every item has a RETIRED pattern or conditional assertion and fan-out text names a bound.
2. **Pin safety carve-outs (CANONICAL), then move `CHAR_BUDGET` to `limits`.** Both must land before any deletion.
3. **E1 sign-flip** (unit-tested in `evals:check`), **E3 selftest, E2 traps.** Keep a trap only if `none` fails it at least once.
4. **The CTO's `none`-vs-master trap experiment**, then the **F4/F19/F20 deletion ablation**, which must also be non-inferior on the traps.
5. **E8 firing probe, then H1** (owner approval). H1 asks only on unjustified markers, diffs old against new, fails closed on malformed stdin, and installs via `replaceMerge`.
