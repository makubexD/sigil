/**
 * The artifact-proposal issue form (`.github/ISSUE_TEMPLATE/propose-artifact.yml`) and its chooser
 * config (`config.yml`) are the no-clone entry point for catalog ideas. They are read by GitHub, not
 * by sigil, so nothing else in CI notices a broken field, a missing label or a bad URL.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ALL_KINDS } from '../dist-cli/kinds';
import { CATALOG_DIR } from './helpers/catalog';

/** Directory holding the issue templates, next to the catalog at the repo root. */
const TEMPLATE_DIR = path.join(path.dirname(CATALOG_DIR), '.github', 'ISSUE_TEMPLATE');

interface FormItem {
  type: string;
  id?: string;
  attributes?: { label?: string; options?: string[]; [key: string]: unknown };
  validations?: { required?: boolean };
}

interface FormDoc {
  name?: string;
  description?: string;
  labels?: string[];
  body?: FormItem[];
}

interface ChooserDoc {
  blank_issues_enabled?: boolean;
  contact_links?: { name?: string; url?: string; about?: string }[];
}

function parse(file: string): Record<string, unknown> {
  return yaml.load(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** The form every other case below asserts on. */
function readForm(): FormDoc {
  return parse('propose-artifact.yml') as FormDoc;
}

/** Body items that render a field (as opposed to the markdown preamble). */
function fields(body: FormItem[]): FormItem[] {
  return body.filter(item => item.type !== 'markdown');
}

describe('issue form', () => {
  it('should give the form a name, a description and the artifact-proposal label', () => {
    const form = readForm();
    assert.ok(typeof form.name === 'string' && form.name.length > 0, 'name is empty');
    assert.ok(
      typeof form.description === 'string' && form.description.length > 0,
      'description is empty',
    );
    assert.deepEqual(form.labels, ['artifact-proposal']);
  });

  it('should list the field ids in order', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    assert.deepEqual(
      fields(body).map(item => item.id),
      ['kind', 'language', 'what', 'trigger', 'example', 'sources'],
    );
  });

  it('should use only known body item types', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    const known = new Set(['markdown', 'dropdown', 'input', 'textarea']);
    for (const item of body) {
      assert.ok(known.has(item.type), `unknown item type: ${item.type}`);
    }
  });

  it('should label every field and give it a safe id', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    for (const item of fields(body)) {
      const label = item.attributes?.label;
      assert.ok(typeof label === 'string' && label.length > 0, `${item.id} has no label`);
      assert.match(String(item.id), /^[A-Za-z0-9_-]+$/, `${item.id} is not a safe id`);
    }
  });

  it('should offer exactly the four kinds plus "not sure"', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    const kind = fields(body).find(item => item.id === 'kind');
    assert.ok(kind, 'no kind field');
    assert.deepEqual(kind.attributes?.options, ['skill', 'agent', 'rule', 'prompt', 'not sure']);
  });

  it('should offer only real artifact kinds besides "not sure"', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    const kind = fields(body).find(item => item.id === 'kind');
    assert.ok(kind, 'no kind field');
    const options = (kind.attributes?.options ?? []).filter(option => option !== 'not sure');
    assert.ok(options.length > 0, 'kind has no options');
    for (const option of options) {
      assert.ok((ALL_KINDS as string[]).includes(option), `${option} is not an artifact kind`);
    }
  });

  it('should require the three leading fields and the trigger, but not example or sources', () => {
    const body = readForm().body;
    assert.ok(Array.isArray(body), 'body is not a list');
    const byId = new Map(fields(body).map(item => [item.id, item]));
    for (const id of ['kind', 'language', 'what', 'trigger']) {
      const item = byId.get(id);
      assert.ok(item, `no ${id} field`);
      assert.equal(item.validations?.required, true, `${id} is not required`);
    }
    for (const id of ['example', 'sources']) {
      const item = byId.get(id);
      assert.ok(item, `no ${id} field`);
      assert.ok(!item.validations?.required, `${id} should not be required`);
    }
  });

  it('should leave blank issues enabled', () => {
    const config = parse('config.yml') as ChooserDoc;
    assert.equal(config.blank_issues_enabled, true);
  });

  it('should link to complete contact entries over https', () => {
    const config = parse('config.yml') as ChooserDoc;
    const links = config.contact_links;
    assert.ok(Array.isArray(links) && links.length > 0, 'contact_links is empty');
    for (const link of links) {
      assert.ok(typeof link.name === 'string' && link.name.length > 0, 'link has no name');
      assert.ok(
        typeof link.about === 'string' && link.about.length > 0,
        `${link.name} has no about`,
      );
      assert.ok(link.url?.startsWith('https://'), `${link.name} is not an https URL`);
    }
  });
});
