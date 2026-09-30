/**
 * Tests for src/authoring/check-source-conventions.ts — id/path/language/kind
 * naming-convention checkers and reference-integrity checks used by `sigil check`
 * and the import/authoring pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkIdConsistency,
  checkKindMatchesPath,
  checkDuplicateId,
  checkReferenceIntegrity,
} from '../../dist-cli/authoring/check-source-conventions';
import type { CheckCtx } from '../../dist-cli/authoring/check-source-ctx';
import type { Artifact, LoadedCatalog, SourceViolation } from '../../dist-cli/types';

/** Builds a minimal Artifact for these checkers — only id/kind/filePath/frontmatter matter. */
function makeArtifact(overrides: Partial<Artifact> & { id: string; filePath: string }): Artifact {
  return {
    kind: 'rule',
    body: '',
    frontmatter: {},
    ...overrides,
  } as Artifact;
}

/** Builds a CheckCtx with a fresh violations array and an optional catalog. */
function makeCtx(artifact: Artifact, catalogArtifacts: Artifact[] = []): CheckCtx {
  const byId = new Map(catalogArtifacts.map(a => [a.id, a]));
  const catalog = { artifacts: catalogArtifacts, byId, languages: new Map() } as LoadedCatalog;
  return { artifact, catalog, targets: [], v: [] as SourceViolation[] };
}

describe('checkIdConsistency', () => {
  it('accepts a well-formed <language>/<name> id matching its path and frontmatter', () => {
    const artifact = makeArtifact({
      id: 'csharp/cs-conventions',
      kind: 'rule',
      filePath: '/catalog/languages/csharp/rules/cs-conventions.rule.md',
      frontmatter: { language: 'csharp' },
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.deepEqual(ctx.v, []);
  });

  it('flags an id that is not exactly two parts', () => {
    const artifact = makeArtifact({
      id: 'not-two-parts',
      filePath: '/catalog/shared/rules/x.rule.md',
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('must follow the convention')));
  });

  it('flags an id prefix that disagrees with the path-inferred language', () => {
    const artifact = makeArtifact({
      id: 'python/py-conventions',
      filePath: '/catalog/languages/csharp/rules/py-conventions.rule.md',
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes("doesn't match path inferred prefix")));
  });

  it('flags a skill/agent name that is not kebab-case', () => {
    const artifact = makeArtifact({
      id: 'shared/my_skill',
      kind: 'skill',
      filePath: '/catalog/shared/skills/my_skill/SKILL.md',
      frontmatter: { name: 'My_Skill' },
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('must be kebab-case')));
  });

  it("flags a skill/agent name that doesn't match the id's name segment", () => {
    const artifact = makeArtifact({
      id: 'shared/my-skill',
      kind: 'skill',
      filePath: '/catalog/shared/skills/my-skill/SKILL.md',
      frontmatter: { name: 'different-name' },
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('must match the id name segment')));
  });

  it('flags frontmatter language that disagrees with the id prefix', () => {
    const artifact = makeArtifact({
      id: 'csharp/cs-conventions',
      filePath: '/catalog/languages/csharp/rules/cs-conventions.rule.md',
      frontmatter: { language: 'python' },
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('must match id prefix')));
  });

  it('flags frontmatter language that disagrees with the path-inferred language', () => {
    const artifact = makeArtifact({
      id: 'csharp/cs-conventions',
      filePath: '/catalog/languages/csharp/rules/cs-conventions.rule.md',
      frontmatter: { language: 'csharp' },
    });
    // Force a path/id mismatch scenario where frontmatter matches id but not the actual dir
    const mismatched = makeArtifact({
      id: 'csharp/cs-conventions',
      filePath: '/catalog/languages/angular/rules/cs-conventions.rule.md',
      frontmatter: { language: 'csharp' },
    });
    const ctx1 = makeCtx(artifact);
    checkIdConsistency(ctx1);
    assert.deepEqual(ctx1.v, []);

    const ctx2 = makeCtx(mismatched);
    checkIdConsistency(ctx2);
    assert.ok(ctx2.v.some(v => v.problem.includes("doesn't match path-inferred language")));
  });

  it('shared/ path prefix never triggers a language mismatch', () => {
    const artifact = makeArtifact({
      id: 'shared/clean-code',
      filePath: '/catalog/shared/rules/clean-code.rule.md',
      frontmatter: {},
    });
    const ctx = makeCtx(artifact);
    checkIdConsistency(ctx);
    assert.deepEqual(ctx.v, []);
  });
});

describe('checkKindMatchesPath', () => {
  it('accepts a rule file whose name matches its frontmatter kind', () => {
    const artifact = makeArtifact({
      id: 'shared/clean-code',
      kind: 'rule',
      filePath: '/catalog/shared/rules/clean-code.rule.md',
    });
    const ctx = makeCtx(artifact);
    checkKindMatchesPath(ctx);
    assert.deepEqual(ctx.v, []);
  });

  it('flags a file name that implies a different kind than frontmatter declares', () => {
    const artifact = makeArtifact({
      id: 'shared/oops',
      kind: 'rule',
      filePath: '/catalog/shared/agents/oops.agent.md',
    });
    const ctx = makeCtx(artifact);
    checkKindMatchesPath(ctx);
    assert.ok(
      ctx.v.some(
        v =>
          v.problem.includes("file name implies kind 'agent'") &&
          v.problem.includes("declares kind 'rule'"),
      ),
    );
  });

  it('SKILL.md implies kind skill', () => {
    const artifact = makeArtifact({
      id: 'shared/my-skill',
      kind: 'agent',
      filePath: '/catalog/shared/skills/my-skill/SKILL.md',
    });
    const ctx = makeCtx(artifact);
    checkKindMatchesPath(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes("implies kind 'skill'")));
  });
});

describe('checkDuplicateId', () => {
  it('is silent when the id is not yet in the catalog', () => {
    const artifact = makeArtifact({ id: 'shared/new-rule', filePath: '/new/path.rule.md' });
    const ctx = makeCtx(artifact, []);
    checkDuplicateId(ctx);
    assert.deepEqual(ctx.v, []);
  });

  it('is silent when the catalog entry IS this same file (re-check of an existing artifact)', () => {
    const artifact = makeArtifact({ id: 'shared/existing', filePath: '/catalog/existing.rule.md' });
    const ctx = makeCtx(artifact, [artifact]);
    checkDuplicateId(ctx);
    assert.deepEqual(ctx.v, []);
  });

  it('flags a duplicate id pointing at a different file path', () => {
    const existing = makeArtifact({ id: 'shared/dup', filePath: '/catalog/original.rule.md' });
    const incoming = makeArtifact({ id: 'shared/dup', filePath: '/catalog/new-copy.rule.md' });
    const ctx = makeCtx(incoming, [existing]);
    checkDuplicateId(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('Duplicate id')));
  });

  it('normalizes path separators so a Windows-style backslash path is not a false-positive duplicate', () => {
    const existing = makeArtifact({ id: 'shared/dup', filePath: 'catalog/shared/dup.rule.md' });
    const incoming = makeArtifact({
      id: 'shared/dup',
      filePath: 'catalog\\shared\\dup.rule.md',
    });
    const ctx = makeCtx(incoming, [existing]);
    checkDuplicateId(ctx);
    assert.deepEqual(ctx.v, [], 'same logical path via different separators is not a duplicate');
  });
});

describe('checkReferenceIntegrity', () => {
  it('flags a dangling workflow step ref', () => {
    const artifact = makeArtifact({
      id: 'shared/my-workflow',
      kind: 'workflow',
      filePath: '/catalog/shared/workflows/my-workflow.workflow.md',
      frontmatter: { steps: [{ ref: 'does/not-exist' }] },
    });
    const ctx = makeCtx(artifact, []);
    checkReferenceIntegrity(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('does/not-exist')));
  });

  it('is silent for a workflow step ref that exists in the catalog', () => {
    const step = makeArtifact({ id: 'shared/step-target', filePath: '/catalog/shared/x.rule.md' });
    const artifact = makeArtifact({
      id: 'shared/my-workflow',
      kind: 'workflow',
      filePath: '/catalog/shared/workflows/my-workflow.workflow.md',
      frontmatter: { steps: [{ ref: 'shared/step-target' }] },
    });
    const ctx = makeCtx(artifact, [step]);
    checkReferenceIntegrity(ctx);
    assert.deepEqual(ctx.v, []);
  });

  it('flags a dangling relatedArtifacts reference', () => {
    const artifact = makeArtifact({
      id: 'shared/my-agent',
      kind: 'agent',
      filePath: '/catalog/shared/agents/my-agent.agent.md',
      frontmatter: {
        relatedArtifacts: [{ id: 'does/not-exist', relation: 'sibling', reason: 'testing' }],
      },
    });
    const ctx = makeCtx(artifact, []);
    checkReferenceIntegrity(ctx);
    assert.ok(ctx.v.some(v => v.problem.includes('does/not-exist')));
  });

  it('is silent for a relatedArtifacts reference that exists in the catalog', () => {
    const sibling = makeArtifact({ id: 'shared/sibling', filePath: '/catalog/shared/x.rule.md' });
    const artifact = makeArtifact({
      id: 'shared/my-agent',
      kind: 'agent',
      filePath: '/catalog/shared/agents/my-agent.agent.md',
      frontmatter: {
        relatedArtifacts: [{ id: 'shared/sibling', relation: 'sibling', reason: 'testing' }],
      },
    });
    const ctx = makeCtx(artifact, [sibling]);
    checkReferenceIntegrity(ctx);
    assert.deepEqual(ctx.v, []);
  });
});
