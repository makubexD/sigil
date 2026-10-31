/**
 * Discover importable artifact files in a Copilot `.github/` layout.
 *
 * Recognises:
 *   instructions/<name>.instructions.md → kind: rule
 *   agents/<name>.agent.md              → kind: agent
 *   prompts/<name>.prompt.md            → kind: prompt
 *   skills/<name>/SKILL.md              → kind: skill
 *
 * Frontmatter is read with `yamlFirst` (real YAML, never gray-matter) and normalised by
 * copilot-fields.ts / copilot-body.ts. Anything that can't be imported safely is reported in
 * `unrecognised` with a reason, never guessed at.
 */
import fs from 'fs';
import path from 'path';
import type { Dirent } from 'fs';
import { normPath } from '../../paths';
import { SigilError } from '../../errors';
import { reverseLexicon } from '../../targets/lexicon';
import { parseMarkdown, SourceFileRejected } from './parse-markdown';
import { discoverOrReport, discoverSkillsDir } from './discover';
import { GITHUB_DIR, README_MD, dedupeDiscovered, rootFileReports } from './discover-copilot-root';
import { copilotLexicon, normalizeCopilotBody } from './copilot-body';
import * as copilotFields from './copilot-fields';
import type { ClassifyResult, DiscoveredFile, DiscoverResult, UnrecognisedFile } from './discover';
import type { NormalizedBody } from './copilot-body';

/** A flat Copilot kind directory: its name, file suffix and artifact kind. */
interface FlatSpec {
  dir: string;
  suffix: string;
  kind: 'rule' | 'agent' | 'prompt';
}

const FLAT_SPECS: FlatSpec[] = [
  { dir: 'instructions', suffix: '.instructions.md', kind: 'rule' },
  { dir: 'agents', suffix: '.agent.md', kind: 'agent' },
  { dir: 'prompts', suffix: '.prompt.md', kind: 'prompt' },
];

const EMPTY_SLUG_MESSAGE = 'no usable name in the file name';
const EMPTY_SLUG_REASON = `not imported: ${EMPTY_SLUG_MESSAGE}`;
const LINK_REASON = 'not imported: a symbolic link, which import does not follow';
const UNCLOSED_FRONTMATTER = 'the frontmatter block is not closed, so its fields cannot be read';

// ─── Root resolution ──────────────────────────────────────────────────────────

/** True when `target` exists and is a directory (a broken link or missing path is false). */
function isDirectory(target: string): boolean {
  return fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** True when `target` is itself a symbolic link. */
function isLink(target: string): boolean {
  return fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

/** The `.github` directory for a project root, or the directory itself when it is `.github`. */
export function resolveCopilotRoot(absSourceDir: string): string {
  const nested = path.join(absSourceDir, GITHUB_DIR);
  if (isLink(nested)) throw new SigilError(`${nested} is a symbolic link; import won't follow it.`);
  if (isDirectory(nested)) return nested;
  if (path.basename(absSourceDir) === GITHUB_DIR) return absSourceDir;
  throw new SigilError(`No .github/ folder in ${absSourceDir}`);
}

// ─── Shared assembly ──────────────────────────────────────────────────────────

/** Add the fields a normalised body carried to the frontmatter keys the translators read. */
function withBodyFields(
  kind: DiscoveredFile['kind'],
  fm: Record<string, unknown>,
  body: NormalizedBody,
): Record<string, unknown> {
  const frontmatter = { ...fm };
  if (kind === 'prompt' && body.args !== undefined) frontmatter.args = body.args;
  if (kind === 'skill' && body.whenToUse !== undefined) frontmatter.when_to_use = body.whenToUse;
  if (kind === 'skill' && body.argumentHint !== undefined) {
    frontmatter['argument-hint'] = body.argumentHint;
  }
  return frontmatter;
}

/** Finishes a discovered file with its normalised body, body-carried fields and notes. */
function finishFile(base: DiscoveredFile, body: NormalizedBody, notes: string[]): DiscoveredFile {
  return {
    ...base,
    frontmatter: withBodyFields(base.kind, base.frontmatter, body),
    body: body.body,
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(notes.length === 0 ? {} : { notes }),
  };
}

/** The note for a file name that changed beyond the namespace strip, or nothing. */
function renameNotes(stem: string, slug: string, namespace?: string): string[] {
  const prefix = namespace === undefined ? '' : `${namespace}-`;
  const stripped = stem.startsWith(prefix) ? stem.slice(prefix.length) : stem;
  return stripped === slug ? [] : [`file name normalised: ${stem} → ${slug}`];
}

// ─── Flat kind directories ────────────────────────────────────────────────────

/** One flat-directory entry plus the context its classifier needs. */
type FlatContext = { dir: string; spec: FlatSpec; namespace: string };

/** The source fields normalised by kind; a prompt's frontmatter passes through untouched. */
function flatFields(kind: FlatSpec['kind'], fm: Record<string, unknown>, slug: string) {
  if (kind === 'rule') return copilotFields.normalizeRuleFields(fm);
  if (kind === 'agent') return copilotFields.normalizeAgentFields(fm, slug);
  return { frontmatter: fm, notes: [] as string[] };
}

/** The namespace a stem may carry: agents have none in their file name, rules and prompts do. */
function stemNamespace(ctx: FlatContext): string | undefined {
  return ctx.spec.kind === 'agent' ? undefined : ctx.namespace;
}

/**
 * True when a file opens a frontmatter block that never closes. Its fields stay unread, and an
 * agent whose `tools` went unread would be imported with every tool.
 */
function hasUnclosedFrontmatter(parsed: ReturnType<typeof parseMarkdown>): boolean {
  return Object.keys(parsed.frontmatter).length === 0 && parsed.body.startsWith('---');
}

/** Builds one flat-kind file: parse, normalise fields and body, collect notes. */
function buildFlatFile(entry: Dirent, ctx: FlatContext, relativePath: string): DiscoveredFile {
  const stem = entry.name.slice(0, -ctx.spec.suffix.length);
  const slug = copilotFields.copilotSlug(stem, stemNamespace(ctx));
  if (slug === '') throw new SourceFileRejected(EMPTY_SLUG_MESSAGE);
  const sourcePath = path.join(ctx.dir, entry.name);
  const parsed = parseMarkdown(sourcePath, { yamlFirst: true });
  if (hasUnclosedFrontmatter(parsed)) throw new SourceFileRejected(UNCLOSED_FRONTMATTER);
  const fields = flatFields(ctx.spec.kind, parsed.frontmatter, slug);
  if (fields.refused !== undefined) throw new SourceFileRejected(fields.refused);
  const body = normalizeCopilotBody(ctx.spec.kind, parsed.body);
  const notes = [...fields.notes, ...body.notes, ...renameNotes(stem, slug, stemNamespace(ctx))];
  const base = {
    sourcePath,
    relativePath,
    kind: ctx.spec.kind,
    slug,
    frontmatter: fields.frontmatter,
  };
  return finishFile({ ...base, body: parsed.body }, body, notes);
}

/** Classifies one entry in a flat kind directory. */
function classifyFlatEntry(entry: Dirent, ctx: FlatContext): ClassifyResult {
  const relativePath = normPath(path.join(ctx.spec.dir, entry.name));
  if (entry.name === README_MD) return {};
  if (!entry.isFile() || !entry.name.endsWith(ctx.spec.suffix)) {
    const reason = `Expected ${ctx.spec.dir}/*${ctx.spec.suffix}`;
    return { unrecognised: { relativePath, reason } };
  }
  return discoverOrReport(relativePath, () => buildFlatFile(entry, ctx, relativePath));
}

/** A kind directory that is a link: reported, and nothing under it is read. */
function linkedDir(relativePath: string): DiscoverResult {
  return { discovered: [], unrecognised: [{ relativePath, reason: LINK_REASON }] };
}

/** Discovers one flat kind directory — one suffixed markdown file per artifact. */
function discoverFlatDir(githubDir: string, spec: FlatSpec, namespace: string): DiscoverResult {
  const dir = path.join(githubDir, spec.dir);
  const discovered: DiscoveredFile[] = [];
  const unrecognised: UnrecognisedFile[] = [];
  if (isLink(dir)) return linkedDir(spec.dir);
  if (!isDirectory(dir)) return { discovered, unrecognised };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const result = classifyFlatEntry(entry, { dir, spec, namespace });
    if (result.discovered) discovered.push(result.discovered);
    if (result.unrecognised) unrecognised.push(result.unrecognised);
  }
  return { discovered, unrecognised };
}

// ─── Skills ───────────────────────────────────────────────────────────────────

/** A skill's references, their Copilot lexicon values reversed back to catalog tokens. */
function reverseReferences(refs: DiscoveredFile['references']) {
  if (refs === undefined) return {};
  const lexicon = copilotLexicon();
  const content = refs.map(ref => ({ ...ref, content: reverseLexicon(ref.content, lexicon) }));
  return { references: content };
}

/** Normalises one discovered Copilot skill and records its notes. */
function transformSkill(file: DiscoveredFile): ClassifyResult {
  const relativePath = normPath(file.relativePath);
  const slug = copilotFields.copilotSlug(file.slug);
  if (slug === '') return { unrecognised: { relativePath, reason: EMPTY_SLUG_REASON } };
  const fields = copilotFields.normalizeSkillFields(file.frontmatter, slug);
  const body = normalizeCopilotBody('skill', file.body);
  const notes = [...fields.notes, ...body.notes, ...renameNotes(file.slug, slug)];
  const base = { ...file, relativePath, slug, frontmatter: fields.frontmatter };
  return {
    discovered: { ...finishFile(base, body, notes), ...reverseReferences(file.references) },
  };
}

/** Normalises every skill, carrying its unrecognised entries over with normalised paths. */
function transformSkillDir(result: DiscoverResult): DiscoverResult {
  const discovered: DiscoveredFile[] = [];
  const unrecognised = result.unrecognised.map(entry => ({
    ...entry,
    relativePath: normPath(entry.relativePath),
  }));
  for (const file of result.discovered) {
    const transformed = transformSkill(file);
    if (transformed.discovered) discovered.push(transformed.discovered);
    if (transformed.unrecognised) unrecognised.push(transformed.unrecognised);
  }
  return { discovered, unrecognised };
}

/**
 * Discover and normalise every importable artifact in a Copilot `.github/` directory.
 *
 * @param githubDir  Absolute path to the `.github` directory (see resolveCopilotRoot).
 * @param namespace  Catalog language (or "shared") whose prefix file names may carry.
 */
export function discoverCopilotFiles(githubDir: string, namespace: string): DiscoverResult {
  const flat = FLAT_SPECS.map(spec => discoverFlatDir(githubDir, spec, namespace));
  const skills = isLink(path.join(githubDir, 'skills'))
    ? linkedDir('skills')
    : transformSkillDir(discoverSkillsDir(githubDir, { yamlFirst: true }));
  const sections = [...flat, skills];
  const deduped = dedupeDiscovered(sections.flatMap(section => section.discovered));
  return {
    discovered: deduped.discovered,
    unrecognised: [
      ...sections.flatMap(section => section.unrecognised),
      ...deduped.unrecognised,
      ...rootFileReports(githubDir),
    ],
  };
}
