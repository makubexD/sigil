/**
 * Skill emission pieces shared by every target that writes an Agent Skills SKILL.md without a
 * native field for the catalog's `whenToUse` / `argumentHint` (Copilot, the open-standard target):
 * the required `name` / `description` mappings and the body sections that carry the rest, plus
 * the inlined rules. One definition, so those targets' SKILL.md files can't drift apart.
 *
 * @module
 */
import type { BodySectionSpec, FieldMapping } from '../spec-types';
import type { ResolvedArtifact } from '../../types';
import { yamlScalar } from '../yaml-util';
import { renderBoundarySection } from './boundary';

export const nameMapping: FieldMapping = {
  from: 'name',
  to: 'name',
  required: true,
  serialize: v => `name: ${v as string}`,
};

export const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

/**
 * Renders the catalog's `whenToUse` frontmatter field as a leading body section, since Copilot
 * has no frontmatter field to carry it natively (see module header). Omitted entirely when the
 * artifact never authored `whenToUse`.
 */
export const whenToUseSection: BodySectionSpec = {
  id: 'whenToUse',
  position: 'before',
  render: (artifact: ResolvedArtifact) => {
    const whenToUse = artifact.frontmatter.whenToUse;
    if (typeof whenToUse !== 'string' || whenToUse.trim() === '') return [];
    return ['## When to Use', '', whenToUse.trim(), ''];
  },
};

/**
 * Renders the catalog's `argumentHint` as a body line — Copilot has no frontmatter field for it
 * (`argument-hint` is a documented hard error outside Claude Code per AGENT_SKILLS_SPEC_DOC's
 * six-field list), so unlike `allowedTools` this cannot become a FieldMapping. Previously dropped
 * silently; a Copilot user invoking the skill had no clue what to pass.
 */
export const argumentHintSection: BodySectionSpec = {
  id: 'argumentHint',
  position: 'before',
  render: (artifact: ResolvedArtifact) => {
    const hint = artifact.frontmatter.argumentHint;
    if (typeof hint !== 'string' || hint.trim() === '') return [];
    return [`**Arguments:** ${hint.trim()}`, ''];
  },
};

/** `## Boundary` — a skill's own `relatedArtifacts` (SkillSchema); same rendering agents already
 * get (see spec/agent.ts's titleAndBoundarySection). Renders `[]` when `catalog`/`installSet`
 * are absent (renderBoundarySection's own contract) — safe for call sites not yet threading them. */
export const boundarySection: BodySectionSpec = {
  id: 'boundary',
  position: 'before',
  render: (artifact, ctx) => renderBoundarySection(artifact, ctx.installSet, ctx.catalog),
};

/** The "## Coding guidelines to apply" section — Copilot's equivalent of Claude's Applied Rules. */
export const codingGuidelinesSection: BodySectionSpec = {
  id: 'codingGuidelines',
  position: 'after',
  render: (artifact: ResolvedArtifact) => {
    const rules = artifact.resolvedRules ?? [];
    if (rules.length === 0) return [];
    const parts: string[] = ['', '---', '', '## Coding guidelines to apply', ''];
    for (const rule of rules) {
      const ruleTitle = rule.frontmatter.title as string;
      parts.push(`### ${ruleTitle}`, '', rule.resolvedBody ?? rule.body, '');
    }
    return parts;
  },
};
