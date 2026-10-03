/**
 * What each prompt looks like in each state. Pure: a view in, a frame out, so every size and state
 * can be tested without a terminal. The shapes follow clack's own prompts (symbols, colours, the
 * `│` gutter), with two differences that matter on a small window: every line is cut to the
 * window, and an answered prompt collapses to one short line, however many things were chosen.
 *
 * @module
 */
import pc from 'picocolors';
import { fitLine, terminalWidth } from './terminal';
import { cutFrame, fitRows, head, symbols, visibleItems } from './prompt-fit';
import type { Choice, PromptState } from './prompt-fit';

const labelOf = (row: Choice<unknown>): string => row.label ?? String(row.value);
const hintOf = (row: Choice<unknown>): string => (row.hint ? pc.dim(`(${row.hint})`) : '');
const bar = (state: PromptState): string =>
  state === 'error' ? pc.yellow(symbols.bar()) : pc.cyan(symbols.bar());
const grayBar = (): string => pc.gray(symbols.bar());
/** The answered or cancelled line, drawn in the quiet gutter. */
const settled = (state: PromptState, message: string, answer: string): string =>
  cutFrame(`${head(state, message)}${grayBar()}  ${answer}`);
/** A cancelled prompt: the struck-through answer, then the bare gutter. */
const cancelled = (message: string, answer: string): string =>
  `${settled('cancel', message, pc.strikethrough(pc.dim(answer)))}\n${grayBar()}`;

/** The gutter and its spaces, and one spare column. */
const TEXT_MARGIN = 4;

export interface SelectView {
  state: PromptState;
  message: string;
  options: Array<Choice<unknown>>;
  cursor: number;
  maxItems?: number | undefined;
}

export function renderSelect(view: SelectView): string {
  const options = fitRows(view.options);
  const chosen = labelOf(options[view.cursor] ?? { value: '' });
  if (view.state === 'submit') return settled('submit', view.message, pc.dim(chosen));
  if (view.state === 'cancel') return cancelled(view.message, chosen);
  const row = (option: Choice<unknown>, active: boolean): string =>
    active
      ? `${pc.green(symbols.dot())} ${labelOf(option)} ${hintOf(option)}`
      : `${pc.dim(symbols.circle())} ${pc.dim(labelOf(option))}`;
  const rows = visibleItems(options, view.cursor, row, view.maxItems);
  const body = `${bar(view.state)}  ${rows.join(`\n${bar(view.state)}  `)}\n${pc.cyan(symbols.end())}\n`;
  return cutFrame(`${head(view.state, view.message)}${body}`);
}

export interface ConfirmView {
  state: PromptState;
  message: string;
  value: boolean;
  active: string;
  inactive: string;
}

export function renderConfirm(view: ConfirmView): string {
  const answer = view.value ? view.active : view.inactive;
  if (view.state === 'submit') return settled('submit', view.message, pc.dim(answer));
  if (view.state === 'cancel') return cancelled(view.message, answer);
  const on = (text: string): string => `${pc.green(symbols.dot())} ${text}`;
  const off = (text: string): string => `${pc.dim(symbols.circle())} ${pc.dim(text)}`;
  const line = view.value
    ? `${on(view.active)} ${pc.dim('/')} ${off(view.inactive)}`
    : `${off(view.active)} ${pc.dim('/')} ${on(view.inactive)}`;
  return cutFrame(
    `${head(view.state, view.message)}${bar(view.state)}  ${line}\n${pc.cyan(symbols.end())}\n`,
  );
}

export interface MultiSelectView {
  state: PromptState;
  message: string;
  options: Array<Choice<unknown>>;
  cursor: number;
  value: unknown[];
  error: string;
  maxItems?: number | undefined;
}

/** Up to this many chosen names are listed once answered; more are only counted. */
const NAMED_ANSWERS = 3;

/** The answered line: how many were chosen, and by name when that is short. */
function selectedSummary(view: MultiSelectView): string {
  const picked = view.options.filter(option => view.value.includes(option.value));
  if (picked.length === 0) return pc.dim('none');
  const names = picked.length <= NAMED_ANSWERS ? `: ${picked.map(labelOf).join(', ')}` : '';
  const width = terminalWidth();
  const text = `${picked.length} selected${names}`;
  return pc.dim(width === undefined ? text : fitLine(text, width - TEXT_MARGIN));
}

/** One row of the list: a box, ticked or not, with the hint only on the row under the cursor. */
function multiRow(ticked: unknown[]): (option: Choice<unknown>, active: boolean) => string {
  return (option, active) => {
    const label = labelOf(option);
    if (ticked.includes(option.value)) {
      return `${pc.green(symbols.boxOn())} ${active ? label : pc.dim(label)} ${active ? hintOf(option) : ''}`;
    }
    if (active) return `${pc.cyan(symbols.box())} ${label} ${hintOf(option)}`;
    return `${pc.dim(symbols.box())} ${pc.dim(label)}`;
  };
}

/** The refusal under the list: its first line after the corner, the rest indented. */
function errorTail(error: string): string {
  return error
    .split('\n')
    .map((line, i) => (i === 0 ? `${pc.yellow(symbols.end())}  ${pc.yellow(line)}` : `   ${line}`))
    .join('\n');
}

export function renderMultiSelect(view: MultiSelectView): string {
  if (view.state === 'submit') return settled('submit', view.message, selectedSummary(view));
  if (view.state === 'cancel') return `${head('cancel', view.message)}${grayBar()}  `;
  const rows = visibleItems(
    fitRows(view.options),
    view.cursor,
    multiRow(view.value),
    view.maxItems,
  );
  const list = `${bar(view.state)}  ${rows.join(`\n${bar(view.state)}  `)}`;
  const tail = view.state === 'error' ? errorTail(view.error) : pc.cyan(symbols.end());
  return cutFrame(`${head(view.state, view.message)}${list}\n${tail}\n`);
}

export interface TextView {
  state: PromptState;
  message: string;
  placeholder?: string | undefined;
  value: string;
  cursor: number;
  error: string;
}

/** The ` … ` shown where the value is cut, so it is clear text continues. */
const CUT = '…';
/** What a scrolled value gives up besides its text: a cursor cell at the end and a cut mark each side. */
const CURSOR_AND_CUTS = 3;

/**
 * The part of `value` around the cursor that fits `room` columns, the cursor drawn as an inverse
 * character. A long value scrolls sideways instead of wrapping: the value is never changed, only
 * what is shown of it, and the cursor always stays in view.
 */
export function textWindow(value: string, cursor: number, room: number | undefined): string {
  const chars = [...value];
  const at = Math.min(cursor, chars.length);
  const draw = (from: number, to: number): string => {
    const shown = chars.slice(from, to);
    const mark = at - from;
    const under = mark < shown.length ? (shown[mark] as string) : ' ';
    const before = shown.slice(0, mark).join('');
    const after = shown.slice(mark + 1).join('');
    return `${before}${pc.inverse(under)}${after}`;
  };
  if (room === undefined || chars.length + 1 <= room) return draw(0, chars.length);
  const width = Math.max(room - CURSOR_AND_CUTS, 1);
  const from = Math.max(0, at - width + 1);
  const to = Math.min(chars.length, from + width);
  const left = from > 0 ? CUT : '';
  const right = to < chars.length ? CUT : '';
  return `${left}${draw(from, to)}${right}`;
}

/** What is typed so far, or the placeholder; scrolled or cut to the room there is. */
function shownText(view: TextView, room: number | undefined): string {
  if (view.value) return textWindow(view.value, view.cursor, room);
  const placeholder = view.placeholder
    ? pc.inverse(view.placeholder[0] ?? ' ') + pc.dim(view.placeholder.slice(1))
    : pc.inverse(pc.hidden('_'));
  return room === undefined ? placeholder : fitLine(placeholder, room);
}

/** The answered or cancelled text prompt: the value, cut to the window. */
function settledText(view: TextView, room: number | undefined): string {
  const value = room === undefined ? view.value : fitLine(view.value, room);
  if (view.state === 'submit') {
    return settled('submit', view.message, pc.dim(value || view.placeholder || ''));
  }
  const tail = view.value.trim() ? `\n${grayBar()}` : '';
  return `${settled('cancel', view.message, pc.strikethrough(pc.dim(value)))}${tail}`;
}

export function renderText(view: TextView): string {
  const width = terminalWidth();
  const room = width === undefined ? undefined : width - TEXT_MARGIN;
  if (view.state === 'submit' || view.state === 'cancel') return settledText(view, room);
  const colour = view.state === 'error' ? pc.yellow : pc.cyan;
  const error = room === undefined ? view.error : fitLine(view.error, room);
  const foot =
    view.state === 'error'
      ? `\n${pc.yellow(symbols.end())}  ${pc.yellow(error)}\n`
      : `\n${pc.cyan(symbols.end())}\n`;
  const line = `${colour(symbols.bar())}  ${shownText(view, room)}`;
  return cutFrame(`${head(view.state, view.message)}${line}${foot}`);
}
