/**
 * Artifacts a tool loads twice: some tools read other tools' folders too (Target.alsoLoads —
 * GitHub Copilot reads `.claude/skills` and `.agents/skills` as well as `.github/skills`), so an
 * artifact installed for both the reader and one of those targets shows up twice in the reader.
 * `sigil status` prints these as notes; nothing is changed.
 *
 * @module
 */
import type { ManifestEntry } from '../manifest/types';
import type { Target } from '../types';

type Overlap = NonNullable<Target['alsoLoads']>[number];

const nameOf = (targets: readonly Target[], name: string) =>
  targets.find(t => t.name === name)?.displayName ?? name;

/** Ids of `kind` installed for `target`. */
const idsFor = (entries: readonly ManifestEntry[], target: string, kind: string) =>
  entries.filter(e => e.target === target && e.kind === kind).map(e => e.id);

/** The notes for one reader's overlap: one per other target that shares installed artifacts. */
function overlapNotes(
  reader: Target,
  overlap: Overlap,
  entries: readonly ManifestEntry[],
  targets: readonly Target[],
): string[] {
  const readerIds = new Set(idsFor(entries, reader.name, overlap.kind));
  return overlap.targets.flatMap(other => {
    const both = idsFor(entries, other, overlap.kind).filter(id => readerIds.has(id));
    if (both.length === 0) return [];
    return [
      `${nameOf(targets, reader.name)} also loads ${nameOf(targets, other)}'s ${overlap.kind}s, ` +
        `so these load twice there: ${both.join(', ')}. Keep one of the two installs ` +
        `(${overlap.doc.url}).`,
    ];
  });
}

/** One note per (reader, other target, kind) that has artifacts installed for both. */
export function duplicateLoads(
  entries: readonly ManifestEntry[],
  targets: readonly Target[],
): string[] {
  return targets.flatMap(reader =>
    (reader.alsoLoads ?? []).flatMap(overlap => overlapNotes(reader, overlap, entries, targets)),
  );
}
