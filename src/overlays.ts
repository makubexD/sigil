/**
 * Consumer overlays (docs/decisions/consumer-overlays-2026-10.md): a project narrows where an
 * installed rule applies, without forking the catalog. `.sigil/overlays.yaml` in the consumer
 * project maps a rule id to directory prefixes:
 *
 *     rules:
 *       typescript/ts-code-quality:
 *         scope: [src, packages/api]
 *
 * Each catalog glob `G` becomes `<prefix>/G` for every prefix. When `G` starts with the any-depth
 * segment (`**` then a slash), `<literal prefix>/G` matches a subset of what `G` matches by
 * construction, so the check is on the prefix (literal segments, no glob syntax, no `..`,
 * relative), never on the file system. A catalog glob without that lead refuses the overlay.
 *
 * A bad entry refuses only its own id (`refused`), and the caller skips that artifact: installing
 * it wider than the project asked would be worse than not installing it. Only a file sigil cannot
 * read as a whole fails the command.
 *
 * Applied by `add` and `update` to a copy of the resolved catalog before any target renders, so it
 * is target-neutral and the drift hash is taken on the overlaid file. Read from the project
 * directory, never through `PKG_ROOT`.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { readRegularFile } from './safe-read';
import { SigilError } from './errors';
import type { SelectionResult } from './select';
import type { ResolvedArtifact, ResolvedCatalog } from './types';

/** Relative to the project directory; forward slashes, so messages read the same on every OS. */
export const OVERLAYS_FILE = '.sigil/overlays.yaml';

const KIB = 1024;
const MAX_OVERLAYS_KIB = 64;
const ROOT_KEY = 'rules';
const GLOB_SYNTAX = /[*?[\]{}!]/;
/**
 * One directory name: letters, digits, `. _ - + @`, and single spaces inside it. Nothing a glob,
 * a list separator (Copilot joins globs with `,`) or an escape (`\`) could read as more than a name.
 */
const DIRECTORY_NAME = /^[\p{L}\p{N}._@+-]+(?: [\p{L}\p{N}._@+-]+)*$/u;
const NARROWABLE_LEAD = '**/';

const printWarning = (message: string) => console.warn(`  ⚠  ${message}`);

/** The project's overlays: rule id → directory prefixes, and id → why its entry was refused. */
export interface ProjectOverlays {
  scopes: ReadonlyMap<string, readonly string[]>;
  refused: ReadonlyMap<string, string>;
}

/** A resolved catalog with overlays applied, and the entries it could not apply. */
export interface OverlaidCatalog {
  resolved: ResolvedCatalog;
  /** Rules whose entry was refused: skipped, never installed wider than the project asked. */
  refused: ReadonlyMap<string, string>;
  /** Entries that name no catalog rule: reported, and otherwise change nothing. */
  ignored: ReadonlyMap<string, string>;
}

/** Why `prefix` cannot narrow a scope, or undefined when it can. */
function prefixProblem(prefix: string): string | undefined {
  if (GLOB_SYNTAX.test(prefix)) return 'has glob syntax; name a directory';
  if (path.posix.isAbsolute(prefix) || /^[A-Za-z]:/.test(prefix)) return 'is absolute';
  const segments = prefix.split('/');
  if (segments.some(s => s === '.' || s === '..' || !DIRECTORY_NAME.test(s)))
    return 'is not a plain relative path (names of letters, digits, spaces and . _ - + @, joined by /)';
  return undefined;
}

/** The entry's directories without a trailing slash, or why the entry cannot be applied. */
function entryScope(entry: unknown): { scope: string[] } | { problem: string } {
  const scope = (entry as { scope?: unknown } | null)?.scope;
  if (!Array.isArray(scope) || scope.length === 0 || !scope.every(s => typeof s === 'string'))
    return { problem: 'scope must be a non-empty list of directories' };
  const dirs = (scope as string[]).map(dir => (dir.length > 1 ? dir.replace(/\/+$/, '') : dir));
  for (const [i, dir] of dirs.entries()) {
    const problem = prefixProblem(dir);
    if (problem) return { problem: `scope '${String(scope[i])}' ${problem}` };
  }
  return { scope: dirs };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The YAML in `text`; throws a SigilError naming the file when it does not parse. */
function loadYaml(text: string): unknown {
  try {
    return yaml.load(text);
  } catch (err) {
    throw new SigilError(`${OVERLAYS_FILE}: ${(err as Error).message}`, { cause: err });
  }
}

/** The file's `rules:` mapping; throws when the text is not YAML or not that shape. */
function rulesMapping(text: string): Record<string, unknown> {
  const data = loadYaml(text) ?? {};
  const unknown = isMapping(data) ? Object.keys(data).find(key => key !== ROOT_KEY) : undefined;
  if (unknown !== undefined)
    throw new SigilError(`${OVERLAYS_FILE}: unknown key '${unknown}'; expected '${ROOT_KEY}:'`);
  const rules = isMapping(data) ? (data[ROOT_KEY] ?? {}) : undefined;
  if (!isMapping(rules)) {
    throw new SigilError(
      `${OVERLAYS_FILE}: expected '${ROOT_KEY}:' mapping rule ids to { scope: [...] }`,
    );
  }
  return rules;
}

/** Parses the overlay file's text; throws only when the file as a whole is not a rules mapping. */
export function parseOverlays(text: string): ProjectOverlays {
  const scopes = new Map<string, readonly string[]>();
  const refused = new Map<string, string>();
  for (const [id, entry] of Object.entries(rulesMapping(text))) {
    const result = entryScope(entry);
    if ('problem' in result) refused.set(id, result.problem);
    else scopes.set(id, result.scope);
  }
  return { scopes, refused };
}

/** The project's overlays; none when it has no overlay file, an error when it has one sigil cannot read. */
export function loadOverlays(projectDir: string): ProjectOverlays {
  const file = path.join(projectDir, OVERLAYS_FILE);
  if (!fs.existsSync(file) && !isLink(file)) return { scopes: new Map(), refused: new Map() };
  const read = readRegularFile(file, { maxBytes: MAX_OVERLAYS_KIB * KIB });
  if (!('content' in read)) throw new SigilError(`${OVERLAYS_FILE}: ${read.reason}`);
  return parseOverlays(read.content);
}

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Why `id` cannot take an overlay in `resolved`, or its narrowed globs. */
function narrow(
  resolved: ResolvedCatalog,
  id: string,
  prefixes: readonly string[],
): { globs: string[] } | { problem: string } {
  const artifact = resolved.byId.get(id);
  if (!artifact) return { problem: 'no such catalog rule' };
  if (artifact.kind !== 'rule')
    return { problem: `is a ${artifact.kind}; only rules can be narrowed` };
  const globs = (artifact.frontmatter.appliesTo as string[] | undefined) ?? [];
  const wide = globs.find(g => !g.startsWith(NARROWABLE_LEAD));
  if (wide || globs.length === 0)
    return { problem: `catalog glob '${wide ?? '(none)'}' cannot be narrowed` };
  return { globs: prefixes.flatMap(p => globs.map(g => `${p}/${g}`)) };
}

/** Each overlaid rule's narrowed globs; every other entry refused (a rule) or ignored (no rule). */
function narrowAll(resolved: ResolvedCatalog, overlays: ProjectOverlays) {
  const narrowed = new Map<string, string[]>();
  const refused = new Map<string, string>();
  const ignored = new Map<string, string>();
  const reject = (id: string, reason: string) =>
    (resolved.byId.get(id)?.kind === 'rule' ? refused : ignored).set(id, reason);
  for (const [id, reason] of overlays.refused) reject(id, reason);
  for (const [id, prefixes] of overlays.scopes) {
    const result = narrow(resolved, id, prefixes);
    if ('problem' in result) reject(id, result.problem);
    else narrowed.set(id, result.globs);
  }
  return { narrowed, refused, ignored };
}

/** `artifact` with the rules it loads (`uses:`) pointing at their overlaid copies, refused ones dropped. */
function rewire(
  artifact: ResolvedArtifact,
  rules: ReadonlyMap<string, ResolvedArtifact>,
  refused: ReadonlyMap<string, string>,
): ResolvedArtifact {
  if (!artifact.resolvedRules) return artifact;
  const resolvedRules = artifact.resolvedRules
    .filter(rule => !refused.has(rule.id))
    .map(rule => rules.get(rule.id) ?? rule);
  return { ...artifact, resolvedRules };
}

/** Each narrowed rule as an overlaid copy of its catalog artifact, by id. */
function narrowedRules(
  resolved: ResolvedCatalog,
  narrowed: ReadonlyMap<string, string[]>,
): Map<string, ResolvedArtifact> {
  const rules = new Map<string, ResolvedArtifact>();
  for (const [id, appliesTo] of narrowed) {
    const rule = resolved.byId.get(id);
    if (rule) rules.set(id, { ...rule, frontmatter: { ...rule.frontmatter, appliesTo } });
  }
  return rules;
}

/**
 * A copy of `resolved` with each overlaid rule's `appliesTo` narrowed, everywhere it is reached: by
 * id and through every skill that loads it, which is how `add` installs a dependency. A refused
 * rule is dropped from those skills, so it is never installed as a dependency either. The input is
 * unchanged.
 */
export function withOverlays(
  resolved: ResolvedCatalog,
  overlays: ProjectOverlays,
): OverlaidCatalog {
  const { narrowed, refused, ignored } = narrowAll(resolved, overlays);
  if (narrowed.size === 0 && refused.size === 0) return { resolved, refused, ignored };
  const rules = narrowedRules(resolved, narrowed);
  const artifacts = resolved.artifacts.map(a => rewire(rules.get(a.id) ?? a, rules, refused));
  const byId = new Map(artifacts.map(a => [a.id, a]));
  return { resolved: { ...resolved, artifacts, byId }, refused, ignored };
}

/**
 * The project's overlays applied to `resolved`, each entry it could not apply reported once
 * through `warn`: an ignored one changes nothing, a refused rule is not installed or updated.
 */
export function applyProjectOverlays(
  resolved: ResolvedCatalog,
  projectDir: string,
  warn: (message: string) => void = printWarning,
): OverlaidCatalog {
  const overlaid = withOverlays(resolved, loadOverlays(projectDir));
  for (const [id, reason] of overlaid.ignored) warn(`${OVERLAYS_FILE}: ${id}: ${reason}; ignored`);
  for (const [id, reason] of overlaid.refused) {
    warn(
      `${OVERLAYS_FILE}: ${id}: ${reason}; this rule is not installed or updated until it is fixed`,
    );
  }
  return overlaid;
}

/**
 * `entries` without those whose overlay was refused, each reported through `warn`: an installed
 * artifact is left as it is rather than re-rendered wider than the project asked.
 */
export function withoutRefused<T extends { id: string }>(
  entries: T[],
  refused: ReadonlyMap<string, string>,
  warn: (message: string) => void = printWarning,
): T[] {
  return entries.filter(entry => {
    const reason = refused.get(entry.id);
    if (reason !== undefined) warn(`${entry.id} left as installed: ${refusedReason(reason)}`);
    return reason === undefined;
  });
}

/**
 * `selection` with every id whose overlay was refused moved to `skipped` (cause `overlay`). `sigil
 * add` and the add wizard's preview both call it, so the plan shown is the plan installed.
 */
export function skipRefused(
  selection: SelectionResult,
  refused: ReadonlyMap<string, string> | undefined,
  catalog: ResolvedCatalog,
): SelectionResult {
  if (!refused?.size) return selection;
  const skipped = selection.ids
    .filter(id => refused.has(id))
    .map(id => ({
      id,
      kind: catalog.byId.get(id)?.kind ?? 'rule',
      reason: refusedReason(refused.get(id) ?? ''),
      cause: 'overlay' as const,
    }));
  return {
    ids: selection.ids.filter(id => !refused.has(id)),
    skipped: [...selection.skipped, ...skipped],
  };
}

/** Why an artifact whose overlay was refused is skipped. */
function refusedReason(reason: string): string {
  return `${OVERLAYS_FILE} entry refused: ${reason}`;
}
