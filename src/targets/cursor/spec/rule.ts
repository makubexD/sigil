/**
 * Cursor `rule` emission spec — project rules as `.mdc` files in `.cursor/rules/`. A rule has two
 * modes, decided only by the authored `appliesTo` (never by `language`): repo-wide (absent,
 * empty, or every glob a match-everything glob) writes `alwaysApply: true` and no `globs`, so
 * the rule is in the model's context every session; anything narrower writes a comma-joined
 * `globs` list and `alwaysApply: false`, so Cursor attaches it once a matching file is read.
 *
 * The `globs` value goes through `yamlScalar`, which double-quotes it. Cursor accepts it quoted or
 * not (Phase B run 1, docs/decisions/cursor-target-2026-11.md), but an unquoted value starting
 * with `*` is a YAML alias, so only the quoted form parses back in sigil's own output contract.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { CURSOR_RULES_DOC } from '../doc-refs';
import { CURSOR_LEXICON } from '../lexicon';
import { yamlScalar } from '../../yaml-util';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { appliesToEveryFile } from '../../shared/repo-wide-rules';

/**
 * Scoped rules (`globs: "<list>"` + `alwaysApply: false`); a repo-wide rule emits no `globs` at
 * all, so this serializes to the empty string, which renderFieldMapping() drops. `required:
 * false` for the same reason: the key is legitimately absent on a repo-wide rule.
 */
export const globsMapping: FieldMapping = {
  from: 'appliesTo',
  to: 'globs',
  required: false,
  serialize: v => {
    const globs = v as string[] | undefined;
    return appliesToEveryFile(globs) ? '' : `globs: ${yamlScalar((globs ?? []).join(','))}`;
  },
};

/**
 * The other half of the mode: `true` for a repo-wide rule, `false` for a scoped one. It is a
 * separate mapping because the frontmatter-injection test requires every emitted key to be
 * declared as a `to:` on the spec, and this key is emitted in both modes.
 */
const alwaysApplyMapping: FieldMapping = {
  from: 'appliesTo',
  to: 'alwaysApply',
  required: true,
  alwaysEmit: true, // decides the mode when appliesTo is unauthored
  serialize: v => `alwaysApply: ${appliesToEveryFile(v as readonly string[] | undefined)}`,
};

/**
 * Cursor's rule UI shows a `description`, the same reason Copilot's rule spec emits one.
 * Antigravity's rule spec reuses this mapping, so it keeps its whitespace-collapsing form.
 */
export const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(String(v).replace(/\s+/g, ' ').trim())}`,
};

/** `# <title>` heading — rules render it as a body-level heading, not frontmatter. */
const titleHeading: BodySectionSpec = {
  id: 'title',
  position: 'before',
  render: artifact => [`# ${artifact.frontmatter.title as string}`, ''],
};

/** Cursor's guidance for project rules: keep each rule under 500 lines. */
const MAX_RULE_BODY_LINES = 500;

export const CURSOR_RULE_SPEC: KindEmitSpec = {
  kind: 'rule',
  outputPath: artifact => `.cursor/rules/${artifact.id.replace(/\//g, '-')}.mdc`,
  pathPattern: /\.cursor\/rules\/.*\.mdc$/,
  frontmatter: [descriptionMapping, globsMapping, alwaysApplyMapping],
  emitEmptyFrontmatter: false,
  body: [titleHeading],
  forbiddenKeys: ['name', 'applyTo', 'paths', 'agent'],
  lexicon: CURSOR_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CURSOR_RULES_DOC],
  limits: [
    {
      field: 'body',
      max: MAX_RULE_BODY_LINES,
      unit: 'lines',
      severity: 'warning',
      doc: CURSOR_RULES_DOC,
    },
  ],
};
