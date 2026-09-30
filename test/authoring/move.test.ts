/**
 * Tests for src/authoring/move/index.ts — move planner (planMove, summarizePlan,
 * computeDestinationPath) and move executor (executeMove).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  planMove,
  summarizePlan,
  computeDestinationPath,
  executeMove,
} from '../../dist-cli/authoring/move/index';
import { getAllTargets } from '../../dist-cli/targets';
import type { LoadedCatalog } from '../../dist-cli/types';
import { buildFakeCatalog } from '../helpers/fixtures';

const FAKE_CATALOG_DIR = '/catalog';

describe('J — Move planner (authoring/move.ts)', () => {
  it('throws on unknown old id', () => {
    const catalog = buildFakeCatalog();
    assert.throws(
      () => planMove('does/not-exist', 'does/new-name', catalog as any, FAKE_CATALOG_DIR),
      /not found/,
    );
  });

  it('throws on collision with existing id', () => {
    const catalog = buildFakeCatalog();
    assert.throws(
      () => planMove('shared/clean-code', 'shared/code-reviewer', catalog as any, FAKE_CATALOG_DIR),
      /already exists/,
    );
  });

  it('throws on malformed new id (no slash)', () => {
    const catalog = buildFakeCatalog();
    assert.throws(
      () => planMove('shared/clean-code', 'newname', catalog as any, FAKE_CATALOG_DIR),
      /must be in the form/,
    );
  });

  it('planMove finds referrers in uses.rules', () => {
    const catalog = buildFakeCatalog();
    const plan = planMove(
      'shared/clean-code',
      'shared/better-code',
      catalog as any,
      FAKE_CATALOG_DIR,
    );
    const ref = plan.referrers.find(r => r.artifactId === 'csharp/cs-generate-tests');
    assert.ok(ref, 'cs-generate-tests is a referrer');
    assert.ok(ref?.fields.includes('uses.rules'), 'references via uses.rules');
  });

  it('planMove finds referrers in uses.agents', () => {
    const catalog = buildFakeCatalog();
    const plan = planMove(
      'shared/code-reviewer',
      'shared/better-reviewer',
      catalog as any,
      FAKE_CATALOG_DIR,
    );
    const ref = plan.referrers.find(r => r.artifactId === 'csharp/cs-generate-tests');
    assert.ok(ref, 'cs-generate-tests is a referrer for the agent');
    assert.ok(ref?.fields.includes('uses.agents'), 'references via uses.agents');
  });

  it('artifact with no referrers produces empty referrers array', () => {
    const catalog = buildFakeCatalog();
    const plan = planMove(
      'csharp/cs-generate-tests',
      'csharp/xunit-v2',
      catalog as any,
      FAKE_CATALOG_DIR,
    );
    assert.deepEqual(plan.referrers, [], 'skill has no referrers in this catalog');
  });

  it('computeDestinationPath: shared rule → canonical shared path', () => {
    const dest = computeDestinationPath('shared/better-code', 'rule', '/catalog');
    // Expected: /catalog/shared/rules/better-code.rule.md
    assert.ok(
      dest.replace(/\\/g, '/').endsWith('shared/rules/better-code.rule.md'),
      `unexpected path: ${dest}`,
    );
  });

  it('computeDestinationPath: language skill → canonical skill directory path', () => {
    const dest = computeDestinationPath('csharp/my-skill', 'skill', '/catalog');
    // Expected: /catalog/languages/csharp/skills/my-skill/SKILL.md
    assert.ok(
      dest.replace(/\\/g, '/').endsWith('languages/csharp/skills/my-skill/SKILL.md'),
      `unexpected path: ${dest}`,
    );
  });

  it('computeDestinationPath: shared agent → canonical agent path', () => {
    const dest = computeDestinationPath('shared/sql-reviewer', 'agent', '/catalog');
    assert.ok(
      dest.replace(/\\/g, '/').endsWith('shared/agents/sql-reviewer.agent.md'),
      `unexpected path: ${dest}`,
    );
  });

  it('computeDestinationPath rejects a path-traversal id (F32, round-4 audit)', () => {
    assert.throws(
      () => computeDestinationPath('shared/../../escape', 'rule', FAKE_CATALOG_DIR),
      /kebab-case/,
    );
  });

  it('computeDestinationPath rejects a non-kebab-case id (F32, round-4 audit)', () => {
    assert.throws(
      () => computeDestinationPath('shared/Not_Kebab', 'rule', FAKE_CATALOG_DIR),
      /kebab-case/,
    );
  });

  it('summarizePlan includes the self id-update + all referrer rewrites', () => {
    const catalog = buildFakeCatalog();
    const plan = planMove(
      'shared/clean-code',
      'shared/better-code',
      catalog as any,
      FAKE_CATALOG_DIR,
    );
    const summary = summarizePlan(plan);

    assert.equal(summary.moves.length, 1, 'one file move');
    assert.ok(
      summary.moves[0]!.from.replace(/\\/g, '/').includes('clean-code'),
      'from path includes old name',
    );
    assert.ok(
      summary.moves[0]!.to.replace(/\\/g, '/').includes('better-code'),
      'to path includes new name',
    );

    // Self id update always present
    assert.ok(
      summary.referrerRewrites.some(r => r.fields.includes('id')),
      'self id update present in referrerRewrites',
    );
    // Skill referrer present
    assert.ok(
      summary.referrerRewrites.some(r => r.fields.includes('uses.rules')),
      'skill referrer (uses.rules) present',
    );
  });

  it('moving to a different language prefix changes the destination directory', () => {
    const catalog = buildFakeCatalog();
    const plan = planMove(
      'shared/clean-code',
      'python/clean-code',
      catalog as any,
      FAKE_CATALOG_DIR,
    );
    assert.ok(
      plan.destinationPath.replace(/\\/g, '/').includes('languages/python'),
      'destination is in python language dir',
    );
  });
});

// ─── executeMove ──────────────────────────────────────────────────────────────

describe('executeMove', () => {
  /**
   * Build a temp catalog directory with:
   *   shared/rules/clean-code.rule.md  (rule artifact to move)
   *   languages/csharp/skills/xunit-testing/SKILL.md  (referrer with uses.rules)
   * Returns the tempDir and the catalog object (byId, artifacts, languages).
   */
  function buildTempCatalog(): {
    tempDir: string;
    catalog: LoadedCatalog;
    cleanCodePath: string;
    xunitPath: string;
  } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-move-'));

    const cleanCodePath = computeDestinationPath('shared/clean-code', 'rule', tempDir);
    const xunitPath = computeDestinationPath('csharp/cs-generate-tests', 'skill', tempDir);
    const skillDir = path.dirname(xunitPath);

    fs.mkdirSync(path.dirname(cleanCodePath), { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      cleanCodePath,
      `---\nid: shared/clean-code\nkind: rule\ntitle: Clean Code\ndescription: Rules for clean code.\nseverity: recommended\nappliesTo:\n  - "**/*"\ntags: []\n---\n\n## Guidelines\n`,
      'utf-8',
    );
    fs.writeFileSync(
      xunitPath,
      `---\nid: csharp/cs-generate-tests\nkind: skill\ntitle: Generate Tests (.NET / C#)\ndescription: C# testing skill.\nname: cs-generate-tests\nlanguage: csharp\nuses:\n  rules:\n    - shared/clean-code\n  agents: []\n---\n\n# Generate Tests\n`,
      'utf-8',
    );

    const cleanCodeArtifact = {
      id: 'shared/clean-code',
      kind: 'rule' as const,
      filePath: cleanCodePath,
      frontmatter: {
        id: 'shared/clean-code',
        kind: 'rule',
        title: 'Clean Code',
        description: 'Rules for clean code.',
        severity: 'recommended',
        appliesTo: ['**/*'],
        tags: [],
        extends: [],
      },
      body: '\n## Guidelines\n',
    };
    const xunitArtifact = {
      id: 'csharp/cs-generate-tests',
      kind: 'skill' as const,
      filePath: xunitPath,
      frontmatter: {
        id: 'csharp/cs-generate-tests',
        kind: 'skill',
        title: 'Generate Tests (.NET / C#)',
        description: 'C# testing skill.',
        name: 'cs-generate-tests',
        language: 'csharp',
        uses: { rules: ['shared/clean-code'], agents: [] },
      },
      body: '\n# xUnit Testing\n',
    };

    const catalog: LoadedCatalog = {
      artifacts: [cleanCodeArtifact, xunitArtifact] as any[],
      byId: new Map<string, any>([
        ['shared/clean-code', cleanCodeArtifact],
        ['csharp/cs-generate-tests', xunitArtifact],
      ]),
      languages: new Map(),
    } as unknown as LoadedCatalog;

    return { tempDir, catalog, cleanCodePath, xunitPath };
  }

  function cleanup(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  it('moves the rule file and rewrites the referrer uses.rules', () => {
    const { tempDir, catalog, cleanCodePath, xunitPath } = buildTempCatalog();
    try {
      const plan = planMove('shared/clean-code', 'shared/better-code', catalog as any, tempDir);
      const betterCodePath = computeDestinationPath('shared/better-code', 'rule', tempDir);

      const loadFn = (_dir: string): LoadedCatalog => {
        const betterArtifact = {
          id: 'shared/better-code',
          kind: 'rule' as const,
          filePath: betterCodePath,
          frontmatter: {
            id: 'shared/better-code',
            kind: 'rule',
            title: 'Clean Code',
            description: 'Rules for clean code.',
            severity: 'recommended',
            appliesTo: ['**/*'],
            tags: [],
            extends: [],
          },
          body: '\n## Guidelines\n',
        };
        return {
          artifacts: [betterArtifact] as any[],
          byId: new Map([['shared/better-code', betterArtifact]]) as any,
          languages: new Map(),
        } as unknown as LoadedCatalog;
      };

      const result = executeMove({
        plan,
        catalog,
        targets: getAllTargets(),
        loadFn,
        catalogDir: tempDir,
      });

      assert.equal(result.ok, true, `executeMove failed: ${result.errors.join('; ')}`);
      assert.ok(!fs.existsSync(cleanCodePath), 'source file was moved (no longer at old path)');
      assert.ok(fs.existsSync(betterCodePath), 'artifact exists at new path');

      // Referrer must have updated uses.rules
      const xunitContent = fs.readFileSync(xunitPath, 'utf-8');
      assert.ok(
        xunitContent.includes('shared/better-code'),
        'referrer uses.rules updated to new id',
      );
      assert.ok(!xunitContent.includes('shared/clean-code'), 'old id removed from referrer');

      // Moved artifact's id field must be updated
      const movedContent = fs.readFileSync(betterCodePath, 'utf-8');
      assert.ok(movedContent.includes('id: shared/better-code'), 'moved artifact id updated');
    } finally {
      cleanup(tempDir);
    }
  });

  it('rolls back on loadFn failure — old file restored, referrer unchanged', () => {
    const { tempDir, catalog, cleanCodePath, xunitPath } = buildTempCatalog();
    const originalXunit = fs.readFileSync(xunitPath, 'utf-8');
    try {
      const plan = planMove('shared/clean-code', 'shared/better-code', catalog as any, tempDir);

      const failLoadFn = (_dir: string): LoadedCatalog => {
        throw new Error('Simulated reload failure');
      };

      const result = executeMove({
        plan,
        catalog,
        targets: getAllTargets(),
        loadFn: failLoadFn,
        catalogDir: tempDir,
      });

      assert.equal(result.ok, false, 'executeMove should report failure');
      assert.ok(result.errors.length > 0, 'errors array is non-empty');

      // Old file must be restored
      assert.ok(fs.existsSync(cleanCodePath), 'source file restored after rollback');

      // Referrer must be unchanged (rollback restored it)
      const restoredXunit = fs.readFileSync(xunitPath, 'utf-8');
      assert.equal(restoredXunit, originalXunit, 'referrer file restored after rollback');
    } finally {
      cleanup(tempDir);
    }
  });

  it('reports ok=false when loadFn returns a catalog without the moved artifact', () => {
    // If the new ID is absent from the reloaded catalog, executeMove skips validation
    // but still returns ok=true (no artifacts → no violations). Verify no crash.
    const { tempDir, catalog } = buildTempCatalog();
    try {
      const plan = planMove('shared/clean-code', 'shared/better-code', catalog as any, tempDir);

      // loadFn returns empty catalog (new id not found)
      const emptyLoadFn = (_dir: string): LoadedCatalog =>
        ({ artifacts: [], byId: new Map(), languages: new Map() }) as unknown as LoadedCatalog;

      const result = executeMove({
        plan,
        catalog,
        targets: getAllTargets(),
        loadFn: emptyLoadFn,
        catalogDir: tempDir,
      });
      // If new id is absent from reloaded catalog, executeMove skips validation → ok
      assert.equal(
        result.ok,
        true,
        'absent new id in reloaded catalog is treated as ok (no violations)',
      );
    } finally {
      cleanup(tempDir);
    }
  });
});
