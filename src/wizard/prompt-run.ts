/**
 * Runs the four prompts on `@clack/core` with our own renderers (`prompt-views.ts`). The keys,
 * the answers and the cancel symbol are clack's; what changes is that every frame is drawn for the
 * window as it is at that moment, and that an answered prompt collapses to one short line. While a
 * prompt is open the window size is re-read on a timer, so a zoom or a resize applies to it.
 *
 * @module
 */
import type { Readable, Writable } from 'node:stream';
import { ConfirmPrompt, MultiSelectPrompt, SelectPrompt, TextPrompt } from '@clack/core';
import { renderConfirm, renderMultiSelect, renderSelect, renderText } from './prompt-views';
import type { MultiSelectView } from './prompt-views';
import type { ConfirmOptions, MultiSelectOptions, SelectOptions, TextOptions } from './prompt-fit';
import { watchWindowSize } from './terminal';

/** Shown, with a hint, when a required multi-select is submitted empty. */
const NOTHING_CHOSEN = 'Please select at least one option.\nPress space to select, enter to submit';

/** Where a prompt reads keys and draws; the terminal unless a test supplies streams. */
export interface Io {
  input?: Readable;
  output?: Writable;
}

/** `{ key: value }`, or nothing when `value` is undefined: core's options reject an explicit undefined. */
function given<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}

/** A validator that refuses an empty answer when one is required. */
const refuseEmpty =
  (required: boolean) =>
  (value: unknown[]): string | undefined =>
    required && value.length === 0 ? NOTHING_CHOSEN : undefined;

/** Runs `prompt` and stops the window watcher however it ends. */
async function drive<Answer>(prompt: { prompt(): Promise<unknown> }): Promise<Answer | symbol> {
  const stop = watchWindowSize();
  try {
    return (await prompt.prompt()) as Answer | symbol;
  } finally {
    stop();
  }
}

export function runSelect<Value>(opts: SelectOptions<Value>, io: Io = {}): Promise<Value | symbol> {
  const { message, maxItems } = opts;
  return drive(
    new SelectPrompt({
      ...io,
      options: opts.options,
      ...given('initialValue', opts.initialValue),
      render() {
        const { state, options, cursor } = this;
        return renderSelect({ state, message, options, cursor, maxItems });
      },
    }),
  );
}

export function runConfirm(opts: ConfirmOptions, io: Io = {}): Promise<boolean | symbol> {
  const { message, active = 'Yes', inactive = 'No' } = opts;
  return drive(
    new ConfirmPrompt({
      ...io,
      active,
      inactive,
      initialValue: opts.initialValue ?? true,
      render() {
        const { state, value } = this;
        return renderConfirm({ state, message, value: Boolean(value), active, inactive });
      },
    }),
  );
}

/** What the multi-select looks like right now, from the prompt's own state. */
function multiView(
  prompt: Pick<MultiSelectView, 'state' | 'options' | 'cursor' | 'error'> & { value?: unknown },
  message: string,
  maxItems: number | undefined,
): MultiSelectView {
  const { state, options, cursor, error } = prompt;
  const value = (prompt.value ?? []) as unknown[];
  return { state, message, options, cursor, value, error, maxItems };
}

export function runMultiSelect<Value>(
  opts: MultiSelectOptions<Value>,
  io: Io = {},
): Promise<Value[] | symbol> {
  const { message, maxItems, required = true } = opts;
  return drive(
    new MultiSelectPrompt({
      ...io,
      options: opts.options,
      ...given('initialValues', opts.initialValues),
      ...given('cursorAt', opts.cursorAt),
      required,
      validate: refuseEmpty(required),
      render() {
        return renderMultiSelect(multiView(this, message, maxItems));
      },
    }),
  );
}

export function runText(opts: TextOptions, io: Io = {}): Promise<string | symbol> {
  const { message, placeholder } = opts;
  return drive(
    new TextPrompt({
      ...io,
      ...given('placeholder', placeholder),
      ...given('defaultValue', opts.defaultValue),
      ...given('initialValue', opts.initialValue),
      ...given('validate', opts.validate),
      render() {
        const { state, error, cursor } = this;
        const value = String(this.value ?? '');
        return renderText({ state, message, placeholder, value, cursor, error });
      },
    }),
  );
}
