/**
 * Citations for Cursor files no KindEmitSpec renders: the merged hook config
 * (.cursor/hooks.json and ~/.cursor/hooks.json). Tracked by `sigil sync --stale` beside the spec
 * citations (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import { CURSOR_HOOKS_DOC } from './doc-refs';

export const CURSOR_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'cursor .cursor/hooks.json / ~/.cursor/hooks.json aggregate', doc: CURSOR_HOOKS_DOC },
];
