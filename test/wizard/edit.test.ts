/**
 * Tests for src/wizard/edit.ts — runEditWizard.
 *
 * Uses the same require.cache mutation pattern as wizard/add.test.ts.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
// Pre-load wizard so @clack/prompts ends up in require.cache before beforeEach runs.
import '../../dist-cli/wizard';
import type { Artifact } from '../../dist-cli/types';

describe('runEditWizard', () => {
  let clackMod: { exports: Record<string, unknown> };

  beforeEach(() => {
    const clackKey = require.resolve('@clack/prompts');
    clackMod = require.cache[clackKey] as { exports: Record<string, unknown> };
  });

  function mockClack(queue: Array<string | boolean>): () => void {
    const ex = clackMod.exports;
    const orig = { ...ex };
    const pop = () => {
      if (queue.length === 0) throw new Error('clack mock: queue exhausted');
      return queue.shift()!;
    };
    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    ex['text'] = async (_opts: unknown) => pop();
    ex['confirm'] = async (_opts: unknown) => pop();
    ex['select'] = async (_opts: unknown) => pop();
    return () => {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    };
  }

  const FAKE_ARTIFACT: Artifact = {
    id: 'shared/clean-code',
    kind: 'rule',
    filePath: '/catalog/shared/rules/clean-code.rule.md',
    frontmatter: {
      id: 'shared/clean-code',
      kind: 'rule',
      title: 'Clean Code',
      description: 'A clean code style guide.',
      tags: ['style', 'quality'],
    } as Record<string, unknown>,
    body: '## Guidelines\n',
  };

  it('happy path: user accepts all prefilled values and confirms — returns result', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    // Steps: title (prefilled) → description (prefilled) → tags → confirm
    const restore = mockClack([
      'Clean Code',            // title (keep current)
      'A clean code style guide.', // description (keep current)
      'style, quality',        // tags (keep current)
      true,                    // confirm save
    ]);
    try {
      const result = await runEditWizard(FAKE_ARTIFACT);
      assert.ok(result !== null, 'should return a result when user confirms');
      assert.equal(result!.title, 'Clean Code');
      assert.equal(result!.description, 'A clean code style guide.');
      assert.deepEqual(result!.tags, ['style', 'quality']);
    } finally {
      restore();
    }
  });

  it('user changes title and description, confirms — returns updated result', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'Updated Clean Code',               // new title
      'Revised description for the rule.', // new description
      'style',                             // tags (trimmed comma list)
      true,                                // confirm
    ]);
    try {
      const result = await runEditWizard(FAKE_ARTIFACT);
      assert.ok(result !== null);
      assert.equal(result!.title, 'Updated Clean Code');
      assert.equal(result!.description, 'Revised description for the rule.');
      assert.deepEqual(result!.tags, ['style']);
    } finally {
      restore();
    }
  });

  it('user leaves tags blank — returns empty tags array', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'Clean Code',             // title
      'A clean code style guide.', // description
      '  ',                     // blank tags input → empty array
      true,                     // confirm
    ]);
    try {
      const result = await runEditWizard(FAKE_ARTIFACT);
      assert.ok(result !== null);
      assert.deepEqual(result!.tags, [], 'blank tags input → empty array');
    } finally {
      restore();
    }
  });

  it('user declines the confirm prompt — returns null', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const restore = mockClack([
      'Clean Code',
      'A clean code style guide.',
      'style, quality',
      false, // confirm = false → cancel
    ]);
    try {
      const result = await runEditWizard(FAKE_ARTIFACT);
      assert.equal(result, null, 'declining confirm returns null');
    } finally {
      restore();
    }
  });

  it('isCancel on title prompt — returns null', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const ex = clackMod.exports;
    const orig = { ...ex };

    const CANCEL_SYMBOL = Symbol.for('clack.cancel');
    const cancelObj = { [CANCEL_SYMBOL]: true };

    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = (v: unknown) => v !== null && typeof v === 'object' && CANCEL_SYMBOL in (v as object);
    ex['text'] = async () => cancelObj;
    ex['confirm'] = async () => true;

    try {
      const result = await runEditWizard(FAKE_ARTIFACT);
      assert.equal(result, null, 'cancel on title prompt returns null');
    } finally {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    }
  });

  it('prefills title from current frontmatter value', async () => {
    const { runEditWizard } = require('../../dist-cli/wizard') as typeof import('../../dist-cli/wizard');
    const ex = clackMod.exports;
    const orig = { ...ex };

    let capturedTitleOpts: { initialValue?: string } | undefined;
    let callIdx = 0;

    ex['intro'] = () => {};
    ex['outro'] = () => {};
    ex['note'] = () => {};
    ex['cancel'] = () => {};
    ex['log'] = { info: () => {}, warn: () => {}, error: () => {} };
    ex['isCancel'] = () => false;
    ex['text'] = async (opts: { initialValue?: string }) => {
      callIdx++;
      if (callIdx === 1) capturedTitleOpts = opts; // first text() is title
      return opts.initialValue ?? '';
    };
    ex['confirm'] = async () => true;

    try {
      await runEditWizard(FAKE_ARTIFACT);
    } finally {
      for (const k of Object.keys(orig)) ex[k] = orig[k];
    }

    assert.ok(capturedTitleOpts !== undefined, 'title text() was called');
    assert.equal(
      capturedTitleOpts!.initialValue,
      FAKE_ARTIFACT.frontmatter.title as string,
      'title prompt is prefilled with current frontmatter title',
    );
  });
});
