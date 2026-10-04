/**
 * Capability model types, plus the two constants every table shares (CHANNELS,
 * TEMPLATE_NOT_EMITTED). One `TargetCapabilities` per target
 * (`src/targets/<provider>/capabilities.ts`) is the single declaration of which artifact kinds that
 * target emits on each delivery channel; everything that used to hand-list kinds (selection's
 * warn-and-skip, the plugin assembler's kind filter, validate's platform checks, the wizard) reads
 * it through the helpers in ./capabilities.ts. See docs/decisions/distribution-channels-2026-09.md
 * §5 for why kind support is data rather than code.
 *
 * @module
 */
import type { ArtifactKind } from '../types';
import type { DocRef } from './spec-types';

/**
 * A delivery channel: `scaffold` writes files into a consumer project (`sigil add`, and the
 * target's full `sigil build` layout); `plugin` packages artifacts as marketplace plugins.
 */
export type ChannelId = 'scaffold' | 'plugin';

/** Every channel, in display order. */
export const CHANNELS: readonly ChannelId[] = ['scaffold', 'plugin'];

/**
 * How one kind is delivered on one channel.
 *   - `native` — emitted as its own file or config fragment. Its provider citation lives on the
 *     kind's KindEmitSpec (or the target's aggregateDocs for config kinds), which `provider-kind-coverage`
 *     enforces — so it is not repeated here.
 *   - `via` — not emitted on its own, but carried by another artifact (`inline`: a rule's text is
 *     folded into each skill that `uses:` it). Cites the doc establishing why.
 *   - `none` — not delivered (`sigil add` warns and skips it); `reason` says why and is rendered
 *     in docs/reference/capabilities.md. Cite a doc when the reason is a platform limit; omit
 *     `docs` when it is only a gap in sigil itself.
 */
export type KindSupport =
  | { readonly mode: 'native' }
  | { readonly mode: 'via'; readonly as: 'inline'; readonly docs: readonly DocRef[] }
  | { readonly mode: 'none'; readonly reason: string; readonly docs?: readonly DocRef[] };

/** One channel's full table — the Record type makes a kind missing from it a compile error. */
export type ChannelCapabilities = Readonly<Record<ArtifactKind, KindSupport>>;

/**
 * The `template` row every channel shares: templates are catalog-internal — composed into other
 * artifacts' bodies at resolve time (src/templates.ts), never emitted on their own.
 */
export const TEMPLATE_NOT_EMITTED: KindSupport = {
  mode: 'none',
  reason: 'templates are composed into other artifacts at resolve time, never emitted',
};

/** A target's capability table. A channel left undefined does not exist for that target. */
export interface TargetCapabilities {
  readonly scaffold: ChannelCapabilities;
  readonly plugin?: ChannelCapabilities | undefined;
}
