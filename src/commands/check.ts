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

export interface CheckOptions {
  catalogDir: string;
  schemaOnly: boolean;
  trust: boolean;
  strict: boolean;
}

export async function runCheck(files: string[], opts: CheckOptions): Promise<void> {
  // Load the full catalog for reference-integrity and dup-id checks
  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();

  // Resolve which files to check
  if (files.length === 0) {
    console.error('✗ No files specified. Pass file path(s) as arguments.');
    console.error(
      '  Example: sigil check catalog/languages/csharp/skills/cs-generate-tests/SKILL.md',
    );
    process.exit(1);
  }

  // Expand directories to all artifact files within them
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

  let totalViolations = 0;
  let checkedCount = 0;

  for (const filePath of expandedFiles) {
    // Find this artifact in the loaded catalog (normalize separators for Windows compat)
    const artifact = catalog.artifacts.find(a => normPath(a.filePath) === normPath(filePath));
    if (!artifact) {
      console.warn(`  ⚠  ${filePath}: not found in catalog (not a recognized artifact file?)`);
      continue;
    }

    const violations = checkSourceArtifact(artifact, catalog, targets, {
      schemaOnly: opts.schemaOnly,
    });
    checkedCount++;

    if (violations.length === 0) {
      console.log(`  ✓  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
    } else {
      console.error(`  ✗  ${artifact.id}  (${path.relative(process.cwd(), filePath)})`);
      for (const viol of violations) {
        console.error(`       ${viol.problem}`);
      }
      totalViolations += violations.length;
    }

    // Trust scan (opt-in via --trust)
    if (opts.trust) {
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const scanResult = scanContent(filePath, rawContent);
      if (scanResult.findings.length > 0) {
        const trustLines = formatScanFindings(scanResult);
        for (const line of trustLines) {
          if (scanResult.level === 'error') {
            console.error(line);
          } else {
            console.warn(line);
          }
        }
        if (opts.strict || scanResult.level === 'error') {
          totalViolations += scanResult.findings.length;
        }
      }
    }
  }

  if (checkedCount === 0) {
    console.warn('  ⚠  No artifact files found to check.');
    return;
  }

  console.log(
    `\n${totalViolations === 0 ? '✓' : '✗'} ${checkedCount} artifact(s) checked, ${totalViolations} violation(s) found.`,
  );
  if (totalViolations > 0) process.exit(1);
}
