/**
 * The Cursor target's project layout and vocabulary.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';

/** Directories `sigil init` creates. */
export const CURSOR_INIT_DIRS: string[] = ['.cursor/skills', '.cursor/rules'];

/** A project already set up for this target. */
export const CURSOR_PROJECT_MARKERS: string[] = ['.cursor'];

export const CURSOR_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills in .cursor/skills/',
  },
};
