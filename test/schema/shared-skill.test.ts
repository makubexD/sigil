/**
 * Shared (language-less) skills — a skill may omit `language`, the same way agents, rules, hooks,
 * settings and mcp already can. Needed for stack-agnostic skills that carry one reference per
 * stack instead of belonging to a single catalog/languages/<lang>/ namespace
 * (docs/decisions/distribution-channels-2026-09.md, Task M).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { SkillSchema } from '../../dist-cli/schema';
import { KIND_REGISTRY } from '../../dist-cli/kinds';

const SKILL_SCHEMA_JSON = path.resolve(__dirname, '../../schema/skill.schema.json');

const SHARED_SKILL = {
  id: 'shared/example-skill',
  kind: 'skill',
  title: 'Example',
  description: 'A stack-agnostic skill with one reference per stack.',
  name: 'example-skill',
};

describe('shared (language-less) skills', () => {
  it('SkillSchema accepts a skill without language', () => {
    const result = SkillSchema.safeParse(SHARED_SKILL);
    assert.ok(result.success, `expected success, got ${JSON.stringify(result.error?.issues)}`);
  });

  it('SkillSchema still rejects an empty language string', () => {
    assert.equal(SkillSchema.safeParse({ ...SHARED_SKILL, language: '' }).success, false);
  });

  it('skill.schema.json does not list language as required', () => {
    const parsed = JSON.parse(fs.readFileSync(SKILL_SCHEMA_JSON, 'utf-8')) as {
      definitions: Record<string, { required?: string[] }>;
    };
    const required = parsed.definitions['skill-frontmatter']?.required ?? [];
    assert.ok(!required.includes('language'), 'language must be optional in the JSON Schema');
  });

  it('no kind descriptor forces a language any more', () => {
    for (const d of Object.values(KIND_REGISTRY)) {
      assert.ok(!('requiresLanguage' in d), `${d.kind} must not declare requiresLanguage`);
    }
  });
});
