/**
 * Antigravity `agent` emission spec — a subagent file at `.agents/agents/<name>.md`, in a scaffold
 * and a plugin variant (`plugins/<pack>/agents/<name>.md`). Frontmatter is `name`, `description`,
 * `model` and `tools`, in that order, with the title and Boundary section in the body as Copilot
 * and Cursor write them.
 *
 * `tools` always writes a list (decision 2): an authored non-empty list renders through
 * ANTIGRAVITY_AGENT_TOOL_DIALECT, and an absent or empty one writes ANTIGRAVITY_ALL_TOOL_NAMES.
 * Antigravity grants no write tool when `tools` is absent (U3), so the key cannot be left out.
 * The YAML block-list form matters: probe U7 found a string value makes the loader skip the agent,
 * so the value is `tools:` followed by `  - <name>` lines, never a comma-joined scalar.
 *
 * `model` is Antigravity's tier, not a model id: only the neutral `model` (`fast` / `balanced` /
 * `deep`) is read, through ANTIGRAVITY_MODEL_TIERS, and an absent one writes nothing (`inherit` is
 * the default). The `claude:` namespace is Claude Code's and is ignored here (decision 3).
 *
 * `disallowedTools` is not mapped (decision 4): Antigravity has no denylist, so `restrictionOutcome`
 * fails closed on an agent that authors one. `mainAgent`, `subagent` and `commandExecutionPolicy`
 * keep their Antigravity defaults (`true`, `true`, `sandbox`); none is a catalog field, so the spec
 * writes none of them (decision 5).
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { SigilError } from '../../../errors';
import { yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import { ANTIGRAVITY_PLUGIN_SUBAGENTS_DOC, ANTIGRAVITY_SUBAGENTS_DOC } from '../doc-refs';
import { ANTIGRAVITY_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import {
  ANTIGRAVITY_AGENT_TOOL_DIALECT,
  ANTIGRAVITY_ALL_TOOL_NAMES,
  ANTIGRAVITY_MODEL_TIERS,
  antigravityAgentToolNames,
} from '../tool-dialect';

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
 * Neutral `model: fast | balanced | deep` through ANTIGRAVITY_MODEL_TIERS. A value outside the
 * tiers drops the agent with no warning, so the table is closed; an absent value is not emitted
 * (`inherit` is the default) and the `claude:` namespace is never read.
 */
const modelMapping: FieldMapping = {
  from: 'model',
  to: 'model',
  required: false,
  serialize: v => `model: ${ANTIGRAVITY_MODEL_TIERS[v as keyof typeof ANTIGRAVITY_MODEL_TIERS]}`,
};

/**
 * Vendor-neutral `tools` rendered through ANTIGRAVITY_AGENT_TOOL_DIALECT, always as a YAML block
 * list (a string makes Antigravity's loader skip the agent, U7). `alwaysEmit` is what makes an
 * absent list write ANTIGRAVITY_ALL_TOOL_NAMES instead of vanishing: without it Antigravity grants
 * no write tool at all (U3).
 */
const toolsMapping: FieldMapping = {
  from: 'tools',
  to: 'tools',
  required: false,
  alwaysEmit: true,
  serialize: v => {
    const authored = Array.isArray(v) ? (v as string[]) : [];
    const names =
      authored.length > 0 ? antigravityAgentToolNames(authored) : ANTIGRAVITY_ALL_TOOL_NAMES;
    return ['tools:', ...names.map(name => `  - ${name}`)].join('\n');
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

export const ANTIGRAVITY_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  variant: 'scaffold',
  outputPath: artifact => `.agents/agents/${artifact.frontmatter.name as string}.md`,
  pathPattern: /\.agents\/agents\/[^/]+\.md$/,
  frontmatter: [nameMapping, descriptionMapping, modelMapping, toolsMapping],
  emitEmptyFrontmatter: true,
  toolDialect: ANTIGRAVITY_AGENT_TOOL_DIALECT,
  body: [titleAndBoundarySection],
  forbiddenKeys: ['applyTo', 'paths'],
  lexicon: ANTIGRAVITY_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [ANTIGRAVITY_SUBAGENTS_DOC, ANTIGRAVITY_PLUGIN_SUBAGENTS_DOC],
};

/** The plugin variant: the same agent file under its pack's `agents/` folder. */
export const ANTIGRAVITY_PLUGIN_AGENT_SPEC: KindEmitSpec = {
  ...ANTIGRAVITY_AGENT_SPEC,
  variant: 'plugin',
  outputPath: (artifact, ctx) => {
    if (ctx.packName === undefined) {
      throw new SigilError('the Antigravity plugin variant needs a pack name');
    }
    return `plugins/${ctx.packName}/agents/${artifact.frontmatter.name as string}.md`;
  },
  pathPattern: /plugins\/[^/]+\/agents\/[^/]+\.md$/,
};
