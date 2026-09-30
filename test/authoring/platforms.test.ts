/**
 * Tests for src/authoring/platforms.ts — platform coverage helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { artifactTargetsPlatform } from '../../dist-cli/select/index';
import {
  effectivePlatforms,
  isFullCoverage,
  normalizePlatforms,
  addPlatforms,
  removePlatforms,
} from '../../dist-cli/authoring/platforms';
import { getAllTargets } from '../../dist-cli/targets';

describe('E1 — artifactTargetsPlatform helper', () => {
  it('absent platforms → always true', () => {
    const a = { frontmatter: {} };
    assert.equal(artifactTargetsPlatform(a, 'claude'), true);
  });

  it('empty platforms array → true', () => {
    const a = { frontmatter: { platforms: [] } };
    assert.equal(artifactTargetsPlatform(a, 'copilot'), true);
  });

  it('platforms match → true', () => {
    const a = { frontmatter: { platforms: ['claude'] } };
    assert.equal(artifactTargetsPlatform(a, 'claude'), true);
  });

  it('platforms mismatch → false', () => {
    const a = { frontmatter: { platforms: ['claude'] } };
    assert.equal(artifactTargetsPlatform(a, 'copilot'), false);
  });
});

describe('E2 — platforms math', () => {
  it('effectivePlatforms: absent → all supporting targets', () => {
    const targets = getAllTargets();
    const result = effectivePlatforms('skill', undefined, targets);
    assert.ok(result.includes('claude'), 'claude in effective platforms');
    assert.ok(result.includes('copilot'), 'copilot in effective platforms');
  });

  it('effectivePlatforms: restricted → subset', () => {
    const targets = getAllTargets();
    const result = effectivePlatforms('skill', ['claude'], targets);
    assert.deepEqual(result, ['claude']);
  });

  it('isFullCoverage: full set → true', () => {
    const targets = getAllTargets();
    const allNames = targets.map(t => t.name);
    assert.equal(isFullCoverage('skill', allNames, targets), true);
  });

  it('normalizePlatforms: full set → undefined', () => {
    const targets = getAllTargets();
    const allNames = targets.map(t => t.name);
    assert.equal(normalizePlatforms('skill', allNames, targets), undefined);
  });

  it('addPlatforms: add already covered → noOp=true', () => {
    const targets = getAllTargets();
    const result = addPlatforms('skill', ['claude', 'copilot'], ['claude'], targets);
    assert.equal(result.noOp, true, 'adding an already-covered platform is a noOp');
  });

  it('removePlatforms: remove all → errors not empty', () => {
    const targets = getAllTargets();
    const result = removePlatforms('skill', ['claude'], ['claude'], targets);
    assert.ok(result.errors.length > 0, 'removing the last platform should produce an error');
    assert.ok(
      result.errors[0]!.includes('Cannot remove all') || result.errors[0]!.includes('no platform'),
      `error message should mention platform removal constraint — got: ${result.errors[0]}`,
    );
  });
});
