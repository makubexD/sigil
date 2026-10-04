/**
 * `parsePacksConfig` is the one way packs.yaml is read. A pack's name becomes an output directory
 * (`dist/claude/plugins/<name>`) and a validator argument, so it must be the same safe kebab-case
 * shape artifact names are.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePacksConfig } from '../dist-cli/packs-config';
import { PACKS } from './helpers/install-scenario';

const pack = (name: string) =>
  `packs:\n  - name: "${name}"\n    displayName: P\n    description: A pack.\n    languages: [csharp]\n`;

describe('parsePacksConfig', () => {
  it('should parse the bundled packs.yaml', () => {
    const config = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS);
    assert.ok(config.packs.length > 0);
  });

  it('should accept a kebab-case pack name', () => {
    assert.equal(
      parsePacksConfig(pack('dotnet-starter'), 'packs.yaml').packs[0]?.name,
      'dotnet-starter',
    );
  });

  it('should reject a pack name that is not a safe kebab-case name', () => {
    for (const name of ['x&calc', '../up', 'Has Space', 'UPPER']) {
      assert.throws(() => parsePacksConfig(pack(name), 'packs.yaml'), /packs\.yaml/, name);
    }
  });

  it('should reject a file without a packs list', () => {
    assert.throws(() => parsePacksConfig('name: x\n', 'packs.yaml'), /packs/);
  });
});
