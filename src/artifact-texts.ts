/**
 * Every prose text an artifact ships: its body and, for a skill, each reference file, which lands
 * next to the SKILL.md on every target. A check that reads prose (a provider's literal, a private
 * folder) goes through this, so it never covers the body alone and misses a reference.
 *
 * @module
 */
import path from 'node:path';
import type { Artifact } from './types';

/** One shipped text and the source file it lives in. */
export interface ShippedText {
  /** `body`, or `references/<name>` for a reference file. */
  readonly label: string;
  readonly text: string;
  readonly filePath: string;
  /** A reference file is all prose: no frontmatter to keep when it is rewritten. */
  readonly isReference: boolean;
}

/** The body, then each reference file in load order. */
export function shippedTexts(artifact: Artifact): ShippedText[] {
  const refsDir = path.join(path.dirname(artifact.filePath), 'references');
  const body = { label: 'body', text: artifact.body, filePath: artifact.filePath };
  return [
    { ...body, isReference: false },
    ...(artifact.references ?? []).map(ref => ({
      label: `references/${ref.name}`,
      text: ref.content,
      filePath: ref.sourcePath ?? path.join(refsDir, ref.name),
      isReference: true,
    })),
  ];
}
