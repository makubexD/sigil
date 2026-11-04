/**
 * The OpenCode target's project layout and vocabulary.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';

/** Directories `sigil init` creates. */
export const OPENCODE_INIT_DIRS: string[] = [
  '.agents/skills',
  '.opencode/agents',
  '.opencode/commands',
];

/** A project already set up for this target. */
export const OPENCODE_PROJECT_MARKERS: string[] = ['.opencode'];

export const OPENCODE_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills in .agents/skills/',
  },
};
