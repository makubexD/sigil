/**
 * runNewWizard — interactive wizard for `sigil new`, built on the shared step
 * registry (./engine.ts). See src/wizard/steps/new/fields-confirm.ts for why the
 * name/title/description + confirm menu is one combined step rather than two.
 *
 * Caller must check `isInteractiveTTY()` before invoking.
 * Returns `null` when the user cancels at any step.
 */
import { intro } from './frame';
import type { ResolvedCatalog, Target } from '../types';
import type { NewWizardResult } from './types';
import { runSteps } from './engine';
import { NEW_STEPS } from './steps/new';
import type { NewWizardState } from './steps/new';

export async function runNewWizard(
  catalog: ResolvedCatalog,
  targets: Target[],
): Promise<NewWizardResult | null> {
  intro('✨  sigil new  —  scaffold a new catalog artifact');

  const state: NewWizardState = { ctx: { catalog, targets } };

  const done = await runSteps(NEW_STEPS, state);
  if (!done) return null;

  return {
    kind: done.kind!,
    name: done.name!,
    title: done.title!,
    description: done.description!,
    language: done.language,
    platforms: done.platforms,
  };
}

/**
 * Builds a copy-pasteable `sigil new … --yes` command string from a
 * wizard result (or equivalent set of flags).
 * Omits --language when shared; omits --platforms when unrestricted (DRY default).
 */
export function buildEquivalentNewCommand(result: {
  kind: string;
  name: string;
  language?: string | undefined;
  platforms?: string[] | undefined;
}): string {
  const parts = ['sigil new', result.kind, `--name ${result.name}`];
  if (result.language) parts.push(`--language ${result.language}`);
  if (result.platforms && result.platforms.length > 0) {
    parts.push(`--platforms ${result.platforms.join(',')}`);
  }
  parts.push('--yes');
  return parts.join(' ');
}
