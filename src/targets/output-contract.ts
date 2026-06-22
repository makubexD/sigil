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

/**
 * Check every file in `files` against the first matching entry in `contracts`.
 * Returns an array of violations (empty array = all contracts satisfied).
 */
export function checkOutputContract(
  files: FileMap,
  contracts: ContractEntry[],
): OutputViolation[] {
  const violations: OutputViolation[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    const entry = contracts.find(e => e.match.test(filePath));
    if (!entry) continue;

    const { label, contract } = entry;

    // Parse frontmatter safely — gray-matter handles files with and without ---
    let frontmatterKeys: string[] = [];
    let body = content;
    try {
      const parsed = matter(content);
      frontmatterKeys = Object.keys(parsed.data);
      body = parsed.content;
    } catch {
      // Unparseable frontmatter: skip key checks, still run body checks
    }

    // Required keys
    for (const key of contract.requiredKeys ?? []) {
      if (!frontmatterKeys.includes(key)) {
        violations.push({
          file: filePath,
          label,
          problem: `missing required frontmatter key: '${key}'`,
        });
      }
    }

    // Forbidden keys (cross-contamination guard)
    for (const key of contract.forbiddenKeys ?? []) {
      if (frontmatterKeys.includes(key)) {
        violations.push({
          file: filePath,
          label,
          problem: `forbidden frontmatter key present: '${key}'`,
        });
      }
    }

    // Body pattern checks
    for (const { pattern, reason } of contract.bodyForbids ?? []) {
      if (pattern.test(body)) {
        violations.push({ file: filePath, label, problem: reason });
      }
    }
  }

  return violations;
}
