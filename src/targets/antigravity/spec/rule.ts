/**
 * Antigravity `rule` emission spec — project rules as `.agents/rules/<slug>.md`. A rule has two
 * modes, decided only by the authored `appliesTo` (never by `language`): repo-wide (absent, empty,
 * or every glob a match-everything glob) writes `trigger: always_on`, so the rule is in the
 * model's context every session; anything narrower writes `trigger: glob` and the comma-joined
 * `globs` list.
 *
 * A scoped rule is never written: probe B1 (docs/decisions/antigravity-target-2026-11.md) found
 * `agy` 1.4.12 never attaches a `trigger: glob` rule, after a read, an edit or in a later turn.
 * `skipReason` skips it with that reason; the skills that use it already inline it. The spec still
 * renders the documented `trigger: glob` form, so deleting `skipReason` is the only change once a
 * release attaches glob rules.
 */
import type { KindEmitSpec, FieldMapping } from '../../spec-types';
import { ANTIGRAVITY_RULES_DOC } from '../doc-refs';
import { ANTIGRAVITY_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { appliesToEveryFile } from '../../shared/repo-wide-rules';
import {
  commaGlobsMapping,
  ruleDescriptionMapping,
  ruleTitleHeading,
} from '../../shared/rule-frontmatter';

/** The mode key: `always_on` for a repo-wide rule, `glob` for a scoped one. */
const triggerMapping: FieldMapping = {
  from: 'appliesTo',
  to: 'trigger',
  required: true,
  alwaysEmit: true, // decides the mode when appliesTo is unauthored
  serialize: v =>
    `trigger: ${appliesToEveryFile(v as readonly string[] | undefined) ? 'always_on' : 'glob'}`,
};

/** Antigravity truncates a rule file past 24,000 bytes (its rules doc). */
const MAX_RULE_BYTES = 24000;

/** Why a scoped rule is skipped (ADR probe B1). */
const SCOPED_RULE_SKIP_REASON =
  'Antigravity does not attach trigger: glob rules yet (ADR probe B1); ' +
  'the skills that use this rule carry it inline';

export const ANTIGRAVITY_RULE_SPEC: KindEmitSpec = {
  kind: 'rule',
  outputPath: artifact => `.agents/rules/${artifact.id.replace(/\//g, '-')}.md`,
  pathPattern: /\.agents\/rules\/[^/]*\.md$/,
  frontmatter: [triggerMapping, ruleDescriptionMapping, commaGlobsMapping],
  emitEmptyFrontmatter: false,
  skipReason: frontmatter =>
    appliesToEveryFile(frontmatter.appliesTo as readonly string[] | undefined)
      ? undefined
      : SCOPED_RULE_SKIP_REASON,
  body: [ruleTitleHeading],
  forbiddenKeys: ['name', 'applyTo', 'paths', 'agent', 'alwaysApply'],
  lexicon: ANTIGRAVITY_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [ANTIGRAVITY_RULES_DOC],
  limits: [
    {
      field: 'body',
      max: MAX_RULE_BYTES,
      unit: 'bytes',
      severity: 'error',
      doc: ANTIGRAVITY_RULES_DOC,
    },
  ],
};
