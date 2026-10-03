/**
 * `sigil check [files...]` command — validate catalog source artifact files.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * Fixes the inline `require('fs')` that was present in the original handler.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { checkSourceArtifact } from '../authoring/check-source';
import { scanContent, formatScanFindings } from '../trust/scan';
import { normPath } from '../paths';
import { SigilError } from '../errors';
import type { Artifact, LoadedCatalog, Target } from '../types';

export interface CheckOptions {
  catalogDir: string;
  schemaOnly: boolean;
  trust: boolean;
  strict: boolean;
}

/** Expands directory arguments to every artifact file path within them; leaves files as-is. */
function expandFilesToCheck(
  files: string[],
  catalog: { artifacts: { filePath: string }[] },
): string[] {
  const expandedFiles: string[] = [];
  for (const f of files) {
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      const resolvedDir = normPath(path.resolve(f));
      const found = catalog.artifacts
        .filter(a => normPath(a.filePath).startsWith(resolvedDir))
        .map(a => a.filePath);
      expandedFiles.push(...found);
    } else {
      expandedFiles.push(path.resolve(f));
    }
  }
  return expandedFiles;
}

/** Runs the opt-in trust scan over one piece of content; returns the violation count to add. */
function runTrustScan(label: string, content: string, opts: CheckOptions): number {
  const scanResult = scanContent(label, content);
  if (scanResult.findings.length === 0) return 0;

  const trustLines = formatScanFindings(scanResult);
  for (const line of trustLines) {
    if (scanResult.level === 'error') {
      console.error(line);
    } else {
      console.warn(line);
    }
  }
  return opts.strict || scanResult.level === 'error' ? scanResult.findings.length : 0;
}

interface FileCheckResult {
  /** True when the file was matched to a catalog artifact and actually checked. */
  checked: boolean;
  violationCount: number;
}

/** Prints the ✓/✗ line for one checked artifact, plus each violation's problem text. */
function printFileCheckResult(
  artifact: { id: string },
  filePath: string,
  violations: { problem: string }[],
): void {
  if (violations.length === 0) {
    console.log(`  ✓  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
    return;
  }
  console.error(`  ✗  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
  for (const viol of violations) {
    console.error(`       ${viol.problem}`);
  }
}

/** Checks one resolved file path: source validation + optional trust scan. */
function checkOneFile(
  filePath: string,
  catalog: LoadedCatalog,
  targets: Target[],
  opts: CheckOptions,
): FileCheckResult {
  const artifact = catalog.artifacts.find(a => normPath(a.filePath) === normPath(filePath));
  if (!artifact) {
    console.warn(`  ⚠  ${filePath}: not found in catalog (not a recognized artifact file?)`);
    return { checked: false, violationCount: 0 };
  }

  const violations = checkSourceArtifact(artifact, catalog, targets, {
    schemaOnly: opts.schemaOnly,
  });
  printFileCheckResult(artifact, filePath, violations);
  const violationCount = violations.length + (opts.trust ? trustScanArtifact(artifact, opts) : 0);
  return { checked: true, violationCount };
}

/**
 * Trust-scans an artifact's own file and, for a skill, every reference file it ships: references
 * reach the user's project just like SKILL.md does.
 */
function trustScanArtifact(artifact: Artifact, opts: CheckOptions): number {
  const own = runTrustScan(artifact.filePath, fs.readFileSync(artifact.filePath, 'utf-8'), opts);
  const refsDir = path.join(path.dirname(artifact.filePath), 'references');
  return (artifact.references ?? []).reduce(
    (count, ref) => count + runTrustScan(path.join(refsDir, ref.name), ref.content, opts),
    own,
  );
}

/** Throws if no file arguments were passed. */
function assertFilesProvided(files: string[]): void {
  if (files.length === 0) {
    throw new SigilError('No files specified. Pass file path(s) as arguments.', {
      hint: '  Example: sigil check catalog/languages/csharp/skills/cs-generate-tests/SKILL.md',
    });
  }
}

/** Prints the final summary line and throws if any violation was found. */
function finalizeCheckRun(checkedCount: number, totalViolations: number): void {
  console.log(
    `\n${totalViolations === 0 ? '✓' : '✗'} ${checkedCount} artifact(s) checked, ${totalViolations} violation(s) found.`,
  );
  if (totalViolations > 0) {
    throw new SigilError(`${totalViolations} violation(s) found — see above.`);
  }
}

export async function runCheck(files: string[], opts: CheckOptions): Promise<void> {
  assertFilesProvided(files);

  // Load the full catalog for reference-integrity and dup-id checks
  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();
  const expandedFiles = expandFilesToCheck(files, catalog);

  let totalViolations = 0;
  let checkedCount = 0;

  for (const filePath of expandedFiles) {
    const result = checkOneFile(filePath, catalog, targets, opts);
    if (result.checked) checkedCount++;
    totalViolations += result.violationCount;
  }

  if (checkedCount === 0) {
    console.warn('  ⚠  No artifact files found to check.');
    return;
  }

  finalizeCheckRun(checkedCount, totalViolations);
}
