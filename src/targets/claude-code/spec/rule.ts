/**
 * Claude Code `rule` emission spec — scaffold-path only (compile-path rules are never written as
 * standalone files; plugin-build.ts inlines resolvedBody straight into the owning skill's
 * "## Applied Rules" section via spec/skill.ts, so there is no second `paths:` site to keep in
 * sync here). Any rule with an authored `appliesTo` gets a `paths:` block so Claude Code loads it
 * only when editing matching files; a rule with no `appliesTo` at all has no frontmatter and
 * loads unconditionally every session.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { CLAUDE_RULES_DOC } from '../../doc-refs';
import { CLAUDE_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';

const appliesToMapping: FieldMapping = {
  from: 'appliesTo',
  to: 'paths',
  required: false,
  when: fm => Array.isArray(fm.appliesTo) && (fm.appliesTo as string[]).length > 0,
  serialize: v => `paths:\n${(v as string[]).map(g => `  - "${g}"`).join('\n')}`,
};

/** `# <title>` heading — rules render it as a body-level heading, not frontmatter. */
const titleHeading: BodySectionSpec = {
  id: 'title',
  position: 'before',
  render: artifact => [`# ${artifact.frontmatter.title as string}`, ''],
};

export const CLAUDE_SCAFFOLD_RULE_SPEC: KindEmitSpec = {
  kind: 'rule',
  variant: 'scaffold',
  outputPath: artifact => `.claude/rules/${artifact.id.replace(/\//g, '-')}.md`,
  pathPattern: /\.claude\/rules\/.*\.md$/,
  frontmatter: [appliesToMapping],
  emitEmptyFrontmatter: false, // a rule with no appliesTo gets NO frontmatter block at all
  body: [titleHeading],
  forbiddenKeys: ['name', 'applyTo', 'agent', 'description'],
  lexicon: CLAUDE_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CLAUDE_RULES_DOC],
};
