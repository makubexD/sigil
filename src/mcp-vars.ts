/**
 * Install-time variables in MCP server config. A catalog `mcp` artifact declares names under
 * `vars:` and writes the neutral token `{sigil:var:NAME}`; the value is a literal supplied at
 * install and substituted before any target sees the artifact. Unlike `{sigil:env:NAME}` it is
 * never a secret: it lands in the written config and the manifest. Values are held to a fixed
 * rule because they reach command lines and files with their own expansion syntax.
 *
 * @module
 */
import { SigilError } from './errors';
import { isEnvName } from './targets/env-reference';
import type { Artifact } from './types';

/** Variable names to their install-time values. */
export type VarValues = Readonly<Record<string, string>>;

/** The accepted value shape, for error messages and the install prompt's validation. */
export const VAR_VALUE_RULE =
  'A value is 1 to 128 characters of ASCII letters, digits, dot, underscore or hyphen, starting with a letter or digit.';

const VAR_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VAR_TOKEN_RE = /\{sigil:var:([^}]*)\}/g;

/** Whether `value` satisfies {@link VAR_VALUE_RULE}. */
export function isVarValue(value: string): boolean {
  return VAR_VALUE_RE.test(value);
}

/** The distinct `{sigil:var:NAME}` names in `value`'s strings, at any depth, in first-seen order. */
export function varTokenNames(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === 'string') for (const m of v.matchAll(VAR_TOKEN_RE)) names.add(m[1] as string);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(value);
  return [...names];
}

function substituteString(value: string, lookup: (name: string) => string): string {
  return value.replace(VAR_TOKEN_RE, (token, name: string) => {
    if (!isEnvName(name)) {
      throw new SigilError(
        `Malformed ${token} in an MCP config: a variable name is letters, digits and _`,
      );
    }
    return lookup(name);
  });
}

/** Replaces every `{sigil:var:NAME}` token in `value`'s strings, at any depth; other values pass. */
export function substituteVars<T>(value: T, lookup: (name: string) => string): T {
  if (typeof value === 'string') return substituteString(value, lookup) as T;
  if (Array.isArray(value)) return value.map(item => substituteVars(item, lookup)) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, substituteVars(item, lookup)]),
  ) as T;
}

/** The `vars:` keys on an artifact's frontmatter, in declared order; `[]` when absent. */
export function declaredVarNames(artifact: Pick<Artifact, 'frontmatter'>): string[] {
  const vars: unknown = artifact.frontmatter['vars'];
  if (vars === null || typeof vars !== 'object' || Array.isArray(vars)) return [];
  return Object.keys(vars);
}

/** The declared names with no value in `values`, in declared order. */
export function missingVars(artifact: Pick<Artifact, 'frontmatter'>, values: VarValues): string[] {
  return declaredVarNames(artifact).filter(name => !Object.hasOwn(values, name));
}

/** `recorded` without the values that fail {@link isVarValue}. */
export function usableVars(recorded: VarValues | undefined): VarValues {
  if (recorded === undefined) return {};
  return Object.fromEntries(Object.entries(recorded).filter(([, value]) => isVarValue(value)));
}

function parseVarFlag(flag: string): { name: string; value: string } {
  const eq = flag.indexOf('=');
  if (eq < 0) throw new SigilError(`Malformed --var '${flag}': pass it as --var NAME=value.`);
  const name = flag.slice(0, eq);
  const value = flag.slice(eq + 1);
  if (!isEnvName(name)) {
    throw new SigilError(`Malformed --var '${flag}': pass it as --var NAME=value.`);
  }
  if (!isVarValue(value)) {
    throw new SigilError(`Invalid --var ${name} value: ${VAR_VALUE_RULE}`);
  }
  return { name, value };
}

/** Parses repeatable `NAME=value` flags; throws {@link SigilError} on a malformed one. */
export function parseVarFlags(raw: readonly string[]): VarValues {
  const entries = new Map<string, string>();
  for (const flag of raw) {
    const { name, value } = parseVarFlag(flag);
    if (entries.has(name)) {
      throw new SigilError(`--var ${name} was given more than once.`);
    }
    entries.set(name, value);
  }
  return Object.fromEntries(entries);
}
