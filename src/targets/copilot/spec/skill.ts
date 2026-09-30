/**
 * Copilot `skill` emission spec — declarative counterpart to build-helpers.ts's buildSkillMd().
 * Frontmatter is deliberately minimal: `name` + `description` only. NO `applyTo`/`paths` —
 * Copilot Agent Skills load by description relevance, not file-path matching. Resolved rule
 * bodies are always inlined (Copilot has no equivalent to Claude's native .claude/rules/ loading
 * on the scaffold path, so both compile and scaffold outputs inline for self-containment).
 *
 * `whenToUse` has no Copilot frontmatter equivalent (Claude emits it natively as `when_to_use:`
 * — see claude-code/spec/skill.ts). Copilot Agent Skills dispatch on `description` relevance
 * alone, so the field is rendered as a leading `## When to Use` body section instead of being
 * dropped — see whenToUseSection below. (Fixed 2026-08-07: the field was previously silently
 * absent from both Copilot frontmatter and body for any artifact authoring it.)
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import type { ResolvedArtifact } from '../../../types';
import { yamlScalar } from '../../yaml-util';
import {
  COPILOT_AGENT_SKILLS_DOC,
  VSCODE_AGENT_SKILLS_DOC,
  AGENT_SKILLS_SPEC_DOC,
} from '../../doc-refs';
import { COPILOT_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID, CLAUDE_LITERAL_FORBIDS_ON_COPILOT } from '../../lexicon-forbid';
import { renderBoundarySection } from '../../shared/boundary';

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
 * Vendor-neutral `allowedTools` (schema/index.ts's SkillSchema), same source field
 * claude-code/spec/skill.ts's `allowedToolsMapping` consumes. Valid on Copilot per
 * AGENT_SKILLS_SPEC_DOC's six-field outside-Claude-Code spec. Previously dropped entirely — a
 * skill declaring 4 read-only tools got Copilot's unrestricted default, the same bug class as the
 * agent `tools` gap fixed 2026-08-10 (see declared-but-unemitted conformance rule).
 */
const allowedToolsMapping: FieldMapping = {
  from: 'allowedTools',
  to: 'allowed-tools',
  required: false,
  when: fm => Array.isArray(fm.allowedTools) && (fm.allowedTools as string[]).length > 0,
  serialize: v => `allowed-tools: ${(v as string[]).join(', ')}`,
};

/**
 * Renders the catalog's `whenToUse` frontmatter field as a leading body section, since Copilot
 * has no frontmatter field to carry it natively (see module header). Omitted entirely when the
 * artifact never authored `whenToUse`.
 */
const whenToUseSection: BodySectionSpec = {
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
const argumentHintSection: BodySectionSpec = {
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
const boundarySection: BodySectionSpec = {
  id: 'boundary',
  position: 'before',
  render: (artifact, ctx) => renderBoundarySection(artifact, ctx.installSet, ctx.catalog),
};

/** The "## Coding guidelines to apply" section — Copilot's equivalent of Claude's Applied Rules. */
const codingGuidelinesSection: BodySectionSpec = {
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

export const COPILOT_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: (artifact, ctx) => {
    const name = artifact.frontmatter.name as string;
    const root = ctx.packName ? '.github' : '.github'; // same layout for compile and scaffold
    return `${root}/skills/${name}/SKILL.md`;
  },
  pathPattern: /\.github\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: COPILOT_LEXICON,
  // No {{ forbid — skill bodies never go through placeholder translation (that's a
  // prompt/workflow-only concept), and Angular skills legitimately contain literal `{{ }}`
  // template-binding syntax in their prose/examples.
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID, ...CLAUDE_LITERAL_FORBIDS_ON_COPILOT],
  // Both consumers of .github/skills/*/SKILL.md — GitHub's cloud agent and VS Code's local agent
  // read the same shared Agent Skills open standard, each with its own docs page.
  docs: [COPILOT_AGENT_SKILLS_DOC, VSCODE_AGENT_SKILLS_DOC, AGENT_SKILLS_SPEC_DOC],
};
