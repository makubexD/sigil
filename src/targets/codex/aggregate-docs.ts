/**
 * Citations for Codex files no KindEmitSpec renders: the root AGENTS.md with repo-wide rules, and
 * the merged config files (.codex/hooks.json, .codex/config.toml, $CODEX_HOME counterparts).
 * Tracked by `sigil sync --stale` beside the spec citations (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import { CODEX_AGENTS_MD_DOC, CODEX_HOOKS_DOC, CODEX_MCP_DOC } from './doc-refs';

export const CODEX_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'codex AGENTS.md aggregate', doc: CODEX_AGENTS_MD_DOC },
  { source: 'codex .codex/hooks.json / hooks.json aggregate', doc: CODEX_HOOKS_DOC },
  { source: 'codex .codex/config.toml / config.toml aggregate', doc: CODEX_MCP_DOC },
];
