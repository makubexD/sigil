/**
 * Copilot `agent` emission spec — the per-file `.github/agents/<name>.agent.md` scaffold layout.
 * Frontmatter is `name` + `description` only. The aggregate `.github/AGENTS.md` (open standard,
 * all agents in one file) stays hand-written in build-helpers.ts's buildAgentsMd — it renders
 * multiple artifacts into one document, which is not a per-artifact KindEmitSpec's shape.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import {
  COPILOT_AGENTS_DOC,
  COPILOT_CREATE_AGENTS_DOC,
  VSCODE_CUSTOM_AGENTS_DOC,
} from '../../doc-refs';
import { COPILOT_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';

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
 * Vendor-neutral `tools` (schema/index.ts's AgentSchema), same source field the Claude spec
 * consumes. Copilot's docs accept both a comma-separated string and a YAML array — a JSON array
 * literal satisfies the YAML-array form. Omitted = "defaults to all tools" per COPILOT_AGENTS_DOC.
 */
const toolsMapping: FieldMapping = {
  from: 'tools',
  to: 'tools',
  required: false,
  when: fm => Array.isArray(fm.tools) && (fm.tools as string[]).length > 0,
  serialize: v => `tools: ${JSON.stringify(v)}`,
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

const MAX_AGENT_BODY_CHARS = 30_000;

export const COPILOT_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  outputPath: artifact => `.github/agents/${artifact.frontmatter.name as string}.agent.md`,
  pathPattern: /\.github\/agents\/.*\.agent\.md$/,
  frontmatter: [nameMapping, descriptionMapping, toolsMapping],
  emitEmptyFrontmatter: true,
  body: [titleAndBoundarySection],
  forbiddenKeys: ['applyTo'],
  lexicon: COPILOT_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  // COPILOT_AGENTS_DOC covers the frontmatter table but never states the .github/agents/ path;
  // the other two do (GitHub's cloud-agent side and VS Code's local-agent side respectively).
  docs: [COPILOT_AGENTS_DOC, COPILOT_CREATE_AGENTS_DOC, VSCODE_CUSTOM_AGENTS_DOC],
  // GitHub's custom agents configuration: the prompt (the body) is at most 30,000 characters.
  limits: [
    {
      field: 'body',
      max: MAX_AGENT_BODY_CHARS,
      unit: 'chars',
      severity: 'error',
      doc: COPILOT_AGENTS_DOC,
    },
  ],
};
