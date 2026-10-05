/**
 * Read-side helpers over a target's capability table (./capability-types.ts). Every consumer asks
 * these instead of reading a hand-listed kind array, so kind support is declared exactly once per
 * target — `src/targets/<provider>/capabilities.ts`.
 *
 * Every helper defaults to the `scaffold` channel, which is authoritative for artifact-level
 * questions (`platforms:` validation, the `ownedBy` tripwire, `sigil get`): it is the channel that
 * can deliver every kind a target supports at all. Ask about `plugin` explicitly.
 *
 * @module
 */
import type { ArtifactKind, Target } from '../types';
import { ALL_KINDS, isArtifactKind } from '../kinds';
import type { ChannelCapabilities, ChannelId, KindSupport } from './capability-types';

/** Anything carrying a capability table — a Target, or an adapter passing its own table directly. */
export type CapabilityHolder = Pick<Target, 'capabilities'>;

/** How `kind` is delivered by `target` on `channel`; undefined when the channel doesn't exist. */
export function kindSupport(
  target: CapabilityHolder,
  kind: ArtifactKind,
  channel: ChannelId = 'scaffold',
): KindSupport | undefined {
  return target.capabilities[channel]?.[kind];
}

/** Kinds `target` delivers on `channel` in any mode other than `none`, in display order. */
export function supportedKinds(
  target: CapabilityHolder,
  channel: ChannelId = 'scaffold',
): ArtifactKind[] {
  return ALL_KINDS.filter(kind => (kindSupport(target, kind, channel)?.mode ?? 'none') !== 'none');
}

/** Kinds `target` emits as their own files on `channel` (mode `native`), in display order. */
export function nativeKinds(
  target: CapabilityHolder,
  channel: ChannelId = 'scaffold',
): ArtifactKind[] {
  return ALL_KINDS.filter(kind => kindSupport(target, kind, channel)?.mode === 'native');
}

/**
 * Kinds `sigil add` can install on their own for `target`: the scaffold channel's `native` kinds.
 * A `via` kind is delivered (supportsKind is true) but only inside another artifact, so it is
 * never written as its own file; selection skips it with that reason (carriedKinds).
 */
export function installableKinds(target: CapabilityHolder): ArtifactKind[] {
  return nativeKinds(target, 'scaffold');
}

/** Kinds `target` delivers on the scaffold channel only inside other artifacts (mode `via`). */
export function carriedKinds(target: CapabilityHolder): ArtifactKind[] {
  return ALL_KINDS.filter(kind => kindSupport(target, kind, 'scaffold')?.mode === 'via');
}

/** True when `target` can install `kind` on its own (see installableKinds). */
export function isInstallable(target: CapabilityHolder, kind: string): boolean {
  return isArtifactKind(kind) && kindSupport(target, kind, 'scaffold')?.mode === 'native';
}

/** True when `target` delivers `kind` on `channel`. Accepts raw strings from frontmatter. */
export function supportsKind(
  target: CapabilityHolder,
  kind: string,
  channel: ChannelId = 'scaffold',
): boolean {
  return isArtifactKind(kind) && (kindSupport(target, kind, channel)?.mode ?? 'none') !== 'none';
}

/**
 * Builds a channel table where `native` kinds are emitted and every other kind is unsupported for
 * the same `reason` — the common shape for a target (or test double) that declares no `via` kinds.
 */
export function channelFromNativeKinds(
  native: readonly ArtifactKind[],
  reason: string,
): ChannelCapabilities {
  const table = {} as Record<ArtifactKind, KindSupport>;
  for (const kind of ALL_KINDS) {
    table[kind] = native.includes(kind) ? { mode: 'native' } : { mode: 'none', reason };
  }
  return table;
}
