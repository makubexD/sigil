/**
 * `sigil release [level]` command — bump version, rebuild, update CHANGELOG, commit + tag.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * Static import replaces the inline `await import('@clack/prompts')`.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { confirm, isCancel } from '../wizard/prompts';
import { bumpVersion, promoteChangelog } from '../release';
import { isInteractiveTTY } from '../wizard';
import { pkg, PKG_ROOT } from '../cli-helpers';
import { SigilError } from '../errors';
import { JSON_INDENT } from '../json-util';

/** Length of an ISO date string in the format 'YYYY-MM-DD'. */
const ISO_DATE_LEN = 10;

export interface ReleaseOptions {
  dryRun: boolean;
  /** Commander inverts --no-verify → opts.verify = false when --no-verify is passed. */
  verify: boolean;
  yes: boolean;
}

/** Throws unless the git working tree is clean. */
function assertCleanWorkingTree(): void {
  let status: string;
  try {
    status = execSync('git status --porcelain', { encoding: 'utf-8' });
  } catch (e) {
    throw new SigilError('git status failed — is this a git repo?', { cause: e });
  }
  if (status.trim()) {
    throw new SigilError('Working tree is not clean. Commit or stash changes first.', {
      hint: status,
    });
  }
}

/** Warns (does not throw) when the current branch is not master/main. */
function warnIfNotMainBranch(): void {
  let branch: string;
  try {
    branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  } catch {
    branch = '(unknown)';
  }
  if (branch !== 'master' && branch !== 'main') {
    console.warn(`  ⚠  Current branch is '${branch}', not master/main — are you sure?`);
  }
}

/** Aborts unless the git working tree is clean; warns if not on master/main. */
function runPreflightChecks(): void {
  assertCleanWorkingTree();
  warnIfNotMainBranch();
}

/** Prints the `--dry-run` preview of every step the real release would perform. */
function printDryRunPreview(nextVersion: string, doVerify: boolean): void {
  console.log('\n  [dry-run] Would perform:');
  console.log(`    • Write package.json version: ${nextVersion}`);
  console.log(`    • Write package-lock.json version: ${nextVersion}`);
  if (doVerify) {
    console.log(
      '    • Run: npm run build && npm run validate && npm test && npm run catalog:build',
    );
  }
  console.log('    • Promote CHANGELOG.md [Unreleased] → ' + `[${nextVersion}] - <today>`);
  console.log(`    • git commit -m "release: v${nextVersion}"`);
  console.log(`    • git tag v${nextVersion}`);
  console.log('\n  Dry run complete. No files were written.');
}

/** Writes the bumped version into package.json + package-lock.json. Returns their paths. */
function writeVersionFiles(nextVersion: string): { pkgPath: string; lockPath: string } {
  const pkgPath = path.resolve(PKG_ROOT, 'package.json');
  const lockPath = path.resolve(PKG_ROOT, 'package-lock.json');

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  pkgJson['version'] = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, JSON_INDENT) + '\n', 'utf-8');
  console.log(`  ✓ package.json → ${nextVersion}`);

  if (fs.existsSync(lockPath)) {
    const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
    lockJson['version'] = nextVersion;
    // Also update the root packages[""].version entry if present
    const packages = lockJson['packages'] as Record<string, Record<string, unknown>> | undefined;
    if (packages && packages['']) {
      packages['']['version'] = nextVersion;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lockJson, null, JSON_INDENT) + '\n', 'utf-8');
    console.log(`  ✓ package-lock.json → ${nextVersion}`);
  }

  return { pkgPath, lockPath };
}

/** Runs the build/validate/test/catalog:build gate, aborting with a SigilError on failure. */
function runVerifyGate(): void {
  const gate = ['npm run build', 'npm run validate', 'npm test', 'npm run catalog:build'];
  for (const cmd of gate) {
    process.stdout.write(`  running: ${cmd} … `);
    try {
      execSync(cmd, { stdio: 'pipe', cwd: PKG_ROOT });
      process.stdout.write('✓\n');
    } catch (e: unknown) {
      process.stdout.write('✗\n');
      const stderr = (e as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(e);
      throw new SigilError(`Gate failed at: ${cmd}`, {
        hint: `${stderr}\n  Restore: git checkout package.json package-lock.json`,
        cause: e,
      });
    }
  }
}

/** Promotes CHANGELOG.md's [Unreleased] section to the new version; warns on any failure. */
function promoteChangelogFile(nextVersion: string): string {
  const changelogPath = path.resolve(PKG_ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    console.warn('  ⚠  CHANGELOG.md not found — skipping changelog promotion.');
    return changelogPath;
  }

  const changelogText = fs.readFileSync(changelogPath, 'utf-8');
  const today = new Date().toISOString().slice(0, ISO_DATE_LEN);
  try {
    const promoted = promoteChangelog(changelogText, nextVersion, today);
    fs.writeFileSync(changelogPath, promoted, 'utf-8');
    console.log(`  ✓ CHANGELOG.md → [${nextVersion}] - ${today}`);
  } catch (e: unknown) {
    console.warn(`  ⚠  CHANGELOG.md update skipped: ${(e as Error).message}`);
  }
  return changelogPath;
}

/** Stages the changed files, commits, and tags the release. */
function commitAndTag(nextVersion: string, lockPath: string, changelogPath: string): void {
  const filesToAdd = ['package.json'];
  if (fs.existsSync(lockPath)) filesToAdd.push('package-lock.json');
  if (fs.existsSync(changelogPath)) filesToAdd.push('CHANGELOG.md');

  try {
    // Use execFileSync + arg arrays (not execSync with a shell string) to prevent
    // shell-injection if filesToAdd paths or nextVersion contain special characters.
    execFileSync('git', ['add', ...filesToAdd], { cwd: PKG_ROOT, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', `release: v${nextVersion}`], {
      cwd: PKG_ROOT,
      stdio: 'pipe',
    });
    execFileSync('git', ['tag', `v${nextVersion}`], { cwd: PKG_ROOT, stdio: 'pipe' });
    console.log(`  ✓ git commit + tag v${nextVersion}`);
  } catch (e: unknown) {
    throw new SigilError('git commit/tag failed:', {
      hint: (e as { stderr?: Buffer }).stderr?.toString() ?? String(e),
      cause: e,
    });
  }
}

/** Prints the final "ready locally" summary + next-step push instructions. */
function printReleaseSummary(nextVersion: string): void {
  console.log(`\n✓ Release v${nextVersion} is ready locally.\n`);
  console.log('Next: push the commit and the tag to trigger CI publish:');
  console.log(`\n  git push && git push --tags\n`);
  console.log('This triggers release.yml → npm publish --provenance via OIDC Trusted Publishing.');
}

/** Computes the bumped version, wrapping any error as a SigilError. */
function computeNextVersion(currentVersion: string, releaseLevel: string): string {
  try {
    return bumpVersion(currentVersion, releaseLevel);
  } catch (e: unknown) {
    throw new SigilError((e as Error).message, { cause: e });
  }
}

/** Prompts to confirm the release (interactive mode only). Returns false if cancelled. */
async function confirmReleaseInteractively(
  interactive: boolean,
  nextVersion: string,
): Promise<boolean> {
  if (!interactive) return true;
  const ok = await confirm({ message: `Proceed with release v${nextVersion}?` });
  if (isCancel(ok) || !ok) {
    console.log('  Release cancelled.');
    return false;
  }
  return true;
}

export async function runRelease(level: string | undefined, opts: ReleaseOptions): Promise<void> {
  const releaseLevel = level ?? 'patch';
  const dry = !!opts.dryRun;
  const doVerify = !!opts.verify;
  const yes = !!opts.yes;
  const interactive = isInteractiveTTY() && !yes;

  const nextVersion = computeNextVersion(pkg.version, releaseLevel);
  console.log(`\nRelease: ${pkg.version} → ${nextVersion}`);

  if (!dry) {
    runPreflightChecks();
  }

  if (dry) {
    printDryRunPreview(nextVersion, doVerify);
    return;
  }

  const proceed = await confirmReleaseInteractively(interactive, nextVersion);
  if (!proceed) return;

  finalizeRelease(nextVersion, doVerify);
}

/** Steps 4-8: write version files, verify gate, promote changelog, commit+tag, summary. */
function finalizeRelease(nextVersion: string, doVerify: boolean): void {
  // ── 4. Write new version to package.json + package-lock.json ───────────────
  const { lockPath } = writeVersionFiles(nextVersion);

  // ── 5. Verify gate ─────────────────────────────────────────────────────────
  if (doVerify) {
    runVerifyGate();
  }

  // ── 6. Promote CHANGELOG ───────────────────────────────────────────────────
  const changelogPath = promoteChangelogFile(nextVersion);

  // ── 7. Commit + tag ────────────────────────────────────────────────────────
  commitAndTag(nextVersion, lockPath, changelogPath);

  // ── 8. Summary ─────────────────────────────────────────────────────────────
  printReleaseSummary(nextVersion);
}
