/**
 * The guided half of `sigil init`: with no `--target`, ask which AI tool the project is for.
 *
 * @module
 */
import { isCancel, select } from '../wizard/prompts';
import { cancel } from '../wizard/frame';
import { printRepeatCommand } from '../wizard/command-strings';
import { SigilError } from '../errors';
import { getAllTargets } from '../targets';
import { detectedTargetsIn } from '../project-context';
import { isInteractiveTTY } from '../wizard';

export interface InitTargetOption {
  value: string;
  label: string;
  hint: string;
}

export interface ChooseInitTargetOptions {
  /** Offer only these tools. One name means there is nothing to ask. Omit to offer every tool. */
  only?: readonly string[] | undefined;
}

/** One option per target, the ones not set up yet first; the ones already present say so. Pure. */
export function initTargetOptions(found: readonly string[]): InitTargetOption[] {
  const options = getAllTargets().map(t => ({
    value: t.name,
    label: t.displayName ?? t.name,
    hint: found.includes(t.name)
      ? 'already set up here, adds any missing folders'
      : (t.installHint ?? ''),
  }));
  const isNew = (o: InitTargetOption): number => (found.includes(o.value) ? 1 : 0);
  return options.sort((a, b) => isNew(a) - isNew(b));
}

/**
 * No `--target` was given. In a terminal, ask; anywhere else, fail and list the valid names.
 * Returns the chosen target name, or null when the user cancels.
 */
export async function chooseInitTarget(
  projectDir: string,
  opts: ChooseInitTargetOptions = {},
): Promise<string | null> {
  if (!isInteractiveTTY()) {
    const names = getAllTargets().map(t => t.name);
    throw new SigilError('Missing --target <name>.', {
      hint: `  sigil init --target <name>    (names: ${names.join(', ')})`,
    });
  }
  const found = detectedTargetsIn(projectDir);
  const sole = opts.only?.length === 1 ? opts.only[0] : undefined;
  const answer = sole ?? (await askTarget(found, opts.only));
  if (answer === null) return null;
  printRepeatCommand('Equivalent command:', `sigil init --target ${answer}`);
  return answer;
}

/** Asks which of the offered tools to set up; the first (not set up yet) is preselected. Null on cancel. */
async function askTarget(
  found: readonly string[],
  only: readonly string[] | undefined,
): Promise<string | null> {
  const options = initTargetOptions(found).filter(o => !only || only.includes(o.value));
  const answer = await select({
    message: 'Which AI tool is this project for?',
    options,
    ...(options[0] ? { initialValue: options[0].value } : {}),
  });
  if (isCancel(answer)) {
    cancel('Cancelled. Nothing was created.');
    return null;
  }
  return String(answer);
}
