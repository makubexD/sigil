/**
 * Output-conformance checker for emitted FileMap content.
 *
 * After compile() or scaffold() produces a FileMap, call checkOutputContract() to
 * verify that every emitted file matches its destination artifact type's contract:
 *   - required frontmatter keys are present
 *   - forbidden frontmatter keys are absent (cross-contamination guard)
 *   - body patterns that must not appear (e.g. unresolved {{…}} or foreign ${input:…})
 *
 * Contracts are declared on each Target via Target.outputContracts — the
 * platform adapter is the authority on what each artifact type requires.
 *
 * Files that match no contract entry are skipped silently (non-breaking for
 * aggregate files like AGENTS.md or marketplace.json that have no fixed shape,
 * and for plugin-build paths that are structurally different from scaffold paths).
 */
import matter from 'gray-matter';
import type { FileMap, ContractEntry, OutputViolation } from '../types';
import type { KindEmitSpec } from './spec-types';

/**
 * Derives ContractEntry[] from one or more KindEmitSpecs — the emitter↔contract duplication this
 * removes: previously `contracts.ts` was a hand-written parallel restatement of the same
 * required/forbidden keys `plugin-build.ts`/`build-helpers.ts` already encoded imperatively, and
 * the two had already drifted (contracts.ts covered only scaffold paths; compile/plugin paths had
 * no contract at all). A KindEmitSpec is now read by BOTH the renderer (emit.ts) and this
 * function, so a spec change updates emission and verification together.
 *
 * `requiredKeys` = every FieldMapping with `required: true`'s `to`. `forbiddenKeys`/`bodyForbids`
 * pass through from the spec. `match` is the spec's own `pathPattern` (see spec-types.ts for why
 * that can't be derived from `outputPath`, which is a function of a specific artifact).
 */
export function deriveContracts(specs: readonly KindEmitSpec[]): ContractEntry[] {
  return specs.map(spec => ({
    match: spec.pathPattern,
    label: spec.variant ? `${spec.kind} (${spec.variant})` : spec.kind,
    contract: {
      requiredKeys: spec.frontmatter.filter(m => m.required).map(m => m.to),
      forbiddenKeys: [...spec.forbiddenKeys],
      bodyForbids: [...spec.bodyForbids],
    },
  }));
}

/** Parses frontmatter safely — gray-matter handles files with and without `---`. */
function safeParseFrontmatter(content: string): { keys: string[]; body: string } {
  try {
    const parsed = matter(content);
    return { keys: Object.keys(parsed.data), body: parsed.content };
  } catch {
    // Unparseable frontmatter: skip key checks, still run body checks
    return { keys: [], body: content };
  }
}

/** Checks required frontmatter keys are present for one file against its contract. */
function checkRequiredKeys(
  filePath: string,
  label: string,
  contract: ContractEntry['contract'],
  keys: string[],
): OutputViolation[] {
  return (contract.requiredKeys ?? [])
    .filter(key => !keys.includes(key))
    .map(key => ({ file: filePath, label, problem: `missing required frontmatter key: '${key}'` }));
}

/** Checks forbidden frontmatter keys are absent for one file against its contract (cross-contamination guard). */
function checkForbiddenKeys(
  filePath: string,
  label: string,
  contract: ContractEntry['contract'],
  keys: string[],
): OutputViolation[] {
  return (contract.forbiddenKeys ?? [])
    .filter(key => keys.includes(key))
    .map(key => ({
      file: filePath,
      label,
      problem: `forbidden frontmatter key present: '${key}'`,
    }));
}

/** Checks one file's body against its contract's forbidden body patterns. */
function checkBodyForbids(
  filePath: string,
  label: string,
  contract: ContractEntry['contract'],
  body: string,
): OutputViolation[] {
  return (contract.bodyForbids ?? [])
    .filter(({ pattern }) => pattern.test(body))
    .map(({ reason }) => ({ file: filePath, label, problem: reason }));
}

/** Checks one file's frontmatter/body against its matched contract entry. */
function checkOneFile(filePath: string, content: string, entry: ContractEntry): OutputViolation[] {
  const { label, contract } = entry;
  const { keys, body } = safeParseFrontmatter(content);

  return [
    ...checkRequiredKeys(filePath, label, contract, keys),
    ...checkForbiddenKeys(filePath, label, contract, keys),
    ...checkBodyForbids(filePath, label, contract, body),
  ];
}

/**
 * Check every file in `files` against the first matching entry in `contracts`.
 * Returns an array of violations (empty array = all contracts satisfied).
 */
export function checkOutputContract(files: FileMap, contracts: ContractEntry[]): OutputViolation[] {
  const violations: OutputViolation[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const entry = contracts.find(e => e.match.test(filePath));
    if (!entry) continue;
    violations.push(...checkOneFile(filePath, content, entry));
  }

  return violations;
}
