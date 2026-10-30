/**
 * `parsePacksConfig` is the one way packs.yaml is read. A pack's name becomes an output directory
 * (`dist/claude/plugins/<name>`) and a validator argument, so it must be the same safe kebab-case
 * shape artifact names are.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePacksConfig } from '../dist-cli/packs-config';
import { SigilError } from '../dist-cli/errors';
import { PACKS } from './helpers/install-scenario';

const pack = (name: string) =>
  `packs:\n  - name: "${name}"\n    displayName: P\n    description: A pack.\n    languages: [csharp]\n`;

/** A packs file with one pack and a top-level marketplace block made of `lines` (unindented). */
const marketplaceConfig = (lines: string[]): string =>
  `${pack('dotnet-starter')}\nmarketplace:\n${lines.map(l => `  ${l}`).join('\n')}\n`;

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

  it('should parse the bundled packs.yaml with no marketplace block', () => {
    const config = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS);
    assert.equal(config.marketplace, undefined);
  });

  it('should parse a marketplace block and round-trip its fields', () => {
    const raw = marketplaceConfig(['name: acme-ai', 'owner:', '  name: Acme']);
    const config = parsePacksConfig(raw, 'packs.yaml');
    assert.equal(config.marketplace?.name, 'acme-ai');
    assert.deepEqual(config.marketplace?.owner, { name: 'Acme' });
  });

  it('should reject an invalid marketplace block, naming the source file', () => {
    const source = '/tmp/fork/packs.yaml';
    const cases: Array<[string, string]> = [
      ["name: 'acme ai'", 'a name with a space'],
      ["name: '-acme'", 'a name starting with a dash'],
      ["name: 'a..b'", 'a name containing ..'],
      ["name: acme-ai\nowner: { name: '' }", 'an empty owner.name'],
      ['name: acme-ai', 'a block without owner'],
    ];
    for (const [body, label] of cases) {
      assert.throws(
        () => parsePacksConfig(marketplaceConfig(body.split('\n')), source),
        (err: unknown) => err instanceof SigilError && err.message.includes(source),
        label,
      );
    }
  });
});
