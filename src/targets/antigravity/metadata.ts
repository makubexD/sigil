/**
 * The Antigravity target's project layout and vocabulary.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';

/** Directories `sigil init` creates. */
export const ANTIGRAVITY_INIT_DIRS: string[] = ['.agents/skills', '.agents/rules'];

/** A project already set up for this target. */
export const ANTIGRAVITY_PROJECT_MARKERS: string[] = ['.agents/rules'];

export const ANTIGRAVITY_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills in .agents/skills/',
  },
  rule: {
    noun: 'rule',
    plural: 'Rules',
    hint: 'rules in .agents/rules/',
  },
};
