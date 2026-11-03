/**
 * Why `add` leaves an artifact out for a target: the layer every selection path shares, so the
 * wizard's preview and the real install agree on what a target can deliver.
 *
 * @module
 */
import type { ResolvedArtifact, Target } from '../types';
import { wholeFileSkipReason } from './tool-restriction';

/**
 * The reason `add` leaves `artifact` out for `target`: a config kind the target refuses, otherwise
 * a whole-file artifact it cannot render (a scoped Antigravity rule, a tool-restricted agent).
 * Undefined when the artifact installs.
 */
export function installSkipReason(target: Target, artifact: ResolvedArtifact): string | undefined {
  return target.configSkipReason?.(artifact) ?? wholeFileSkipReason(target, artifact);
}
