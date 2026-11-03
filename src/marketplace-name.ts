/**
 * The marketplace name sigil emits when none is configured, and the helper that picks it.
 * A leaf module: it imports nothing from `src/`, so a provider can read it without loading the
 * target registry.
 *
 * @module
 */

/** The marketplace name sigil emits when none is configured (packs.yaml `marketplace.name`). */
export const DEFAULT_MARKETPLACE_NAME = 'sigil';

/** The marketplace name to use: the configured identity's, or sigil's default. */
export function marketplaceName(identity?: { name: string }): string {
  return identity?.name ?? DEFAULT_MARKETPLACE_NAME;
}
