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
import { confirm, isCancel } from '@clack/prompts';
import { bumpVersion, promoteChangelog } from '../release';
import { isInteractiveTTY } from '../wizard';
import { pkg, PKG_ROOT } from '../cli-helpers';

/** Length of an ISO date string in the format 'YYYY-MM-DD'. */
const ISO_DATE_LEN = 10;

export interface ReleaseOptions {
  dryRun: boolean;
  /** Commander inverts --no-verify → opts.verify = false when --no-verify is passed. */
  verify: boolean;
  yes: boolean;
}

export async function runRelease(level: string | undefined, opts: ReleaseOptions): Promise<void> {
  const releaseLevel = level ?? 'patch';
  const dry = !!opts.dryRun;
  const doVerify = !!opts.verify;
  const yes = !!opts.yes;
  const interactive = isInteractiveTTY() && !yes;

  // ── 1. Compute next version ─────────────────────────────────────────────────
  let nextVersion: string;
  try {
    nextVersion = bumpVersion(pkg.version, releaseLevel);
  } catch (e: unknown) {
    console.error(`  ✗  ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`\nRelease: ${pkg.version} → ${nextVersion}`);

  // ── 2. Preflight (skip in dry-run) ─────────────────────────────────────────
  if (!dry) {
    let status: string;
    try {
      status = execSync('git status --porcelain', { encoding: 'utf-8' });
    } catch {
      console.error('  ✗  git status failed — is this a git repo?');
      process.exit(1);
    }
    if (status.trim()) {
      console.error('  ✗  Working tree is not clean. Commit or stash changes first.');
      console.error(status);
      process.exit(1);
    }

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

  // ── 3. Confirm (interactive mode) ──────────────────────────────────────────
  if (dry) {
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
    return;
  }

  if (interactive) {
    const ok = await confirm({ message: `Proceed with release v${nextVersion}?` });
    if (isCancel(ok) || !ok) {
      console.log('  Release cancelled.');
      return;
    }
  }

  // ── 4. Write new version to package.json + package-lock.json ───────────────
  const pkgPath = path.resolve(PKG_ROOT, 'package.json');
  const lockPath = path.resolve(PKG_ROOT, 'package-lock.json');

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  pkgJson['version'] = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ package.json → ${nextVersion}`);

  if (fs.existsSync(lockPath)) {
    const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
    lockJson['version'] = nextVersion;
    // Also update the root packages[""].version entry if present
    const packages = lockJson['packages'] as Record<string, Record<string, unknown>> | undefined;
    if (packages && packages['']) {
      packages['']['version'] = nextVersion;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lockJson, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ package-lock.json → ${nextVersion}`);
  }

  // ── 5. Verify gate ─────────────────────────────────────────────────────────
  if (doVerify) {
    const gate = ['npm run build', 'npm run validate', 'npm test', 'npm run catalog:build'];
    for (const cmd of gate) {
      process.stdout.write(`  running: ${cmd} … `);
      try {
        execSync(cmd, { stdio: 'pipe', cwd: PKG_ROOT });
        process.stdout.write('✓\n');
      } catch (e: unknown) {
        process.stdout.write('✗\n');
        console.error((e as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? String(e));
        console.error(`\n  ✗  Gate failed at: ${cmd}`);
        console.error('  Restore: git checkout package.json package-lock.json');
        process.exit(1);
      }
    }
  }

  // ── 6. Promote CHANGELOG ───────────────────────────────────────────────────
  const changelogPath = path.resolve(PKG_ROOT, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const changelogText = fs.readFileSync(changelogPath, 'utf-8');
    const today = new Date().toISOString().slice(0, ISO_DATE_LEN);
    try {
      const promoted = promoteChangelog(changelogText, nextVersion, today);
      fs.writeFileSync(changelogPath, promoted, 'utf-8');
      console.log(`  ✓ CHANGELOG.md → [${nextVersion}] - ${today}`);
    } catch (e: unknown) {
      console.warn(`  ⚠  CHANGELOG.md update skipped: ${(e as Error).message}`);
    }
  } else {
    console.warn('  ⚠  CHANGELOG.md not found — skipping changelog promotion.');
  }

  // ── 7. Commit + tag ────────────────────────────────────────────────────────
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
    console.error('  ✗  git commit/tag failed:');
    console.error((e as { stderr?: Buffer }).stderr?.toString() ?? String(e));
    process.exit(1);
  }

  // ── 8. Summary ─────────────────────────────────────────────────────────────
  console.log(`\n✓ Release v${nextVersion} is ready locally.\n`);
  console.log('Next: push the commit and the tag to trigger CI publish:');
  console.log(`\n  git push && git push --tags\n`);
  console.log('This triggers release.yml → npm publish --provenance via OIDC Trusted Publishing.');
}
