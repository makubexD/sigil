/**
 * The open-standard target's project layout and vocabulary.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';
import type { SourcedDocRef } from '../spec-types';
import { AGENTS_MD_STANDARD_DOC } from '../doc-refs';

/** Directories `sigil init` creates. */
export const AGENTS_STANDARD_INIT_DIRS: string[] = ['.agents/skills'];

/** A project already set up for this target. (A root AGENTS.md alone is not: many tools use it.) */
export const AGENTS_STANDARD_PROJECT_MARKERS: string[] = ['.agents/skills'];

export const AGENTS_STANDARD_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills (open standard) in .agents/skills/',
  },
};

/** The one file no spec renders: the root AGENTS.md with repo-wide rules. */
export const AGENTS_STANDARD_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'agents-standard AGENTS.md aggregate', doc: AGENTS_MD_STANDARD_DOC },
];
