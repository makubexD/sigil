/**
 * The Codex target's project layout and vocabulary.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';
import type { SourcedDocRef } from '../spec-types';
import { CODEX_AGENTS_MD_DOC } from './doc-refs';

/** Directories `sigil init` creates. */
export const CODEX_INIT_DIRS: string[] = ['.agents/skills'];

/** A project already set up for this target. (A root AGENTS.md alone is not: many tools use it.) */
export const CODEX_PROJECT_MARKERS: string[] = ['.codex'];

export const CODEX_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills (open standard) in .agents/skills/',
  },
};

/** The one file no spec renders: the root AGENTS.md with repo-wide rules. */
export const CODEX_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'codex AGENTS.md aggregate', doc: CODEX_AGENTS_MD_DOC },
];
