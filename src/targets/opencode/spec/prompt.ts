/**
 * OpenCode `prompt` emission spec — a command file at `.opencode/commands/<slug>.md`, the slug
 * being the full artifact id with `/` replaced by `-` (the Claude scaffold's rule, so
 * `shared/explain-diff` becomes `shared-explain-diff.md`). Frontmatter is `description` only.
 * The body is the command template: `{{name}}` becomes `$<1-based position in args>`, because
 * OpenCode has no named argument form.
 *
 * Step 1 of docs/plan-opencode-target-d.md measured whether a real diff survives OpenCode's
 * quoting. Result, 2026-11-04: case 3 (an argument holding both `'` and `"`) and case 5 (a real
 * git diff holding both) failed on both lines, with no error, so the prompt doesn't ship. A diff
 * holding both quote types can't reach an argument whole, and nothing reports it. Most real
 * diffs hold both, so `explain-diff` doesn't ship on this target: `skipReason` refuses a prompt
 * with two or more `args`, and `add` says why. This is the arguments' shape, not the prompt's:
 * `{{diff}}` could reach OpenCode whole only as the last argument, and reordering `args:` to fit
 * would change the catalog for one target.
 *
 * `!`cmd`` and `@file` run or expand in an OpenCode template, so both are `bodyForbids`.
 */
import type { KindEmitSpec, FieldMapping } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { toPositionalPlaceholders, type PromptArg } from '../../prompt-args';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { OPENCODE_COMMANDS_DOC } from '../doc-refs';
import { OPENCODE_LEXICON } from '../lexicon';

/** The Claude scaffold's id -> slug rule: the full id, `/` -> `-`. */
function slugOf(id: string): string {
  return id.replace(/\//g, '-');
}

/**
 * A diff holding both quote types can't reach an argument whole (the quoting run's case 3 and
 * case 5, on both product lines), so a prompt with two or more arguments is skipped.
 */
const SPLIT_ARGS_SKIP_REASON =
  'OpenCode splits arguments on spaces and quotes, so only the last one can hold several words';

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

export const OPENCODE_PROMPT_SPEC: KindEmitSpec = {
  kind: 'prompt',
  outputPath: artifact => `.opencode/commands/${slugOf(artifact.id)}.md`,
  pathPattern: /\.opencode\/commands\/[^/]+\.md$/,
  bodyTransform: (body, artifact) =>
    toPositionalPlaceholders(body, artifact.frontmatter.args as readonly PromptArg[] | undefined),
  frontmatter: [descriptionMapping],
  emitEmptyFrontmatter: true,
  body: [],
  forbiddenKeys: ['name', 'args', 'arguments', 'argument-hint', 'disable-model-invocation'],
  lexicon: OPENCODE_LEXICON,
  bodyForbids: [
    UNTRANSLATED_TOKEN_FORBID,
    {
      pattern: /!`[^`]+`/,
      reason: 'OpenCode runs this shell command in the command template',
    },
    {
      pattern: /(?<![\w`])@[\w.~/-]/,
      reason: 'OpenCode expands this file reference in the command template',
    },
  ],
  docs: [OPENCODE_COMMANDS_DOC],
  skipReason: frontmatter =>
    Array.isArray(frontmatter.args) && frontmatter.args.length > 1
      ? SPLIT_ARGS_SKIP_REASON
      : undefined,
};
