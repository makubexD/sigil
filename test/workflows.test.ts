/**
 * The release gate is the CI gate: `npm run ci:local` runs in `sigil release` and in release.yml
 * before `npm publish`, so a release can never pass a narrower check than a pull request. The
 * Claude Code CLI the plugin validator uses is pinned once, in package.json, and both workflows
 * install that version. The marketplace publish step is the shared entry point
 * `scripts/publish-branch.sh`, which publishes one orphan branch at a time.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RELEASE_GATE } from '../dist-cli/commands/release';

const ROOT = path.resolve(__dirname, '..');
const workflow = (name: string) =>
  fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
const PUBLISH_SCRIPT = path.join(ROOT, 'scripts', 'publish-branch.sh');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  config?: { claudeCodeVersion?: string };
};
const INSTALL_FROM_CONFIG =
  /npm install --global "@anthropic-ai\/claude-code@\$\(node -p "require\('\.\/package\.json'\)\.config\.claudeCodeVersion"\)"/;

// Each job runs from its two-space header to the next one (or the end of the file).
const jobBlock = (release: string, name: string): string => {
  const jobs = [...release.matchAll(/^ {2}([a-z-]+):\s*$/gm)];
  const i = jobs.findIndex(job => job[1] === name);
  assert.ok(i >= 0, `release.yml must declare the ${name} job`);
  const from = jobs[i]!.index! + jobs[i]![0].length;
  const to = jobs[i + 1]?.index ?? release.length;
  return release.slice(from, to);
};

describe('release and CI workflows', () => {
  it('should gate sigil release on the full CI mirror', () => {
    assert.deepEqual(RELEASE_GATE, ['npm run ci:local']);
  });

  it('should run the full CI mirror in release.yml before publishing', () => {
    const release = workflow('release.yml');
    // The step itself (`run: npm run ci:local`), not a comment that mentions it.
    const gate = release.search(/^\s*run:\s*npm run ci:local\s*$/m);
    const publish = release.search(/^\s*run:\s*npm publish --provenance/m);
    assert.ok(gate > 0 && publish > gate, 'ci:local must run before npm publish');
  });

  it('should skip npm publish unless the NPM_PUBLISH repository variable is true', () => {
    const release = workflow('release.yml');

    assert.match(jobBlock(release, 'publish'), /^\s{4}if:\s*vars\.NPM_PUBLISH == 'true'\s*$/m);
    // The marketplace ships regardless: it never waits on the npm publish job.
    assert.doesNotMatch(jobBlock(release, 'marketplace'), /NPM_PUBLISH/);
  });

  it('should publish the marketplace branch through the shared publish script', () => {
    const release = workflow('release.yml');
    assert.match(
      jobBlock(release, 'marketplace'),
      /bash scripts\/publish-branch\.sh marketplace marketplace-/,
    );
  });

  it('should publish the skills branch through the shared publish script', () => {
    const release = workflow('release.yml');
    const skills = jobBlock(release, 'skills');
    assert.match(skills, /^\s{4}needs:\s*gate\s*$/m);
    assert.match(skills, /contents:\s*write/);
    assert.match(skills, /bash scripts\/publish-branch\.sh skills skills-/);
    // The skills branch ships regardless: it never waits on the npm publish job.
    assert.doesNotMatch(skills, /NPM_PUBLISH/);
  });

  it('should push atomically and only from the newest release tag', () => {
    const script = fs.readFileSync(PUBLISH_SCRIPT, 'utf8');
    assert.match(script, /git push --atomic/);
    assert.match(script, /versionsort/);
  });

  it('should exit 2 when the publish script gets no arguments', () => {
    const result = spawnSync('bash', [PUBLISH_SCRIPT]);
    assert.equal(result.status, 2);
  });

  it('should pin the Claude Code CLI once, in package.json, for both workflows', () => {
    assert.match(pkg.config?.claudeCodeVersion ?? '', /^\d+\.\d+\.\d+$/);
    for (const name of ['ci.yml', 'release.yml']) {
      assert.match(workflow(name), INSTALL_FROM_CONFIG, name);
    }
  });

  it('should drift-check both published branches through one matrix', () => {
    const drift = workflow('marketplace-drift.yml');

    assert.match(drift, /^\s+fail-fast: false\s*$/m);
    const matrix = drift.slice(drift.indexOf('matrix:'));
    const entries = matrix.split(/^\s*- branch:\s*/m).slice(1);
    const entry = (branch: string): string | undefined =>
      entries.find(candidate => candidate.split('\n', 1)[0]!.trim() === branch);
    const marketplace = entry('marketplace');
    const skills = entry('skills');
    assert.ok(marketplace, 'the matrix must include the marketplace branch');
    assert.ok(skills, 'the matrix must include the skills branch');

    assert.match(marketplace, /^\s+tag_prefix: marketplace-\s*$/m);

    assert.match(skills, /^\s+tag_prefix: skills-\s*$/m);
    assert.match(skills, /^\s+target_args: ['"]?--target agents-standard['"]?\s*$/m);
  });

  it('should compare each branch through the drift script with its target arguments', () => {
    const drift = workflow('marketplace-drift.yml');
    assert.match(drift, /^\s+TARGET_ARGS: \$\{\{ matrix\.target_args \}\}\s*$/m);
    assert.match(
      drift,
      /node scripts\/check-marketplace-drift\.cjs \$TARGET_ARGS "\$RUNNER_TEMP\/branch"/,
    );
  });

  it('should never inline a matrix value in a run block', () => {
    const drift = workflow('marketplace-drift.yml');
    // Matrix values reach a script only through `env:`, never by interpolation in `run:`.
    const matrixLines = drift.split('\n').filter(line => line.includes('${{ matrix.'));
    assert.ok(matrixLines.length >= 2, 'the matrix values must be passed through env');
    for (const line of matrixLines) {
      assert.match(line, /^\s+[A-Z_]+:\s*\$\{\{ matrix\./, line);
    }
  });

  it('should still run the drift gate after a Release run', () => {
    const drift = workflow('marketplace-drift.yml');
    assert.match(drift, /^\s+workflow_run:\s*$/m);
    assert.match(drift, /^\s+workflows: \[Release\]\s*$/m);
  });

  it('should pin every third-party action to a full commit SHA', () => {
    for (const name of ['ci.yml', 'release.yml', 'marketplace-drift.yml']) {
      const uses = [...workflow(name).matchAll(/uses:\s*(\S+)/g)].map(m => m[1]!);
      for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref}`);
    }
  });
});
