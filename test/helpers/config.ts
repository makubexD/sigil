/**
 * Config-kind operation factories for tests.
 *
 * `makeConfigOp` replaces the inline `makeOp` helper re-declared across
 * blocks L, O, and the config-merge tests.
 */
import type { ConfigMergeOp } from '../../dist-cli/types';

/**
 * Build a minimal `ConfigMergeOp` that merges `fragment` into `file`.
 * Defaults to a settings-style `object-spread` strategy with no section.
 */
export function makeConfigOp(
  file: string,
  fragment: Record<string, unknown> = { model: 'claude-opus-4-8' },
  strategy: ConfigMergeOp['strategy'] = {},
): ConfigMergeOp {
  return { file, fragment, strategy };
}
