/**
 * Tests for src/schema/emit.ts — verifies that the generated schema/*.schema.json files
 * are present and structurally correct (the emit script is a build-time artifact; we test
 * its committed output rather than re-running the script in the test suite).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const SCHEMA_DIR = path.resolve(__dirname, '../../schema');

const EXPECTED_KINDS = ['skill', 'agent', 'rule', 'prompt', 'workflow', 'hook', 'settings', 'mcp'];

describe('schema/emit — committed schema files', () => {
  it('all expected *.schema.json files exist', () => {
    for (const kind of EXPECTED_KINDS) {
      const p = path.join(SCHEMA_DIR, `${kind}.schema.json`);
      assert.ok(
        fs.existsSync(p),
        `schema/${kind}.schema.json must exist (run npm run build to regenerate)`,
      );
    }
  });

  it('each schema file is valid JSON and has a $ref to its named definition', () => {
    for (const kind of EXPECTED_KINDS) {
      const p = path.join(SCHEMA_DIR, `${kind}.schema.json`);
      const raw = fs.readFileSync(p, 'utf-8');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch (e) {
        assert.fail(`schema/${kind}.schema.json is not valid JSON: ${e}`);
      }
      // zodToJsonSchema emits { $ref: '#/definitions/<name>', definitions: {...} }
      assert.ok(
        typeof parsed['$ref'] === 'string',
        `${kind}.schema.json must have a top-level $ref`,
      );
      assert.ok(
        (parsed['$ref'] as string).includes(`${kind}-frontmatter`),
        `${kind}.schema.json $ref must reference ${kind}-frontmatter definition; got ${parsed['$ref']}`,
      );
    }
  });

  it('each schema has a definitions object containing the named entry', () => {
    for (const kind of EXPECTED_KINDS) {
      const p = path.join(SCHEMA_DIR, `${kind}.schema.json`);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
      const defs = parsed['definitions'] as Record<string, unknown> | undefined;
      assert.ok(
        typeof defs === 'object' && defs !== null,
        `${kind}.schema.json must have definitions`,
      );
      assert.ok(
        `${kind}-frontmatter` in defs,
        `${kind}.schema.json definitions must include ${kind}-frontmatter`,
      );
    }
  });

  it('each definition has type:object with required and properties', () => {
    for (const kind of EXPECTED_KINDS) {
      const p = path.join(SCHEMA_DIR, `${kind}.schema.json`);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
      const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
      const def = defs[`${kind}-frontmatter`]!;
      assert.equal(def.type, 'object', `${kind} definition must be type:object`);
      assert.ok(
        def.properties && typeof def.properties === 'object',
        `${kind} definition must have properties`,
      );
    }
  });

  it('each schema has common fields: id, kind, title, description', () => {
    for (const kind of EXPECTED_KINDS) {
      const p = path.join(SCHEMA_DIR, `${kind}.schema.json`);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
      const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
      const props = defs[`${kind}-frontmatter`]!.properties as Record<string, unknown>;
      for (const field of ['id', 'kind', 'title', 'description']) {
        assert.ok(field in props, `${kind}.schema.json must define field "${field}" in properties`);
      }
    }
  });

  it('skill schema includes name, language, uses, and appliesTo fields', () => {
    const p = path.join(SCHEMA_DIR, 'skill.schema.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
    const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
    const props = defs['skill-frontmatter']!.properties as Record<string, unknown>;
    assert.ok('name' in props, 'skill must have name field');
    assert.ok('language' in props, 'skill must have language field');
    assert.ok('uses' in props, 'skill must have uses field');
    assert.ok('appliesTo' in props, 'skill must have appliesTo field');
  });

  it('rule schema includes severity and extends fields', () => {
    const p = path.join(SCHEMA_DIR, 'rule.schema.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
    const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
    const props = defs['rule-frontmatter']!.properties as Record<string, unknown>;
    assert.ok('severity' in props, 'rule must have severity field');
    assert.ok('extends' in props, 'rule must have extends field');
  });

  it('hook schema includes event, matcher, and command fields', () => {
    const p = path.join(SCHEMA_DIR, 'hook.schema.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
    const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
    const props = defs['hook-frontmatter']!.properties as Record<string, unknown>;
    assert.ok('event' in props, 'hook must have event field');
    assert.ok('matcher' in props, 'hook must have matcher field');
    assert.ok('command' in props, 'hook must have command field');
  });

  it('agent schema includes claude field for model/effort/maxTurns', () => {
    const p = path.join(SCHEMA_DIR, 'agent.schema.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
    const defs = parsed['definitions'] as Record<string, Record<string, unknown>>;
    const props = defs['agent-frontmatter']!.properties as Record<string, unknown>;
    assert.ok('claude' in props, 'agent must have claude field for model/effort/maxTurns config');
  });
});
