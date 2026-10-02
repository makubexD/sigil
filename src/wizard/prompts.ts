/**
 * The one door for everything the user sees. `log` and `note` wrap to the window (`say.ts`),
 * `intro` / `outro` / `cancel` keep the menu to a single frame (`frame.ts`), and `select`,
 * `confirm`, `multiselect` and `text` are drawn for the window as it is at that moment
 * (`prompt-run.ts`, `prompt-views.ts`): lines are cut to it, answered prompts collapse, and an open
 * prompt follows a zoom or a resize.
 *
 * Only this file, `say.ts`, `frame.ts` and the `prompt-*.ts` files may import clack; a test scans
 * for it. The four prompts are plain functions here (not re-exports) so the test mock can replace them.
 *
 * @module
 */
import { runConfirm, runMultiSelect, runSelect, runText } from './prompt-run';
import type { ConfirmOptions, MultiSelectOptions, SelectOptions, TextOptions } from './prompt-fit';

export { isCancel } from '@clack/prompts';
export { cancel, intro, noteOnce, outro } from './frame';
export { log, note } from './say';
export type { Choice } from './prompt-fit';

export function select<Value>(opts: SelectOptions<Value>): Promise<Value | symbol> {
  return runSelect(opts);
}

export function multiselect<Value>(opts: MultiSelectOptions<Value>): Promise<Value[] | symbol> {
  return runMultiSelect(opts);
}

export function confirm(opts: ConfirmOptions): Promise<boolean | symbol> {
  return runConfirm(opts);
}

export function text(opts: TextOptions): Promise<string | symbol> {
  return runText(opts);
}
