/**
 * The built CLI stays executable. `npm link` points the `sigil` bin at `dist-cli/cli.js`, and
 * `npm run build` recreates that file, so a build must not leave the link denied.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');

describe('built CLI', () => {
  it('is executable', { skip: process.platform === 'win32' }, () => {
    const anyExecuteBit = 0o111;
    assert.notEqual(fs.statSync(CLI).mode & anyExecuteBit, 0);
  });
});
