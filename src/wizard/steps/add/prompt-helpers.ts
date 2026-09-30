/**
 * Shared cancel/back handling for the `add` wizard's step prompts.
 *
 * Every step follows the same `isCancel(answer) → cancel(...) → return 'cancel'`
 * triad and offers the same `← Back` option — previously copy-pasted at 15+ call
 * sites across this directory. Centralizing it here means the cancel copy and the
 * back-option shape each have exactly one home.
 *
 * @module
 */
import { isCancel, cancel } from '@clack/prompts';
import { BACK } from './state';
import type { StepOutcome } from '../../engine';

/** Message shown when the user cancels out of any `add` wizard prompt (Ctrl+C / Esc). */
export const CANCEL_MESSAGE = 'Install cancelled.';

/** The `← Back` option every step prepends to its choice list. */
export const BACK_OPTION = { value: BACK, label: '← Back', hint: '' } as const;

/**
 * Resolves a raw `@clack/prompts` answer into a step outcome, performing the
 * `cancel()` side effect when the user Ctrl+C'd or Esc'd out.
 *
 * Returns `'cancel'` or `'back'` when the step should stop and report that outcome
 * to the engine; returns `undefined` when the answer is a real value the step
 * should keep processing. Callers use the guard-clause idiom:
 *
 *   const outcome = resolveOutcome(answer);
 *   if (outcome) return outcome;
 *   // answer is now known to be a real value
 */
export function resolveOutcome(answer: unknown): StepOutcome | undefined {
  if (isCancel(answer)) {
    cancel(CANCEL_MESSAGE);
    return 'cancel';
  }
  if (answer === BACK) return 'back';
  return undefined;
}
