/**
 * Step-registry engine for the wizard state machines (`add`, `new`).
 *
 * Replaces the hand-rolled `while (true) { if (step === 'x') {...} }` pattern where
 * each arm manually called `history.push(step)` before advancing. That pattern caused
 * a real shipped bug: a pass-through step (no prompt shown) pushed a history frame
 * anyway, so "← Back" from the next step returned to the wrong place.
 *
 * This engine makes that class of bug structurally impossible: `history.push` exists
 * in exactly one place below, on the `'next'` path only, and only for a step whose
 * `run()` actually executed — which only happens when `shouldShow` (if present)
 * returned true. A skipped step never runs, so it can never push a frame.
 *
 * Deliberately has no `next(state)` step-jump primitive (YAGNI): every skip in the
 * existing wizards is expressible as `shouldShow` on the *downstream* step.
 *
 * @module
 */

/** What a step tells the driver to do next. */
export type StepOutcome = 'next' | 'back' | 'cancel';

export interface WizardStep<S> {
  readonly id: string;
  /** Pure predicate. When it returns false, the step is skipped and never enters history. */
  shouldShow?(state: Readonly<S>): boolean;
  /** Prompts the user and mutates `state`. Only ever called when shouldShow (if any) passed. */
  run(state: S): Promise<StepOutcome>;
}

/**
 * Runs an ordered step list against `state` until a step returns 'next' past the end
 * (success) or 'cancel' (abort). Returns `null` on cancel, else the final `state`.
 */
export async function runSteps<S>(steps: readonly WizardStep<S>[], state: S): Promise<S | null> {
  const history: number[] = [];
  let i = 0;

  while (i < steps.length) {
    const step = steps[i]!;
    if (step.shouldShow && !step.shouldShow(state)) {
      i++;
      continue;
    }

    const next = indexAfter(await step.run(state), history, i);
    if (next === null) return null;
    i = next;
  }

  return state;
}

/**
 * Where to go after step `i` returned `outcome`, or `null` to stop. `history.push` lives here and
 * only on 'next'. 'back' with nothing in the history means the steps above this one were skipped,
 * so there is nowhere to go back to: leave instead of asking the same step again.
 */
function indexAfter(outcome: StepOutcome, history: number[], i: number): number | null {
  if (outcome === 'cancel') return null;
  if (outcome === 'back') return history.pop() ?? null;
  history.push(i);
  return i + 1;
}
