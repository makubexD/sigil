/**
 * The guided half of `sigil init`: with no `--target`, ask which AI tool the project is for.
 *
 * @module
 */
import { cancel, isCancel, log, select } from '@clack/prompts';
import { SigilError } from '../errors';
import { getAllTargets } from '../targets';
import { detectedTargetsIn } from '../project-context';
import { isInteractiveTTY } from '../wizard';

export interface InitTargetOption {
  value: string;
  label: string;
  hint: string;
}

/** One option per target; the ones already present in the folder say so. Pure. */
export function initTargetOptions(found: readonly string[]): InitTargetOption[] {
  return getAllTargets().map(t => ({
    value: t.name,
    label: t.displayName ?? t.name,
    hint: found.includes(t.name) ? 'found in this folder' : (t.installHint ?? ''),
  }));
}

/**
 * No `--target` was given. In a terminal, ask; anywhere else, fail and list the valid names.
 * Returns the chosen target name, or null when the user cancels.
 */
export async function chooseInitTarget(projectDir: string): Promise<string | null> {
  if (!isInteractiveTTY()) {
    const names = getAllTargets().map(t => t.name);
    throw new SigilError('Missing --target <name>.', {
      hint: `  sigil init --target <name>    (names: ${names.join(', ')})`,
    });
  }
  const found = detectedTargetsIn(projectDir);
  const answer = await select({
    message: 'Which AI tool is this project for?',
    options: initTargetOptions(found),
    ...(found[0] ? { initialValue: found[0] } : {}),
  });
  if (isCancel(answer)) {
    cancel('Cancelled. Nothing was created.');
    return null;
  }
  log.info(`Equivalent command: sigil init --target ${String(answer)}`);
  return String(answer);
}
