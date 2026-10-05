/**
 * Open-standard `skill` emission spec: `.agents/skills/<name>/SKILL.md` per the Agent Skills spec.
 * Frontmatter is the spec's own fields (`name`, `description`, and `allowed-tools` as the spec's
 * space-separated list); `whenToUse`, `argumentHint`, the Boundary and the skill's rules become
 * body sections, shared with Copilot (../../shared/skill-sections.ts).
 *
 * @module
 */
import type { FieldMapping, KindEmitSpec } from '../../spec-types';
import { AGENT_SKILLS_SPEC_DOC, COPILOT_AGENT_SKILLS_DOC } from '../../doc-refs';
import { AGENT_SKILLS_LIMITS } from '../../agent-skills-limits';
import { yamlScalar } from '../../yaml-util';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import {
  nameMapping,
  descriptionMapping,
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';
import { AGENTS_STANDARD_LEXICON } from '../lexicon';
import { CURSOR_SKILLS_DOC } from '../doc-refs';

/** The Agent Skills spec's SKILL.md guidance: keep the body under 500 lines. */
const MAX_SKILL_BODY_LINES = 500;

/**
 * `allowed-tools` as the spec writes it: one space-separated string (experimental in the spec),
 * quoted. A tool name with whitespace can't be carried (it would split into other names and change
 * the restriction), so rendering refuses it rather than emit a wrong or dropped list — dropping it
 * would grant every tool.
 */
function serializeAllowedTools(value: unknown): string {
  const tools = value as string[];
  const spaced = tools.filter(tool => /\s/.test(tool));
  if (spaced.length > 0) {
    throw new Error(
      `agents-standard: allowed-tools ${spaced.map(t => `"${t}"`).join(', ')} contain whitespace, ` +
        "which the Agent Skills spec's space-separated list cannot carry",
    );
  }
  return `allowed-tools: ${yamlScalar(tools.join(' '))}`;
}

const allowedToolsMapping: FieldMapping = {
  from: 'allowedTools',
  to: 'allowed-tools',
  required: false,
  when: fm => Array.isArray(fm.allowedTools) && (fm.allowedTools as string[]).length > 0,
  serialize: serializeAllowedTools,
};

export const AGENTS_STANDARD_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.agents/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.agents\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: AGENTS_STANDARD_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [AGENT_SKILLS_SPEC_DOC, COPILOT_AGENT_SKILLS_DOC, CURSOR_SKILLS_DOC],
  limits: [
    ...AGENT_SKILLS_LIMITS,
    {
      field: 'body',
      max: MAX_SKILL_BODY_LINES,
      unit: 'lines',
      severity: 'warning',
      doc: AGENT_SKILLS_SPEC_DOC,
    },
  ],
};
