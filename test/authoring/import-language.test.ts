/**
 * `sigil import --create-language` writes a language.yaml that the catalog standard accepts: every
 * language names its artifact `prefix` and its `stack` (catalog-layout fails `sync --check`
 * otherwise; docs/decisions/family-skeleton-standard-2026-10.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { maybeCreateLanguageYaml } from '../../dist-cli/commands/import-language';
import { withTempDirAsync } from '../helpers/temp-dir';

/** The language.yaml `--create-language` writes for `lang`, parsed. */
async function created(lang: string): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {};
  await withTempDirAsync(async dir => {
    const file = path.join(dir, 'languages', lang, 'language.yaml');
    const log = console.log;
    console.log = () => {};
    try {
      maybeCreateLanguageYaml(lang, file, undefined, lang);
    } finally {
      console.log = log;
    }
    data = yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  });
  return data;
}

describe('import --create-language', () => {
  it("should write a built-in language's prefix and stack", async () => {
    const yamlData = await created('csharp');
    assert.equal(yamlData.prefix, 'cs');
    assert.equal(yamlData.stack, 'dotnet');
  });

  it('should default a new language to its own id for both', async () => {
    const yamlData = await created('go');
    assert.equal(yamlData.prefix, 'go');
    assert.equal(yamlData.stack, 'go');
  });
});
