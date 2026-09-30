/**
 * Tests for src/authoring/update/index.ts — buildFieldPatch, getEditableFields,
 * and applyPatchTransactionally.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildFieldPatch,
  getEditableFields,
  applyPatchTransactionally,
} from '../../dist-cli/authoring/update';
import { getAllTargets } from '../../dist-cli/targets';
import type { Artifact } from '../../dist-cli/types';

describe('G — buildFieldPatch (authoring/update)', () => {
  /** Minimal fake rule artifact for patch builder tests. */
  function makeRuleArtifact(fmOverrides: Record<string, unknown> = {}) {
    return {
      id: 'test/fake',
      kind: 'rule' as const,
      filePath: '/fake/fake.rule.md',
      frontmatter: {
        id: 'test/fake',
        kind: 'rule',
        title: 'Fake Rule',
        description: 'A fake artifact for testing.',
        severity: 'recommended',
        appliesTo: ['**/*.ts'],
        tags: ['foo', 'bar'],
        ...fmOverrides,
      },
      body: '- Fake body.',
    };
  }

  it('no-op when nothing changed', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { title: 'Fake Rule' });
    assert.ok(result.noOp, 'reports no-op');
    assert.equal(result.errors.length, 0);
  });

  it('scalar title change produces patch', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { title: 'New Title' });
    assert.ok(!result.noOp, 'not a no-op');
    assert.equal(result.patch.title, 'New Title');
    assert.equal(result.errors.length, 0);
  });

  it('clearing required title gives error', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { title: '   ' });
    assert.ok(
      result.errors.some(e => e.includes('title')),
      'error mentions title',
    );
  });

  it('clearing required description gives error', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { description: '' });
    assert.ok(
      result.errors.some(e => e.includes('description')),
      'error mentions description',
    );
  });

  it('addTags appends without duplicates', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { addTags: ['baz', 'foo'] }); // foo already exists
    assert.deepEqual(result.patch.tags, ['foo', 'bar', 'baz']);
    assert.equal(result.errors.length, 0);
  });

  it('removeTags removes the item', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { removeTags: ['foo'] });
    assert.deepEqual(result.patch.tags, ['bar']);
  });

  it('setTags replaces entirely and deduplicates', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { setTags: ['x', 'y', 'x'] });
    assert.deepEqual(result.patch.tags, ['x', 'y']);
  });

  it('valid severity change produces patch', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { severity: 'required' });
    assert.equal(result.errors.length, 0, 'no errors');
    assert.equal(result.patch.severity, 'required');
    assert.ok(!result.noOp, 'not a no-op');
  });

  it('invalid severity value gives error', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { severity: 'critical' });
    assert.ok(
      result.errors.some(e => e.includes('severity') || e.includes('critical')),
      'error about severity',
    );
  });

  it('severity rejected for non-rule kinds', () => {
    const skillArtifact = {
      ...makeRuleArtifact(),
      kind: 'skill' as const,
    };
    const result = buildFieldPatch(skillArtifact as any, { severity: 'required' });
    assert.ok(
      result.errors.some(e => e.includes('severity')),
      'error mentions severity',
    );
  });

  it('uses fields rejected for non-skill artifact', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { addUsesRules: ['shared/clean-code'] });
    assert.ok(
      result.errors.some(e => e.includes('uses')),
      'error mentions uses',
    );
  });

  it('addUsesRules for skill adds to the rules list', () => {
    const skillArtifact = {
      id: 'test/skill',
      kind: 'skill' as const,
      filePath: '/fake/SKILL.md',
      frontmatter: {
        id: 'test/skill',
        kind: 'skill',
        title: 'Skill',
        description: 'Skill desc',
        name: 'skill',
        language: 'test',
        uses: { rules: ['shared/clean-code'], agents: [] },
      },
      body: '- Body.',
    };
    const result = buildFieldPatch(skillArtifact as any, {
      addUsesRules: ['csharp/cs-conventions'],
    });
    assert.equal(result.errors.length, 0, 'no errors');
    assert.deepEqual(result.patch.uses, {
      rules: ['shared/clean-code', 'csharp/cs-conventions'],
      agents: [],
    });
  });

  it('claude.model invalid value gives error', () => {
    const agentArtifact = {
      id: 'test/agent',
      kind: 'agent' as const,
      filePath: '/fake/agent.agent.md',
      frontmatter: {
        id: 'test/agent',
        kind: 'agent',
        title: 'Agent',
        description: 'Agent desc',
        name: 'agent',
      },
      body: '- Body.',
    };
    const result = buildFieldPatch(agentArtifact as any, { claudeModel: 'gpt4' });
    assert.ok(result.errors.some(e => e.includes('claude.model') || e.includes('gpt4')));
  });

  it('claude fields rejected for non-agent artifact', () => {
    const a = makeRuleArtifact();
    const result = buildFieldPatch(a as any, { claudeModel: 'sonnet' });
    assert.ok(result.errors.some(e => e.includes('claude')));
  });

  it('getEditableFields for rule includes severity + extends + common fields', () => {
    const fields = getEditableFields('rule' as any);
    const names = fields.map(f => f.field);
    assert.ok(names.includes('title'), 'common title field present');
    assert.ok(names.includes('description'), 'common description field present');
    assert.ok(names.includes('severity'), 'severity field for rule');
    assert.ok(names.includes('extends'), 'extends field for rule');
  });

  it('getEditableFields for agent includes claude.* and tools', () => {
    const fields = getEditableFields('agent' as any);
    const names = fields.map(f => f.field);
    assert.ok(names.includes('claude.model'));
    assert.ok(names.includes('claude.effort'));
    assert.ok(names.includes('tools'));
    assert.ok(names.includes('disallowedTools'));
  });

  it('getEditableFields for skill includes uses.rules + uses.agents', () => {
    const fields = getEditableFields('skill' as any);
    const names = fields.map(f => f.field);
    assert.ok(names.includes('uses.rules'));
    assert.ok(names.includes('uses.agents'));
    assert.ok(names.includes('appliesTo'));
  });
});

// ─── applyPatchTransactionally ────────────────────────────────────────────────

describe('applyPatchTransactionally', () => {
  const ARTIFACT_ID = 'shared/clean-code';
  const ARTIFACT_MD = `---
id: shared/clean-code
kind: rule
title: Clean Code
description: A clean code style guide.
severity: recommended
---

## Guidelines
- Prefer clarity over brevity.
`;

  function makeTempArtifact(): { tmpDir: string; filePath: string } {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-patch-'));
    const filePath = path.join(tmpDir, 'clean-code.rule.md');
    fs.writeFileSync(filePath, ARTIFACT_MD, 'utf-8');
    return { tmpDir, filePath };
  }

  function cleanup(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Build a fake loadFn that returns the given artifact as the reloaded catalog.
   * This simulates loadCatalog succeeding after the write.
   */
  function makeSuccessLoadFn(artifact: Artifact): Parameters<typeof applyPatchTransactionally>[4] {
    return (_dir: string, _file: string) => ({
      catalog: {
        byId: new Map([[ARTIFACT_ID, artifact]]) as Map<string, Artifact>,
        artifacts: [artifact],
      },
    });
  }

  it('applies a valid patch and returns ok=true', () => {
    const { tmpDir, filePath } = makeTempArtifact();
    try {
      const artifactAfterPatch: Artifact = {
        id: ARTIFACT_ID,
        kind: 'rule',
        filePath,
        frontmatter: {
          id: ARTIFACT_ID,
          kind: 'rule',
          title: 'New Title',
          description: 'A clean code style guide.',
          severity: 'recommended',
        } as Record<string, unknown>,
        body: '## Guidelines\n- Prefer clarity over brevity.\n',
      };
      const result = applyPatchTransactionally(
        filePath,
        { title: 'New Title' },
        getAllTargets(),
        ARTIFACT_ID,
        makeSuccessLoadFn(artifactAfterPatch),
        tmpDir,
      );
      assert.equal(result.ok, true, 'patch succeeded');
      assert.equal(result.errors.length, 0, 'no blocking errors');
      const raw = fs.readFileSync(filePath, 'utf-8');
      assert.ok(raw.includes('title: New Title'), 'patched title written to file');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('rolls back the file when loadFn throws a blocking error', () => {
    const { tmpDir, filePath } = makeTempArtifact();
    const original = fs.readFileSync(filePath, 'utf-8');
    try {
      // loadFn that throws — simulates a broken catalog reload
      const throwingLoadFn: Parameters<typeof applyPatchTransactionally>[4] = () => {
        throw new Error('Simulated load failure');
      };
      const result = applyPatchTransactionally(
        filePath,
        { title: 'New Title' },
        getAllTargets(),
        ARTIFACT_ID,
        throwingLoadFn,
        tmpDir,
      );
      assert.equal(result.ok, false, 'reports failure');
      assert.ok(result.errors.length > 0, 'errors are non-empty');
      // File must be restored to the original content
      const restored = fs.readFileSync(filePath, 'utf-8');
      assert.equal(restored, original, 'file restored to original after rollback');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('returns ok=true with warnings when loadFn returns non-blocking violation', () => {
    const { tmpDir, filePath } = makeTempArtifact();
    try {
      // loadFn returns an artifact with a dep-drift warning
      const artifactWithDrift: Artifact = {
        id: ARTIFACT_ID,
        kind: 'rule',
        filePath,
        frontmatter: {
          id: ARTIFACT_ID,
          kind: 'rule',
          title: 'Updated Title',
          description: 'A clean code style guide.',
          severity: 'recommended',
        } as Record<string, unknown>,
        body: '',
      };
      const warnLoadFn: Parameters<typeof applyPatchTransactionally>[4] = () => ({
        catalog: {
          byId: new Map([[ARTIFACT_ID, artifactWithDrift]]) as Map<string, Artifact>,
          artifacts: [artifactWithDrift],
        },
      });
      const result = applyPatchTransactionally(
        filePath,
        { title: 'Updated Title' },
        getAllTargets(),
        ARTIFACT_ID,
        warnLoadFn,
        tmpDir,
      );
      // Should succeed — dep-drift warnings don't block the patch
      assert.equal(result.ok, true, 'non-blocking violations leave ok=true');
      assert.equal(result.errors.length, 0, 'no blocking errors');
    } finally {
      cleanup(tmpDir);
    }
  });
});
