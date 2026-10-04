/**
 * The release gate is the CI gate: `npm run ci:local` runs in `sigil release` and in release.yml
 * before `npm publish`, so a release can never pass a narrower check than a pull request. The
 * Claude Code CLI the plugin validator uses is pinned once, in package.json, and both workflows
 * install that version.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RELEASE_GATE } from '../dist-cli/commands/release';

const ROOT = path.resolve(__dirname, '..');
const workflow = (name: string) =>
  fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  config?: { claudeCodeVersion?: string };
};
const INSTALL_FROM_CONFIG =
  /npm install --global "@anthropic-ai\/claude-code@\$\(node -p "require\('\.\/package\.json'\)\.config\.claudeCodeVersion"\)"/;

describe('release and CI workflows', () => {
  it('should gate sigil release on the full CI mirror', () => {
    assert.deepEqual(RELEASE_GATE, ['npm run ci:local']);
  });

  it('should run the full CI mirror in release.yml before publishing', () => {
    const release = workflow('release.yml');
    const gate = release.indexOf('npm run ci:local');
    const publish = release.indexOf('npm publish --provenance');
    assert.ok(gate > 0 && publish > gate, 'ci:local must run before npm publish');
  });

  it('should pin the Claude Code CLI once, in package.json, for both workflows', () => {
    assert.match(pkg.config?.claudeCodeVersion ?? '', /^\d+\.\d+\.\d+$/);
    for (const name of ['ci.yml', 'release.yml']) {
      assert.match(workflow(name), INSTALL_FROM_CONFIG, name);
    }
  });

  it('should pin every third-party action to a full commit SHA', () => {
    for (const name of ['ci.yml', 'release.yml']) {
      const uses = [...workflow(name).matchAll(/uses:\s*(\S+)/g)].map(m => m[1]!);
      for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref}`);
    }
  });
});
