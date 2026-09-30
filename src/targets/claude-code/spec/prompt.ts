/**
 * Claude Code `prompt` emission spec — scaffold path only (`.claude/skills/<slug>/SKILL.md`).
 * Also reused for `workflow` (see spec/workflow.ts), which shares this exact user-invoked-skill
 * shape plus a "## Steps" body section. `{{name}}` catalog placeholders translate to `$name`,
 * resolved via the `arguments:` frontmatter list Claude Code maps by position.
 *
 * Formerly emitted to `.claude/commands/<slug>.md`. Per code.claude.com/docs/en/skills (verified
 * 2026-08-06): "Custom commands have been merged into skills. A file at
 * .claude/commands/deploy.md and a skill at .claude/skills/deploy/SKILL.md both create /deploy and
 * work the same way… Skills add optional features: a directory for supporting files, frontmatter
 * to control whether you or Claude invokes them, and the ability for Claude to load them
 * automatically when relevant." `disable-model-invocation: true` reproduces the old command
 * semantics exactly — user-invoked only, never auto-dispatched.
 *
 * CONTRACT ROUTING NOTE: this spec's `pathPattern` is now IDENTICAL to `spec/skill.ts`'s (both
 * match `.claude/skills/<name>/SKILL.md`) — a direct consequence of the merge documented above.
 * `checkOutputContract()` (output-contract.ts) matches the FIRST entry whose pattern tests true,
 * and `CLAUDE_SCAFFOLD_SKILL_SPEC` sits earlier in `CLAUDE_EMIT_SPECS`, so in practice the skill
 * contract validates this spec's `requiredKeys`/`forbiddenKeys` too (both specs agree on those).
 * The unresolved-{{…}} bodyForbid below is NOT mirrored onto the skill contract — real skills
 * (Angular) legitimately contain literal `{{ }}` — so it is asserted directly against this spec's
 * `bodyForbids` in test/targets/claude-code.test.ts rather than through checkOutputContract().
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { toClaudePlaceholders, buildArgumentHint, type PromptArg } from '../../prompt-args';
import { CLAUDE_SKILLS_DOC } from '../../doc-refs';
import { CLAUDE_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';

/** Same id -> slug rule the old `.claude/commands/<slug>.md` path used (full id, `/` -> `-`) —
 * kept identical to preserve cross-language uniqueness. `basenameOfId` alone is NOT safe here:
 * two artifacts named `deploy` in different language prefixes would collide on both the `name:`
 * value and the skill directory. */
function slugOf(id: string): string {
  return id.replace(/\//g, '-');
}

/** `name:` derives from the artifact id's slug — prompt/workflow frontmatter carries no `name`
 * field of its own (unlike `skill`), so this reads the always-present `id` as its trigger and
 * ignores the raw value, matching the `agent: agent` hardcoded-value pattern used elsewhere. */
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

/** `argument-hint:` shows autocomplete hint (e.g. "[diff] [audience]"); quoted — bare `[x]` is a YAML flow sequence. */
const argumentHintMapping: FieldMapping = {
  from: 'args',
  to: 'argument-hint',
  required: false,
  when: fm => Array.isArray(fm.args) && (fm.args as PromptArg[]).length > 0,
  serialize: v => `argument-hint: "${buildArgumentHint(v as PromptArg[])}"`,
};

/** `arguments:` declares named positional args so Claude's `$name` substitution resolves. */
const argumentsListMapping: FieldMapping = {
  from: 'args',
  to: 'arguments',
  required: false,
  when: fm => Array.isArray(fm.args) && (fm.args as PromptArg[]).length > 0,
  serialize: v => ['arguments:', ...(v as PromptArg[]).map(a => `  - ${a.name}`)].join('\n'),
};

/** Always present, always true — a prompt/workflow is user-invoked only, matching the retired
 * `.claude/commands/` format's semantics exactly (never auto-dispatched by Claude). */
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

export const CLAUDE_PROMPT_SPEC: KindEmitSpec = {
  kind: 'prompt',
  outputPath: artifact => `.claude/skills/${slugOf(artifact.id)}/SKILL.md`,
  pathPattern: /\.claude\/skills\/.*\/SKILL\.md$/,
  bodyTransform: toClaudePlaceholders,
  frontmatter: [
    nameMapping,
    descriptionMapping,
    argumentHintMapping,
    argumentsListMapping,
    disableModelInvocationMapping,
  ],
  emitEmptyFrontmatter: true,
  body: [titleHeading],
  forbiddenKeys: ['paths', 'applyTo', 'agent', 'tools'],
  lexicon: CLAUDE_LEXICON,
  bodyForbids: [
    { pattern: /\{\{/, reason: 'unresolved {{…}} placeholder (should be translated to $name)' },
    {
      pattern: /\$\{input:/,
      reason: 'Copilot ${input:…} placeholder found in Claude command body',
    },
    UNTRANSLATED_TOKEN_FORBID,
  ],
  docs: [CLAUDE_SKILLS_DOC],
};
