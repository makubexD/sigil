/**
 * Citations for OpenCode files no KindEmitSpec renders: the root `AGENTS.md` with repo-wide
 * rules. Tracked by `sigil sync --stale` beside the spec citations (allProviderDocRefs,
 * ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import { OPENCODE_RULES_DOC } from './doc-refs';

export const OPENCODE_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'opencode AGENTS.md aggregate', doc: OPENCODE_RULES_DOC },
];
