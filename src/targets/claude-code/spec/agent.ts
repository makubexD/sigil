/**
 * Claude Code `agent` emission spec. Two variants share one field-mapping table:
 *   - 'scaffold' → .claude/agents/<name>.md in a consumer project, where every documented agent
 *                  field is honoured.
 *   - 'plugin'   → dist/claude/plugins/<pack>/agents/<name>.md. A Claude plugin silently ignores
 *                  `permissionMode`, `hooks`, `mcpServers` and `initialPrompt` (see
 *                  PLUGIN_IGNORED_AGENT_KEYS), so the plugin variant forbids them and the build
 *                  fails rather than shipping a field that does nothing.
 * `claude:` namespace hints (model/effort/maxTurns/isolation/skills) are flattened to top-level
 * frontmatter keys. `tools` and `disallowedTools` are neutral vocabulary rendered through
 * CLAUDE_TOOL_DIALECT; `disallowedTools` is emitted as a JSON array when present.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlList, yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import { CLAUDE_AGENTS_DOC, CLAUDE_PLUGIN_COMPONENTS_DOC } from '../../doc-refs';
import { CLAUDE_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { CLAUDE_TOOL_DIALECT, claudeToolNames } from '../tool-dialect';

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

/**
 * Neutral model tier → Claude's documented model alias (CLAUDE_AGENTS_DOC lists `haiku`,
 * `sonnet`, `opus` and `fable`). `fable` gets no tier: the docs give it no place in a
 * cost/strength order, so no neutral tier maps to it (Decision 5, docs/decisions/neutral-agent-vocabulary-2026-11.md).
 */
export const CLAUDE_MODEL_TIERS: Readonly<Record<'fast' | 'balanced' | 'deep', string>> = {
  fast: 'haiku',
  balanced: 'sonnet',
  deep: 'opus',
};

/**
 * Neutral `model: fast | balanced | deep` — CLAUDE_MODEL_TIERS in the same frontmatter position
 * as `claude.model`, which wins whenever that override is authored.
 */
const neutralModelMapping: FieldMapping = {
  from: 'model',
  to: 'model',
  required: false,
  when: fm => (fm.claude as { model?: string } | undefined)?.model === undefined,
  serialize: v => `model: ${CLAUDE_MODEL_TIERS[v as keyof typeof CLAUDE_MODEL_TIERS]}`,
};

/**
 * Neutral `effort: low | medium | high` — emitted as written, next to `claude.effort`, which
 * wins whenever that override is authored.
 */
const neutralEffortMapping: FieldMapping = {
  from: 'effort',
  to: 'effort',
  required: false,
  when: fm => (fm.claude as { effort?: string } | undefined)?.effort === undefined,
  serialize: v => `effort: ${v as string}`,
};

/**
 * `claude.skills` — catalog skill ids, emitted as Claude's subagent `skills:` preload list of skill
 * *names*. `validate` rejects an unknown or non-skill id and a preloaded skill whose name isn't its
 * id's last segment (src/refs.ts), so no catalog lookup is needed here.
 * Scaffold names resolve against `.claude/skills/<name>`; bare names also resolve for plugin
 * agents, probed on Claude Code 2.1.314.
 */
const claudeSkillsMapping: FieldMapping = {
  from: 'claude.skills',
  to: 'skills',
  required: false,
  when: fm => ((fm.claude as { skills?: string[] } | undefined)?.skills ?? []).length > 0,
  serialize: v =>
    ['skills:', ...(v as string[]).map(id => `  - ${id.slice(id.lastIndexOf('/') + 1)}`)].join(
      '\n',
    ),
};

const disallowedToolsMapping: FieldMapping = {
  from: 'disallowedTools',
  to: 'disallowedTools',
  required: false,
  when: fm => Array.isArray(fm.disallowedTools) && (fm.disallowedTools as string[]).length > 0,
  serialize: v => `disallowedTools: ${JSON.stringify(claudeToolNames(v as string[]))}`,
};

/**
 * Vendor-neutral `tools` (schema/index.ts's AgentSchema) rendered through CLAUDE_TOOL_DIALECT:
 * a neutral name (`read`, `search`, …) becomes the Claude tool(s) it stands for, a legacy Claude
 * name maps through the same table, and a provider pattern passes through verbatim. Omitted =
 * "Inherits every tool available to subagents" per CLAUDE_AGENTS_DOC; an authored, non-empty list
 * scopes it down. This was authored on ~26 agents but unmapped for a full release cycle — see the
 * declared-but-unemitted conformance rule that now guards against a repeat.
 */
const toolsMapping: FieldMapping = {
  from: 'tools',
  to: 'tools',
  required: false,
  when: fm => Array.isArray(fm.tools) && (fm.tools as string[]).length > 0,
  serialize: v => `tools: ${yamlList(claudeToolNames(v as string[]))}`,
};

const AGENT_FRONTMATTER: readonly FieldMapping[] = [
  nameMapping,
  descriptionMapping,
  claudeHintMapping('model'),
  neutralModelMapping,
  claudeHintMapping('effort'),
  neutralEffortMapping,
  claudeHintMapping('maxTurns'),
  claudeHintMapping('isolation'),
  claudeSkillsMapping,
  toolsMapping,
  disallowedToolsMapping,
];

const boundarySection: BodySectionSpec = {
  id: 'boundary',
  position: 'before',
  render: (artifact, ctx) => renderBoundarySection(artifact, ctx.installSet, ctx.catalog),
};

/** Agent frontmatter fields a Claude plugin ignores — CLAUDE_PLUGIN_COMPONENTS_DOC. */
const PLUGIN_IGNORED_AGENT_KEYS: readonly string[] = [
  'permissionMode',
  'hooks',
  'mcpServers',
  'initialPrompt',
];

export const CLAUDE_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  variant: 'scaffold',
  outputPath: (artifact, ctx) => {
    const name = artifact.frontmatter.name as string;
    return ctx.packName ? `plugins/${ctx.packName}/agents/${name}.md` : `.claude/agents/${name}.md`;
  },
  pathPattern: /\.claude\/agents\/.*\.md$/,
  frontmatter: AGENT_FRONTMATTER,
  emitEmptyFrontmatter: true,
  toolDialect: CLAUDE_TOOL_DIALECT,
  body: [boundarySection],
  forbiddenKeys: ['applyTo', 'paths'],
  lexicon: CLAUDE_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CLAUDE_AGENTS_DOC],
};

/**
 * Plugin agents: the same layout, plus the plugin-only field guard. .claude/agents/ honours the
 * four ignored keys, so only this variant forbids them.
 */
export const CLAUDE_PLUGIN_AGENT_SPEC: KindEmitSpec = {
  ...CLAUDE_AGENT_SPEC,
  variant: 'plugin',
  pathPattern: /plugins\/[^/]+\/agents\/.*\.md$/,
  forbiddenKeys: [...CLAUDE_AGENT_SPEC.forbiddenKeys, ...PLUGIN_IGNORED_AGENT_KEYS],
  docs: [CLAUDE_AGENTS_DOC, CLAUDE_PLUGIN_COMPONENTS_DOC],
};
