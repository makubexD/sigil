/**
 * Claude Code `workflow` emission spec — a user-invoked skill like `prompt` (spec/prompt.ts), but
 * with a `## Steps` checklist appended (workflows have `steps:`, not `args:`) and no placeholder
 * translation (workflow bodies don't carry `{{name}}` tokens).
 *
 * Formerly emitted to `.claude/commands/<slug>.md`; see spec/prompt.ts's header for the
 * commands-merged-into-skills citation this migration follows.
 *
 * NAMING COLLISION — do not "fix" the citation below to `/en/workflows`: Claude Code's own
 * "workflows" feature (`.claude/workflows/*.js`, dynamic subagent-orchestration scripts,
 * https://code.claude.com/docs/en/workflows) is a DIFFERENT, unrelated feature. A sigil `workflow`
 * artifact is a markdown skill with an ordered checklist body — it has nothing to do with that JS
 * orchestration format, and is documented on the Skills page like `prompt` is.
 *
 * CONTRACT ROUTING NOTE: see spec/prompt.ts's identical note — this spec's `pathPattern` collides
 * with `spec/skill.ts`'s, so the skill contract (earlier in `CLAUDE_EMIT_SPECS`) validates this
 * output's required/forbidden frontmatter keys in practice.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { CLAUDE_SKILLS_DOC } from '../../doc-refs';
import { CLAUDE_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';

interface WorkflowStep {
  ref: string;
  description?: string;
}

/** Same id -> slug rule as spec/prompt.ts's `slugOf` — full id, `/` -> `-`, kept identical to the
 * old `.claude/commands/<slug>.md` path to preserve cross-language uniqueness. */
function slugOf(id: string): string {
  return id.replace(/\//g, '-');
}

/** See spec/prompt.ts's `nameMapping` — same derivation, same rationale. */
const nameMapping: FieldMapping = {
  from: 'id',
  to: 'name',
  required: true,
  alwaysEmit: true,
  serialize: v => `name: ${slugOf(v as string)}`,
};

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

/** See spec/prompt.ts's `disableModelInvocationMapping` — same rationale. */
const disableModelInvocationMapping: FieldMapping = {
  from: 'id',
  to: 'disable-model-invocation',
  required: true,
  alwaysEmit: true,
  serialize: () => `disable-model-invocation: true`,
};

const titleHeading: BodySectionSpec = {
  id: 'title',
  position: 'before',
  render: artifact => [`# ${artifact.frontmatter.title as string}`, ''],
};

/** Renders the "## Steps" checklist section, or `[]` when the workflow has no steps. */
const stepsSection: BodySectionSpec = {
  id: 'steps',
  position: 'after',
  render: artifact => {
    const steps = (artifact.frontmatter.steps as WorkflowStep[] | undefined) ?? [];
    if (steps.length === 0) return [];
    return [
      '',
      '## Steps',
      '',
      ...steps.map(s => `- [ ] \`${s.ref}\`` + (s.description ? ` — ${s.description}` : '')),
    ];
  },
};

export const CLAUDE_WORKFLOW_SPEC: KindEmitSpec = {
  kind: 'workflow',
  outputPath: artifact => `.claude/skills/${slugOf(artifact.id)}/SKILL.md`,
  pathPattern: /\.claude\/skills\/.*\/SKILL\.md$/,
  bodyTransform: body => body.trim(),
  frontmatter: [nameMapping, descriptionMapping, disableModelInvocationMapping],
  emitEmptyFrontmatter: true,
  body: [titleHeading, stepsSection],
  forbiddenKeys: ['paths', 'applyTo', 'agent', 'tools'],
  lexicon: CLAUDE_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CLAUDE_SKILLS_DOC],
};
