/**
 * Tests for src/errors.ts — suggestIds and notFoundError.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { suggestIds, notFoundError } from '../dist-cli/errors';

const IDS: readonly string[] = [
  'shared/clean-code',
  'shared/protect-config',
  'csharp/cs-conventions',
  'typescript/ts-conventions',
  'shared/filler-a',
  'shared/filler-b',
  'shared/filler-c',
  'shared/filler-d',
  'shared/filler-e',
  'shared/filler-f',
  'shared/filler-g',
  'shared/filler-h',
  'shared/filler-i',
  'shared/filler-j',
];

describe('suggestIds', () => {
  it('suggests the close match for a typo', () => {
    assert.equal(suggestIds('shared/protect-confg', IDS)[0], 'shared/protect-config');
  });

  it('suggests the same name under another namespace', () => {
    assert.equal(suggestIds('typescript/clean-code', IDS)[0], 'shared/clean-code');
  });

  it('returns no suggestions when nothing is close', () => {
    assert.deepEqual(suggestIds('zzz/nothing-like-it', IDS), []);
  });

  it('caps suggestions at 5', () => {
    assert.equal(suggestIds('shared/filler', IDS).length, 5);
  });

  it('matches case-insensitively and returns the original id', () => {
    assert.equal(suggestIds('SHARED/PROTECT-CONFIG', IDS)[0], 'shared/protect-config');
  });

  it('does not suggest a short name merely contained in the query', () => {
    assert.deepEqual(suggestIds('shared/shadow-guard', [...IDS, 'shared/ado']), []);
  });
});

describe('notFoundError', () => {
  it('lists suggestions in the message and a browse hint', () => {
    const err = notFoundError('Artifact', 'shared/protect-confg', IDS);
    assert.match(err.message, /Did you mean: shared\/protect-config/);
    assert.ok(!err.message.includes('Available:'), 'no full id dump');
    assert.ok(!err.message.includes('shared/filler-a'), 'no filler ids dumped');
    assert.ok(err.hint?.includes('sigil list'), 'hint mentions sigil list');
    assert.ok(err.hint?.includes('sigil search'), 'hint mentions sigil search');
  });

  it('omits suggestions when nothing is close', () => {
    const err = notFoundError('Artifact', 'zzz/nothing-like-it', IDS);
    assert.equal(err.message, "Artifact 'zzz/nothing-like-it' not found.");
  });
});
