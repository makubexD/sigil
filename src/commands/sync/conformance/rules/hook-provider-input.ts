/**
 * `hook-provider-input` — a catalog `hook` whose `script`, `command` or `args` names one provider's
 * own hook-input field (`tool_input`, `tool_name`, `agent_type`, `file_path`, …) instead of reading
 * the neutral `input` argument a `script` hook receives (src/targets/hook-input.ts). A catalog hook
 * is authored once and installed on every target it ships to, so a script written against one
 * provider's stdin reads nothing on the others: `protect-config` parsed Claude's `tool_input`, also
 * Copilot's raw `apply_patch` string and Codex's `tool_input.command`, and still would not see
 * Antigravity's `toolCall.args.Path` (docs/decisions/neutral-hook-contract-2026-11.md).
 *
 * Detection is derived from every registered target's `hookInput` dialect (getAllTargets()) — not
 * a hand-listed string set — so a new target or a changed dialect automatically extends what this
 * rule catches, the same "derive from the live source of truth" shape as `provider-term-leak`.
 * Each dialect contributes its `toolField` / `inputField` / `agentField`, the first dotted-path
 * segment of each (`toolCall` from `toolCall.name`), and every `pathFields` / `commandField` entry
 * longer than 4 characters (the short ones — `path`, `args` — are too common to be a signal).
 *
 * The neutral contract's own property names are exempt: `command` is both a provider field and
 * `HookInput.command`, the correct way for a `script` to read a shell command, and text alone
 * cannot tell them apart. `NEUTRAL_INPUT_FIELDS` is a full `keyof HookInput` record, so a field
 * added to the contract fails to compile until it is considered here.
 *
 * No `fix()`: the replacement is not a substitution — the script must read a different contract
 * (`input.files` / `input.tool` / `input.command` / `input.agent`), which is rewriting logic, so
 * this stays `editorial`.
 *
 * @module
 */
import type { Artifact, Target } from '../../../../types';
import type { ConformanceFinding, ConformanceRule } from '../types';
import { CLAUDE_HOOKS_DOC } from '../../../../targets/doc-refs';
import { getAllTargets } from '../../../../targets/index';
import type { HookInput, HookInputDialect } from '../../../../targets/hook-input';

const RULE_ID = 'hook-provider-input';

/**
 * The neutral contract's own property names (`HookInput`). Excluded from the derived literals: a
 * `script` that reads `input.command` is using the contract correctly, and no text match can tell
 * that apart from a provider field with the same name.
 */
const NEUTRAL_INPUT_FIELDS: Record<keyof HookInput, true> = {
  event: true,
  tool: true,
  files: true,
  command: true,
  agent: true,
  cwd: true,
};

/** The hook frontmatter fields scanned, in report order. */
const FIELDS = ['script', 'command', 'args'] as const;

/** `pathFields` / `commandField` entries must exceed this many characters (4, i.e. `path`, `args`). */
const MIN_LITERAL_LENGTH = 5;

/** A dotted path's first segment: `toolCall` from `toolCall.name`. */
function firstSegment(dotted: string): string {
  const [first] = dotted.split('.');
  return first ?? dotted;
}

/** Every provider hook-input literal one dialect names (before the neutral-field exemption). */
function literalsOfDialect(dialect: HookInputDialect): string[] {
  const paths = [dialect.toolField, dialect.inputField, dialect.agentField].filter(
    (path): path is string => path !== undefined,
  );
  return [
    ...paths.flatMap(path => [path, firstSegment(path)]),
    ...dialect.pathFields.filter(field => field.length >= MIN_LITERAL_LENGTH),
    ...(dialect.commandField !== undefined && dialect.commandField.length >= MIN_LITERAL_LENGTH
      ? [dialect.commandField]
      : []),
  ];
}

/**
 * Every provider hook-input literal across `targets` (default: every registered target), deduped
 * and sorted so a finding and its report order are the same on every run.
 */
export function hookInputLiterals(
  targets: readonly Pick<Target, 'hookInput'>[] = getAllTargets(),
): string[] {
  const literals = new Set<string>();
  for (const target of targets) {
    if (!target.hookInput) continue;
    for (const literal of literalsOfDialect(target.hookInput)) {
      if (Object.hasOwn(NEUTRAL_INPUT_FIELDS, literal)) continue;
      literals.add(literal);
    }
  }
  return [...literals].sort();
}

/** Escapes a literal string for safe use inside a `RegExp` constructor. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A whole-word matcher: a literal preceded or followed by `[A-Za-z0-9_]` is part of a longer
 * identifier, not a match. So `tool_input` matches in `tool_input` and `input.tool_input`, while
 * `input.files` never matches it.
 */
function literalRe(literal: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(literal)}(?![A-Za-z0-9_])`);
}

/** The strings one hook field holds: `args` is a list, the other two are single strings. */
function fieldTexts(field: (typeof FIELDS)[number], value: unknown): string[] {
  if (field === 'args') {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }
  return typeof value === 'string' ? [value] : [];
}

/** The `field 'literal'` pairs one artifact's hook text names, first-seen order, deduped. */
function leakedFields(artifact: Artifact, literals: readonly string[]): string[] {
  const parts = new Set<string>();
  for (const field of FIELDS) {
    for (const text of fieldTexts(field, artifact.frontmatter[field])) {
      for (const literal of literals) {
        if (literalRe(literal).test(text)) parts.add(`${field} '${literal}'`);
      }
    }
  }
  return [...parts];
}

/** The single finding for one hook, or undefined when it names no provider input field. */
function findingFor(
  artifact: Artifact,
  literals: readonly string[],
): ConformanceFinding | undefined {
  const parts = leakedFields(artifact, literals);
  if (parts.length === 0) return undefined;
  return {
    ruleId: RULE_ID,
    severity: 'error',
    artifactId: artifact.id,
    filePath: artifact.filePath,
    detail:
      `${parts.join(', ')} — read the neutral \`input\` argument from a \`script\` hook instead ` +
      '(HookInput, src/targets/hook-input.ts)',
  };
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const literals = hookInputLiterals(ctx.targets.length > 0 ? ctx.targets : getAllTargets());
  return ctx.catalog.artifacts
    .filter(artifact => artifact.kind === 'hook')
    .flatMap(artifact => {
      const finding = findingFor(artifact, literals);
      return finding === undefined ? [] : [finding];
    });
}

export const hookProviderInputRule: ConformanceRule = {
  id: RULE_ID,
  title: "A hook names a provider's own hook-input field instead of the neutral input",
  class: 'editorial',
  appliesTo: { kinds: ['hook'] },
  rationale:
    'A catalog hook ships to every target it is installed on, but stdin JSON differs per ' +
    'provider. A script reading one provider’s field (tool_input, tool_name, toolCall.args, …) ' +
    'fails open on every other target; the neutral `input` argument is normalized from each ' +
    'target’s HookInputDialect, so only it works everywhere.',
  docs: [CLAUDE_HOOKS_DOC],
  detect,
};
