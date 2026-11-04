/**
 * Resolves the install-time variable values `add` writes. Each declared name takes the first of a
 * `--var` flag, a valid recorded value, a `<NAME>` preview under `--dry-run`, or a prompt in a
 * terminal; `--yes` and a non-interactive run never prompt and fail with the `--var` hint instead.
 *
 * @module
 */
import { SigilError } from '../../errors';
import {
  VAR_VALUE_RULE,
  declaredVarNames,
  isVarValue,
  usableVars,
  type VarValues,
} from '../../mcp-vars';
import type { ResolvedArtifact } from '../../types';
import { isCancel, text } from '../../wizard/prompts';

/** The prompt text one variable declares. */
interface VarSpec {
  name: string;
  title: string;
  description: string;
}

type Declaring = Map<string, ResolvedArtifact[]>;

/** A cancelled prompt, as a symbol because `cancelled` is itself a valid value. */
const CANCELLED = Symbol('cancelled');

/**
 * The value for every variable the selected artifacts declare, `{}` when they declare none, or
 * `'cancelled'` when the user cancels a prompt.
 */
export async function resolveAddVars(input: {
  artifacts: readonly ResolvedArtifact[]; // the config ids to write
  /** selected artifacts already up to date: their names are valid flags but need no value */
  upToDate?: readonly ResolvedArtifact[];
  flags: VarValues;
  recorded: (id: string) => VarValues;
  dryRun: boolean;
  yes: boolean;
  interactive: boolean; // isInteractiveTTY() from the caller
  ask: (spec: { name: string; title: string; description: string }) => Promise<string | symbol>;
}): Promise<VarValues | 'cancelled'> {
  const declaring = groupDeclaring(input.artifacts);
  assertKnownFlags(input.flags, declaring, input.upToDate ?? []);
  const values: Record<string, string> = {};
  const outcome = await resolveNames(input, declaring, values);
  if (outcome === CANCELLED) return 'cancelled';
  if (outcome.missing.length > 0) throw missingValuesError(outcome.missing);
  return values;
}

type AddVarsInput = Parameters<typeof resolveAddVars>[0];

/** Each distinct declared name, mapped to the artifacts that declare it, in input order. */
function groupDeclaring(artifacts: readonly ResolvedArtifact[]): Declaring {
  const declaring: Declaring = new Map();
  for (const artifact of artifacts) {
    for (const name of declaredVarNames(artifact)) {
      const list = declaring.get(name);
      if (list === undefined) declaring.set(name, [artifact]);
      else list.push(artifact);
    }
  }
  return declaring;
}

/**
 * A flag that no selected artifact declares is a typo, so it fails before any prompt. A name an
 * up-to-date artifact declares is known, but has no value to resolve: nothing will be written.
 */
function assertKnownFlags(
  flags: VarValues,
  declaring: Declaring,
  upToDate: readonly ResolvedArtifact[],
): void {
  const known = new Set(declaring.keys());
  for (const artifact of upToDate) {
    for (const name of declaredVarNames(artifact)) known.add(name);
  }
  for (const name of Object.keys(flags)) {
    if (!known.has(name)) {
      throw new SigilError(
        `--var ${name} names no install variable the selected artifacts declare.`,
      );
    }
  }
}

async function resolveNames(
  input: AddVarsInput,
  declaring: Declaring,
  values: Record<string, string>,
): Promise<{ missing: string[] } | typeof CANCELLED> {
  const missing: string[] = [];
  for (const [name, artifacts] of declaring) {
    const value = await resolveName(input, name, artifacts);
    if (value === CANCELLED) return CANCELLED;
    if (value === undefined) missing.push(name);
    else values[name] = value;
  }
  return { missing };
}

/** `values[name]`, ignoring what an object inherits, such as `constructor`. */
function ownValue(values: VarValues, name: string): string | undefined {
  return Object.hasOwn(values, name) ? values[name] : undefined;
}

/** Resolves one distinct name once, however many artifacts declare it. */
async function resolveName(
  input: AddVarsInput,
  name: string,
  artifacts: readonly ResolvedArtifact[],
): Promise<string | typeof CANCELLED | undefined> {
  const flag = ownValue(input.flags, name);
  if (flag !== undefined) return flag;
  const recorded = recordedValue(artifacts, name, input.recorded);
  if (recorded !== undefined) return recorded;
  if (input.dryRun) return `<${name}>`;
  if (!input.interactive || input.yes) return undefined;
  return promptValue(name, artifacts, input.ask);
}

/** The first valid recorded value among the declaring artifacts, in order. */
function recordedValue(
  artifacts: readonly ResolvedArtifact[],
  name: string,
  recorded: (id: string) => VarValues,
): string | undefined {
  for (const artifact of artifacts) {
    const value = ownValue(usableVars(recorded(artifact.id)), name);
    if (value !== undefined) return value;
  }
  return undefined;
}

async function promptValue(
  name: string,
  artifacts: readonly ResolvedArtifact[],
  ask: (spec: VarSpec) => Promise<string | symbol>,
): Promise<string | typeof CANCELLED> {
  const answer = await ask(firstSpec(artifacts, name));
  if (isCancel(answer)) return CANCELLED;
  if (!isVarValue(answer)) {
    throw new SigilError(`Invalid value for ${name}: ${VAR_VALUE_RULE}`);
  }
  return answer;
}

/** The first declaring artifact's prompt text, which both artifacts then share. */
function firstSpec(artifacts: readonly ResolvedArtifact[], name: string): VarSpec {
  for (const artifact of artifacts) {
    const spec = varSpec(artifact, name);
    if (spec !== undefined) return spec;
  }
  return { name, title: name, description: '' };
}

/** Reads one declared var's prompt text from frontmatter, narrowing what a valid catalog guarantees. */
function varSpec(artifact: ResolvedArtifact, name: string): VarSpec | undefined {
  const vars: unknown = artifact.frontmatter['vars'];
  if (vars === null || typeof vars !== 'object' || Array.isArray(vars)) return undefined;
  const spec: unknown = (vars as Record<string, unknown>)[name];
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return undefined;
  const { title, description } = spec as Record<string, unknown>;
  if (typeof title !== 'string' || typeof description !== 'string') return undefined;
  return { name, title, description };
}

/** One error for every unresolvable name, so a typo or a missing flag is fixed in one pass. */
function missingValuesError(names: readonly string[]): SigilError {
  const flags = names.map(name => `--var ${name}=<value>`).join(' ');
  const noun = names.length === 1 ? 'a value' : 'values';
  return new SigilError(`Missing ${noun} for ${names.join(', ')}.`, {
    hint: `Pass ${flags}.`,
  });
}

/** The default prompt: the var's title is the message, its description the placeholder. */
export function askVar(spec: VarSpec): Promise<string | symbol> {
  return text({
    message: spec.title,
    placeholder: spec.description,
    validate: value => (isVarValue(value) ? undefined : VAR_VALUE_RULE),
  });
}
