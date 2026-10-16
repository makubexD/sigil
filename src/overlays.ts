/**
 * Consumer overlays (spike, docs/decisions/consumer-overlays-2026-10.md): a project narrows where an
 * installed rule applies, without forking the catalog. `.sigil/overlays.yaml` in the consumer
 * project maps a rule id to directory prefixes:
 *
 *     rules:
 *       typescript/ts-code-quality:
 *         scope: [src, packages/api]
 *
 * Each catalog glob `G` becomes `<prefix>/G` for every prefix. Every catalog `appliesTo` glob starts
 * with `**​/`, so `<literal prefix>/**​/T` matches a subset of `**​/T` by construction: the check is
 * on the prefix (literal segments, no glob syntax, no `..`, relative), never on the file system.
 * A catalog glob without the `**​/` lead is refused, so the subset guarantee never rests on luck.
 *
 * Applied to a copy of the resolved catalog before any target renders, so it is target-neutral
 * and the drift hash is taken on the overlaid file. Never read through `PKG_ROOT`.
 *
 * @module
 */
import path from 'node:path';
import yaml from 'js-yaml';
import { readRegularFile } from './safe-read';
import { SigilError } from './errors';
import type { ResolvedCatalog } from './types';

export const OVERLAYS_FILE = path.join('.sigil', 'overlays.yaml');

const MAX_BYTES = 64 * 1024;
const GLOB_SYNTAX = /[*?[\]{}!]/;

/** Rule id → directory prefixes it is narrowed to. */
export type Overlays = ReadonlyMap<string, readonly string[]>;

/** Why `prefix` cannot narrow a scope, or undefined when it can. */
export function prefixProblem(prefix: string): string | undefined {
  if (GLOB_SYNTAX.test(prefix)) return 'has glob syntax; name a directory';
  if (path.posix.isAbsolute(prefix) || /^[A-Za-z]:/.test(prefix)) return 'is absolute';
  const segments = prefix.split('/');
  if (segments.some(s => s === '' || s === '.' || s === '..'))
    return 'is not a plain relative path';
  return undefined;
}

/** `prefixes × globs`; throws when a glob lacks the `**​/` lead the subset guarantee needs. */
export function narrowGlobs(id: string, globs: readonly string[], prefixes: readonly string[]) {
  const unsafe = globs.find(g => !g.startsWith('**/'));
  if (unsafe)
    throw new SigilError(`overlay for ${id}: catalog glob '${unsafe}' cannot be narrowed`);
  return prefixes.flatMap(p => globs.map(g => `${p}/${g}`));
}

/** Parses the overlay file's text; throws a SigilError naming the first invalid entry. */
export function parseOverlays(text: string): Overlays {
  const data = yaml.load(text) as { rules?: Record<string, { scope?: unknown }> } | null;
  const result = new Map<string, readonly string[]>();
  for (const [id, entry] of Object.entries(data?.rules ?? {})) {
    const scope = entry?.scope;
    if (!Array.isArray(scope) || scope.length === 0 || !scope.every(s => typeof s === 'string')) {
      throw new SigilError(`${OVERLAYS_FILE}: ${id}.scope must be a non-empty list of directories`);
    }
    for (const prefix of scope as string[]) {
      const problem = prefixProblem(prefix);
      if (problem) throw new SigilError(`${OVERLAYS_FILE}: ${id} scope '${prefix}' ${problem}`);
    }
    result.set(id, scope as string[]);
  }
  return result;
}

/** The project's overlays, or an empty map when it has no overlay file. */
export function loadOverlays(projectDir: string): Overlays {
  const read = readRegularFile(path.join(projectDir, OVERLAYS_FILE), { maxBytes: MAX_BYTES });
  return 'content' in read ? parseOverlays(read.content) : new Map();
}

/** A copy of `resolved` with each overlaid rule's `appliesTo` narrowed; the input is unchanged. */
export function withOverlays(resolved: ResolvedCatalog, overlays: Overlays): ResolvedCatalog {
  if (overlays.size === 0) return resolved;
  const artifacts = resolved.artifacts.map(artifact => {
    const prefixes = overlays.get(artifact.id);
    if (!prefixes) return artifact;
    if (artifact.kind !== 'rule') {
      throw new SigilError(`overlay for ${artifact.id}: only rules can be narrowed`);
    }
    const globs = (artifact.frontmatter.appliesTo as string[] | undefined) ?? [];
    const appliesTo = narrowGlobs(artifact.id, globs, prefixes);
    return { ...artifact, frontmatter: { ...artifact.frontmatter, appliesTo } };
  });
  for (const id of overlays.keys()) {
    if (!resolved.byId.has(id)) throw new SigilError(`overlay for ${id}: no such catalog rule`);
  }
  return { ...resolved, artifacts, byId: new Map(artifacts.map(a => [a.id, a])) };
}
