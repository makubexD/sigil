/**
 * Claude Code `agent` emission spec — one layout shared by both compile (`agents/<name>.md` in
 * the plugin) and scaffold (`.claude/agents/<name>.md`) paths; unlike skill, agent has no
 * variant split. `claude:` namespace hints (model/effort/maxTurns/isolation) are flattened to
 * top-level frontmatter keys, and `disallowedTools` is emitted as a JSON array when present.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import { CLAUDE_AGENTS_DOC } from '../../doc-refs';

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

/** One FieldMapping per `claude:` hint key, flattened to a top-level frontmatter key. */
function claudeHintMapping(key: 'model' | 'effort' | 'maxTurns' | 'isolation'): FieldMapping {
  return {
    from: `claude.${key}`,
    to: key,
    required: false,
    serialize: v => `${key}: ${v as string | number}`,
  };
}

const disallowedToolsMapping: FieldMapping = {
  from: 'disallowedTools',
  to: 'disallowedTools',
  required: false,
  when: fm => Array.isArray(fm.disallowedTools) && (fm.disallowedTools as string[]).length > 0,
  serialize: v => `disallowedTools: ${JSON.stringify(v)}`,
};

/**
 * Vendor-neutral `tools` (schema/index.ts's AgentSchema) mapped straight through — catalog authors
 * already write Claude-native tool names (Read, Grep, Bash, …) here. Omitted = "Inherits every
 * tool available to subagents" per CLAUDE_AGENTS_DOC; an authored, non-empty list scopes it down.
 * This was authored on ~26 agents but unmapped for a full release cycle — see the
 * declared-but-unemitted conformance rule that now guards against a repeat.
 */
const toolsMapping: FieldMapping = {
  from: 'tools',
  to: 'tools',
  required: false,
  when: fm => Array.isArray(fm.tools) && (fm.tools as string[]).length > 0,
  serialize: v => `tools: ${(v as string[]).join(', ')}`,
};

const AGENT_FRONTMATTER: readonly FieldMapping[] = [
  nameMapping,
  descriptionMapping,
  claudeHintMapping('model'),
  claudeHintMapping('effort'),
  claudeHintMapping('maxTurns'),
  claudeHintMapping('isolation'),
  toolsMapping,
  disallowedToolsMapping,
];

const boundarySection: BodySectionSpec = {
  id: 'boundary',
  position: 'before',
  render: (artifact, ctx) => renderBoundarySection(artifact, ctx.installSet, ctx.catalog),
};

export const CLAUDE_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  outputPath: (artifact, ctx) => {
    const name = artifact.frontmatter.name as string;
    return ctx.packName ? `plugins/${ctx.packName}/agents/${name}.md` : `.claude/agents/${name}.md`;
  },
  pathPattern: /(plugins\/[^/]+|\.claude)\/agents\/.*\.md$/,
  frontmatter: AGENT_FRONTMATTER,
  emitEmptyFrontmatter: true,
  body: [boundarySection],
  forbiddenKeys: ['applyTo', 'paths'],
  bodyForbids: [],
  docs: [CLAUDE_AGENTS_DOC],
};
