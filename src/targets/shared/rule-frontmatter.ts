/**
 * Rule-file pieces shared by targets whose rule files take a comma-joined `globs` string and a
 * `description` (Cursor `.mdc`, Antigravity `.agents/rules/`). Each target keeps its own mode key
 * (`alwaysApply`, `trigger`), since that is where the two formats differ.
 *
 * The `globs` value goes through `yamlScalar`, which double-quotes it: an unquoted value starting
 * with `*` is a YAML alias, so only the quoted form parses back in sigil's own output contract.
 *
 * @module
 */
import type { BodySectionSpec, FieldMapping } from '../spec-types';
import { yamlScalar } from '../yaml-util';
import { appliesToEveryFile } from './repo-wide-rules';

/**
 * A scoped rule's `globs: "<list>"`; a repo-wide rule emits no `globs` at all, so this serializes
 * to the empty string, which renderFieldMapping() drops. `required: false` for the same reason:
 * the key is legitimately absent on a repo-wide rule.
 */
export const commaGlobsMapping: FieldMapping = {
  from: 'appliesTo',
  to: 'globs',
  required: false,
  serialize: v => {
    const globs = v as string[] | undefined;
    return appliesToEveryFile(globs) ? '' : `globs: ${yamlScalar((globs ?? []).join(','))}`;
  },
};

/** The rule's `description` on one line, whitespace collapsed, always double-quoted. */
export const ruleDescriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(String(v).replace(/\s+/g, ' ').trim())}`,
};

/** `# <title>` heading — rules render it as a body-level heading, not frontmatter. */
export const ruleTitleHeading: BodySectionSpec = {
  id: 'title',
  position: 'before',
  render: artifact => [`# ${artifact.frontmatter.title as string}`, ''],
};
