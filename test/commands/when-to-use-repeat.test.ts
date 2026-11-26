/**
 * `when-to-use-quality` also flags a `whenToUse` sentence that repeats a `description` sentence:
 * a tool that lists both fields shows it twice.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { repeatedSentence } from '../../dist-cli/commands/sync/conformance/rules/when-to-use-quality';

describe('when-to-use-quality: repeated sentence', () => {
  const description =
    'Write tests for a Python project. Covers fixtures, mocking, and async tests.';

  it('should report a whenToUse sentence that is also a description sentence', () => {
    const whenToUse = 'Use when adding tests. Covers fixtures, mocking and async tests.';

    assert.equal(
      repeatedSentence(description, whenToUse),
      'covers fixtures mocking and async tests',
    );
  });

  it('should pass a whenToUse that shares words but no whole sentence', () => {
    const whenToUse = 'Use when adding fixtures or mocking in async tests, e.g. "write tests".';

    assert.equal(repeatedSentence(description, whenToUse), undefined);
  });

  it('should ignore a repeated sentence shorter than four words', () => {
    assert.equal(
      repeatedSentence('Read only. Reviews a diff.', 'Read only. Use on a diff.'),
      undefined,
    );
  });
});
