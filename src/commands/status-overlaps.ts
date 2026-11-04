/**
 * Artifacts a tool also reads from another tool's folder (Target.alsoLoads — GitHub Copilot reads
 * `.claude/skills` and `.agents/skills` as well as `.github/skills`, and Cursor reads
 * `.claude/skills` and `.agents/skills` too), so an artifact installed for both the reader and one
 * of those targets shows up in the reader as well. `sigil status` prints these as notes; nothing
 * is changed.
 *
 * Three cases. Normally the reader loads the artifact twice, and the note says so. When the reader's
 * entry sets `readerWins`, the reader's own copy is used on a name clash and the other target's
 * copy goes unused there (Cursor prefers `.cursor/skills/` over `.claude/skills/` and
 * `.agents/skills/`), so the note says that instead. When it sets `unfixedWinner`, the reader shows
 * one copy but which copy wins depends on its version (OpenCode reads `.claude/skills/` and
 * `.agents/skills/`), so the note says that instead.
 *
 * @module
 */
import type { ManifestEntry } from '../manifest/types';
import type { ArtifactKind, Target } from '../types';

type Overlap = NonNullable<Target['alsoLoads']>[number];

const nameOf = (targets: readonly Target[], name: string) =>
  targets.find(t => t.name === name)?.displayName ?? name;

/** Ids of `kind` installed for `target`. */
const idsFor = (entries: readonly ManifestEntry[], target: string, kind: string) =>
  entries.filter(e => e.target === target && e.kind === kind).map(e => e.id);

/** One artifact shared between a reader and another target it reads, with its rendered note. */
interface SharedLoad {
  readonly reader: string;
  readonly other: string;
  readonly kind: ArtifactKind;
  readonly ids: readonly string[];
  readonly note: string;
}

/** The note when one entry reaches the reader but which copy wins on a name clash depends on its version. */
function unfixedWinnerNote(
  readerName: string,
  otherName: string,
  overlap: Overlap,
  ids: readonly string[],
): string {
  return (
    `${readerName} also reads ${otherName}'s ${overlap.kind}s and shows one copy of each, ` +
    `and which one depends on its version: ${ids.join(', ')}. Keep one of the two installs ` +
    `(${overlap.doc.url}).`
  );
}

/** The note, in display names, for one (reader, other target, kind) that shares at least one installed artifact. */
function noteFor(
  readerName: string,
  otherName: string,
  overlap: Overlap,
  ids: readonly string[],
): string {
  if (overlap.unfixedWinner) return unfixedWinnerNote(readerName, otherName, overlap, ids);
  return overlap.readerWins
    ? `${readerName} also reads ${otherName}'s ${overlap.kind}s and uses its own copy on a ` +
        `name clash, so ${otherName}'s copy of these goes unused there: ${ids.join(', ')} ` +
        `(${overlap.doc.url}).`
    : `${readerName} also loads ${otherName}'s ${overlap.kind}s, ` +
        `so these load twice there: ${ids.join(', ')}. Keep one of the two installs ` +
        `(${overlap.doc.url}).`;
}

/** Every artifact shared between a reader and another target it reads, notes included. */
function sharedLoads(entries: readonly ManifestEntry[], targets: readonly Target[]): SharedLoad[] {
  return targets.flatMap(reader =>
    (reader.alsoLoads ?? []).flatMap(overlap => {
      const readerIds = new Set(idsFor(entries, reader.name, overlap.kind));
      return overlap.targets.flatMap(other => {
        const both = idsFor(entries, other, overlap.kind).filter(id => readerIds.has(id));
        if (both.length === 0) return [];
        return [
          {
            reader: reader.name,
            other,
            kind: overlap.kind,
            ids: both,
            note: noteFor(nameOf(targets, reader.name), nameOf(targets, other), overlap, both),
          },
        ];
      });
    }),
  );
}

/** One note per (reader, other target, kind) that has artifacts installed for both. */
export function duplicateLoads(
  entries: readonly ManifestEntry[],
  targets: readonly Target[],
): string[] {
  return sharedLoads(entries, targets).map(load => load.note);
}

/**
 * The notes for artifacts named in `ids` only, from the overlaps where `targetName` is the reader
 * or the other target. Lets `add` report just the install it is about to make.
 */
export function duplicateLoadsFor(
  entries: readonly ManifestEntry[],
  targets: readonly Target[],
  targetName: string,
  ids: readonly string[],
): string[] {
  const wanted = new Set(ids);
  return sharedLoads(entries, targets)
    .filter(
      load =>
        (load.reader === targetName || load.other === targetName) &&
        load.ids.some(id => wanted.has(id)),
    )
    .map(load => load.note);
}
