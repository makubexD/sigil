/**
 * The four correctness rails every editorial-pass proposal must clear before it's written to
 * disk — split out of fix-editorial.ts to stay under the file-length cap. A failed rail returns
 * a reason string; fix-editorial.ts turns that into a `rejected` EditorialResult and drops the
 * edit entirely (never a partial write).
 *
 * @module
 */
import matter from 'gray-matter';
import { getSchema } from '../../../schema/index';
import { renderArtifact } from '../../../targets/emit';
import { deriveContracts, checkOutputContract } from '../../../targets/output-contract';
import { ALL_PROVIDER_SPECS } from '../../../targets/all-emit-specs';
import type { ResolvedArtifact } from '../../../types';
import { applyFrontmatterPatch, splitFrontmatterBlock } from './frontmatter-patch';
import type { EditorialTask } from './types';

/** Frontmatter keys no editorial task may ever change, regardless of `ownedFields`. */
const IDENTITY_FIELDS: readonly string[] = [
  'id',
  'kind',
  'name',
  'language',
  'uses',
  'extends',
  'platforms',
  'deprecated',
];

/** Every frontmatter key whose value differs between `before` and `after` (deep, order-insensitive). */
function changedFrontmatterKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function findDisownedKey(
  changedKeys: readonly string[],
  ownedFields: readonly string[],
): string | undefined {
  return changedKeys.find(key => IDENTITY_FIELDS.includes(key) || !ownedFields.includes(key));
}

/** Rail 4: only `ownedFields` changed, and no identity field was touched. */
export function passesOwnershipRail(
  task: EditorialTask,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  bodyChanged: boolean,
): string | undefined {
  const changedKeys = changedFrontmatterKeys(before, after);
  const disowned = findDisownedKey(changedKeys, task.ownedFields);
  if (disowned && IDENTITY_FIELDS.includes(disowned)) {
    return `proposal touched identity field '${disowned}'`;
  }
  if (disowned) return `proposal touched '${disowned}', which this task does not own`;
  if (bodyChanged && !task.ownedFields.includes('body')) {
    return 'proposal changed body, which this task does not own';
  }
  return undefined;
}

export interface ParsedCandidate {
  readonly ok: true;
  readonly content: string;
}
export interface UnparsedCandidate {
  readonly ok: false;
  readonly reason: string;
}

/**
 * Rail 1: the candidate file re-parses as valid frontmatter + body.
 *
 * Builds the write-ready content from the ORIGINAL raw file plus only the patch — byte-preserving
 * every untouched frontmatter line (see frontmatter-patch.ts's header for why: a full
 * parse-and-reserialize silently strips intentional quoting from fields the proposal never
 * touched). `frontmatterPatch` is undefined for a body-only proposal.
 */
export function tryParseCandidate(
  originalRaw: string,
  frontmatterPatch: Record<string, unknown> | undefined,
  bodyAfter: string,
): ParsedCandidate | UnparsedCandidate {
  const { frontmatterLines } = splitFrontmatterBlock(originalRaw);
  const newFrontmatter = frontmatterPatch
    ? applyFrontmatterPatch(frontmatterLines, frontmatterPatch)
    : frontmatterLines;
  const content = `---\n${newFrontmatter.join('\n')}\n---\n\n${bodyAfter.trim()}\n`;
  try {
    const parsed = matter(content);
    if (typeof parsed.data !== 'object' || parsed.data === null) {
      return { ok: false, reason: 're-parsed frontmatter is not an object' };
    }
    return { ok: true, content };
  } catch (e) {
    return { ok: false, reason: `re-parse failed: ${(e as Error).message}` };
  }
}

/** Rail 2: the candidate frontmatter passes the artifact kind's zod schema. */
export function passesSchemaRail(
  task: EditorialTask,
  frontmatter: Record<string, unknown>,
): string | undefined {
  const result = getSchema(task.kind).safeParse(frontmatter);
  if (result.success) return undefined;
  return `schema validation failed: ${result.error.issues.map(i => i.message).join('; ')}`;
}

function checkOneSpecContract(
  candidate: ResolvedArtifact,
  spec: (typeof ALL_PROVIDER_SPECS)[number],
): string | undefined {
  const outputPath = spec.spec.outputPath(candidate, {});
  const rendered = renderArtifact(spec.spec, candidate, {});
  const violations = checkOutputContract({ [outputPath]: rendered }, deriveContracts([spec.spec]));
  if (violations.length === 0) return undefined;
  return `output contract failed for ${spec.source}: ${violations.map(v => v.problem).join('; ')}`;
}

/** Rail 3: every provider spec for this kind accepts the rendered candidate output. */
export function passesOutputContractRail(
  task: EditorialTask,
  frontmatter: Record<string, unknown>,
  body: string,
): string | undefined {
  const candidate: ResolvedArtifact = {
    id: task.artifactId,
    kind: task.kind,
    filePath: task.filePath,
    frontmatter,
    body,
    resolvedBody: body,
  };
  const specs = ALL_PROVIDER_SPECS.filter(s => s.spec.kind === task.kind);
  for (const spec of specs) {
    const failure = checkOneSpecContract(candidate, spec);
    if (failure) return failure;
  }
  return undefined;
}
