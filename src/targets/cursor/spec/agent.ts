/**
 * Cursor `agent` emission spec — a subagent file at `.cursor/agents/<name>.md`. Frontmatter is
 * `name`, `description` and `readonly`, the last rendered from the provider-neutral `tools`
 * through `CURSOR_AGENT_TOOL_DIALECT`: Cursor has no tool list, so a list whose nearest mapping
 * is read-only writes `readonly: true` and an exact one writes the same line. A list naming an
 * edit tool serializes to `''` (dropped by renderFieldMapping), leaving Cursor's every-tool
 * default.
 *
 * `model` and `effort` are not mapped (docs/decisions/cursor-target-2026-11.md, Phase E Decision 5): Cursor's
 * `model` defaults to `inherit`, and the vocabulary record keeps model ids out until a tier
 * table is chosen as data. `disallowedTools` is not carried either (Decision 6): no catalog
 * agent uses it, and leaving it unmapped makes `restrictionOutcome` fail closed on one that does.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import { CURSOR_SUBAGENTS_DOC } from '../doc-refs';
import { CURSOR_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { renderTools } from '../../tool-dialect';
import { CURSOR_AGENT_TOOL_DIALECT } from '../tool-dialect';

const nameMapping: FieldMapping = {
  from: 'name',
  to: 'name',
  required: true,
  serialize: v => `name: ${v as string}`,
};

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

/**
 * `tools` collapsed to Cursor's one switch. `when` gates on a non-empty list the way the Copilot
 * spec does; `required: false` because an agent with no `tools` has no flag to write either.
 * Only a nearest read-only mapping emits the line — everything else is `''`, which
 * renderFieldMapping filters out.
 */
const readonlyMapping: FieldMapping = {
  from: 'tools',
  to: 'readonly',
  required: false,
  when: fm => Array.isArray(fm.tools) && (fm.tools as string[]).length > 0,
  serialize: v => {
    const rendered = renderTools(CURSOR_AGENT_TOOL_DIALECT, v as string[]);
    return rendered.kind === 'read-only-flag' && rendered.readOnly ? 'readonly: true' : '';
  },
};

const titleAndBoundarySection: BodySectionSpec = {
  id: 'titleAndBoundary',
  position: 'before',
  render: (artifact, ctx) => [
    `# ${artifact.frontmatter.title as string}`,
    '',
    ...renderBoundarySection(artifact, ctx.installSet, ctx.catalog),
  ],
};

export const CURSOR_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  outputPath: artifact => `.cursor/agents/${artifact.frontmatter.name as string}.md`,
  pathPattern: /\.cursor\/agents\/[^/]+\.md$/,
  frontmatter: [nameMapping, descriptionMapping, readonlyMapping],
  emitEmptyFrontmatter: true,
  toolDialect: CURSOR_AGENT_TOOL_DIALECT,
  body: [titleAndBoundarySection],
  forbiddenKeys: ['applyTo', 'paths'],
  lexicon: CURSOR_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CURSOR_SUBAGENTS_DOC],
};
