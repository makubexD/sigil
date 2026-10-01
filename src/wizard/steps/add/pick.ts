/**
 * Asks the artifact picker until the answer is usable, so a junior's first Enter on an empty list,
 * or a ticked "← Back" next to real picks, never silently throws their work away.
 *
 * @module
 */
import { isCancel, log } from '@clack/prompts';
import { pickArtifacts } from '../../picker';
import type { PickArtifactsOptions } from '../../picker';
import { BACK } from './state';

const NOTHING_PICKED =
  'Nothing is ticked yet. Press Space on the items you want, then Enter. (To go back, choose "← Back" on its own.)';
const BACK_WITH_PICKS =
  '"← Back" was ticked together with other items, so nothing was kept. Untick one of them, then press Enter.';

/** Values that are real rows of the picker, so a stale earlier pick cannot sneak in. */
function knownValues(options: PickArtifactsOptions['options']): Set<string> {
  return new Set(Object.values(options).flatMap(rows => rows.map(row => row.value)));
}

/**
 * Like `pickArtifacts`, but never returns an empty list, and never mixes "← Back" with picks.
 * `initialValues` keeps the picks the user made before going back; unknown ones are dropped.
 */
export async function pickUntilUsable(opts: PickArtifactsOptions): Promise<string[] | symbol> {
  const known = knownValues(opts.options);
  let initialValues = (opts.initialValues ?? []).filter(value => known.has(value));
  for (;;) {
    const picked = await pickArtifacts({ ...opts, initialValues });
    if (isCancel(picked)) return picked;
    const chosen = picked.filter(value => value !== BACK);
    if (chosen.length === 0 && picked.length > 0) return picked; // "← Back" alone
    if (chosen.length > 0 && picked.length === chosen.length) return picked;
    log.warn(chosen.length === 0 ? NOTHING_PICKED : BACK_WITH_PICKS);
    initialValues = chosen;
  }
}
