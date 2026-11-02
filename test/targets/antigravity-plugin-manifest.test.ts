/**
 * Antigravity plugin manifest (`plugin.json`): the closed decision-7 key set, the author fallback
 * chain, and the pre-publish reserved-name check.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { antigravityPluginJson } from '../../dist-cli/targets/antigravity/plugin-manifest';
import { SigilError } from '../../dist-cli/errors';

const SCHEMA = 'https://antigravity.google/schemas/v1/plugin.json';
const DEFAULT_HOMEPAGE = 'https://github.com/makubexD/sigil#readme';
const KEY_ORDER = [
  '$schema',
  'name',
  'displayName',
  'version',
  'description',
  'author',
  'homepage',
  'license',
  'keywords',
];

const PACK = { name: 'essentials', displayName: 'Essentials', description: 'D' };

/** The 20 property names of `https://antigravity.google/schemas/v1/plugin.json`. */
const ALLOWED_KEYS = new Set([
  '$schema',
  'name',
  'displayName',
  'display_name',
  'description',
  'version',
  'disabled',
  'logo',
  'suggestedPrompts',
  'suggested_prompts',
  'skills',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
  'source',
  'sourcePath',
  'source_path',
]);

describe('antigravityPluginJson', () => {
  it('writes the exact sigil manifest with keys in order and no identity', () => {
    const json = antigravityPluginJson(PACK, { version: '1.2.3' });
    assert.ok(json.endsWith('\n'));
    const manifest = JSON.parse(json);
    assert.deepEqual(manifest, {
      $schema: SCHEMA,
      name: 'essentials',
      displayName: 'Essentials',
      version: '1.2.3',
      description: 'D',
      author: { name: 'Sigil', url: DEFAULT_HOMEPAGE },
      homepage: DEFAULT_HOMEPAGE,
      license: 'MIT',
      keywords: [],
    });
    assert.deepEqual(Object.keys(manifest), KEY_ORDER);
    assert.deepEqual(manifest.keywords, []);
  });

  it('takes keywords from the pack languages and the homepage override', () => {
    const manifest = JSON.parse(
      antigravityPluginJson(
        { ...PACK, languages: ['python'] },
        { version: '1.0.0', homepage: 'https://x.test' },
      ),
    );
    assert.deepEqual(manifest.keywords, ['python']);
    assert.equal(manifest.author.url, 'https://x.test');
    assert.equal(manifest.homepage, 'https://x.test');
  });

  it('uses the identity author, homepage and license', () => {
    const manifest = JSON.parse(
      antigravityPluginJson(PACK, {
        version: '2.0.0',
        marketplace: {
          name: 'm',
          owner: { name: 'O', url: 'https://o.test' },
          author: { name: 'A', email: 'a@x.test' },
          homepage: 'https://h.test',
          license: 'Apache-2.0',
        },
      }),
    );
    assert.deepEqual(manifest.author, { name: 'A', url: 'https://h.test', email: 'a@x.test' });
    assert.equal(manifest.homepage, 'https://h.test');
    assert.equal(manifest.license, 'Apache-2.0');
  });

  it('falls back to the owner and omits unset homepage and license', () => {
    const manifest = JSON.parse(
      antigravityPluginJson(PACK, {
        version: '3.0.0',
        marketplace: { name: 'm', owner: { name: 'O' } },
      }),
    );
    assert.deepEqual(manifest.author, { name: 'O' });
    assert.equal('homepage' in manifest, false);
    assert.equal('license' in manifest, false);
  });

  it('writes only keys the published schema allows', () => {
    const outputs = [
      antigravityPluginJson(PACK, { version: '1.2.3' }),
      antigravityPluginJson(PACK, {
        version: '1.2.3',
        marketplace: {
          name: 'm',
          owner: { name: 'O', url: 'https://o.test' },
          author: { name: 'A', email: 'a@x.test' },
          homepage: 'https://h.test',
          license: 'Apache-2.0',
        },
      }),
    ];
    for (const json of outputs) {
      for (const key of Object.keys(JSON.parse(json))) {
        assert.ok(ALLOWED_KEYS.has(key), `unexpected manifest key: ${key}`);
      }
    }
  });

  it('refuses pack names with a reserved prefix', () => {
    assert.throws(
      () => antigravityPluginJson({ ...PACK, name: 'claude-tools' }, { version: '1.0.0' }),
      (error: unknown) => error instanceof SigilError && error.message.includes('claude-tools'),
    );
    assert.throws(
      () => antigravityPluginJson({ ...PACK, name: 'gemini' }, { version: '1.0.0' }),
      SigilError,
    );
    assert.doesNotThrow(() =>
      antigravityPluginJson({ ...PACK, name: 'tools-claude' }, { version: '1.0.0' }),
    );
  });
});
