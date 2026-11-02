/**
 * Every catalog rule must reach Claude, Copilot, Cursor and Antigravity with the same glob list, or
 * a project using more than one target silently loads different rules on different files. Claude
 * writes a `paths:` YAML list (a rule with no `appliesTo` has no frontmatter and applies
 * everywhere), Copilot writes a comma-joined `applyTo:`, Cursor writes either `alwaysApply: true`
 * for a repo-wide rule or `globs:` + `alwaysApply: false`, and Antigravity writes either
 * `trigger: always_on` for a repo-wide rule or `trigger: glob` + `globs:` (though a scoped rule is
 * skipped on install, since probe B1 found `agy` never attaches one).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { ANTIGRAVITY_RULE_SPEC } from '../../dist-cli/targets/antigravity/spec/rule';
import { SigilError } from '../../dist-cli/errors';
import { loadResolvedCatalog } from '../helpers/catalog';

const REPO_WIDE_GLOBS: ReadonlySet<string> = new Set(['**', '**/*']);

/** The file `files` holds under `prefix` with `suffix`, or a failure naming the target. */
function ruleFile(
  files: Record<string, string>,
  prefix: string,
  suffix: string,
  target: string,
): string {
  const file = Object.keys(files).find(f => f.startsWith(prefix) && f.endsWith(suffix));
  assert.ok(file, `${target} wrote a ${prefix}*${suffix} file`);
  return files[file]!;
}

/** Claude's glob list: `paths:` when authored, otherwise "**" (no frontmatter applies everywhere). */
function claudeGlobs(data: Record<string, unknown>): string[] {
  const paths = data.paths;
  return Array.isArray(paths) && paths.length > 0 ? paths.map(String) : ['**'];
}

/** Copilot's glob list: the comma-separated `applyTo` string, split into its entries. */
function copilotGlobs(data: Record<string, unknown>): string[] {
  assert.equal(typeof data.applyTo, 'string', 'Copilot writes an applyTo string');
  return String(data.applyTo).split(',');
}

describe('rule glob agreement', () => {
  it('should give Claude and Copilot the same glob list for every rule', async () => {
    const catalog = await loadResolvedCatalog();
    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    assert.ok(rules.length > 0, 'the catalog has rules');

    const claude = getTarget('claude');
    const copilot = getTarget('copilot');
    const options = { projectDir: '.' };

    let checked = 0;
    for (const rule of rules) {
      const claudeData = parseFrontmatter(
        ruleFile(
          await claude.scaffold!(rule.id, catalog, options),
          '.claude/rules/',
          '.md',
          'claude',
        ),
      ).data;
      const copilotData = parseFrontmatter(
        ruleFile(
          await copilot.scaffold!(rule.id, catalog, options),
          '.github/instructions/',
          '.instructions.md',
          'copilot',
        ),
      ).data;

      assert.deepEqual(
        copilotGlobs(copilotData),
        claudeGlobs(claudeData),
        `Copilot and Claude globs disagree for ${rule.id}`,
      );
      checked++;
    }

    assert.equal(checked, rules.length, 'every catalog rule was checked');
  });

  it('should agree with Claude on every rule the Cursor .mdc file publishes', async () => {
    const catalog = await loadResolvedCatalog();
    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    assert.ok(rules.length > 0, 'the catalog has rules');

    const claude = getTarget('claude');
    const cursor = getTarget('cursor');
    const options = { projectDir: '.' };

    const claudeByRule = new Map<string, string[]>();
    for (const rule of rules) {
      const data = parseFrontmatter(
        ruleFile(
          await claude.scaffold!(rule.id, catalog, options),
          '.claude/rules/',
          '.md',
          'claude',
        ),
      ).data;
      claudeByRule.set(rule.id, claudeGlobs(data));
    }

    let checked = 0;
    for (const rule of rules) {
      const data = parseFrontmatter(
        ruleFile(
          await cursor.scaffold!(rule.id, catalog, options),
          '.cursor/rules/',
          '.mdc',
          'cursor',
        ),
      ).data;
      const globs = claudeByRule.get(rule.id)!;
      assert.equal(
        typeof data.alwaysApply,
        'boolean',
        `Cursor writes a boolean alwaysApply for ${rule.id}`,
      );

      if (data.alwaysApply === true) {
        assert.ok(
          globs.every(g => REPO_WIDE_GLOBS.has(g)),
          `${rule.id} is alwaysApply in Cursor, so every Claude glob must be "**" or "**/*" (got ${globs.join(', ')})`,
        );
      } else {
        assert.deepEqual(
          String(data.globs).split(','),
          globs,
          `Cursor and Claude globs disagree for ${rule.id}`,
        );
      }
      checked++;
    }

    assert.equal(checked, rules.length, 'every catalog rule was checked');
  });

  it('should agree with Claude on every rule Antigravity writes', async () => {
    const catalog = await loadResolvedCatalog();
    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    assert.ok(rules.length > 0, 'the catalog has rules');

    const claude = getTarget('claude');
    const antigravity = getTarget('antigravity');
    const options = { projectDir: '.' };

    const claudeByRule = new Map<string, string[]>();
    for (const rule of rules) {
      const data = parseFrontmatter(
        ruleFile(
          await claude.scaffold!(rule.id, catalog, options),
          '.claude/rules/',
          '.md',
          'claude',
        ),
      ).data;
      claudeByRule.set(rule.id, claudeGlobs(data));
    }

    let repoWide = 0;
    let scoped = 0;
    for (const rule of rules) {
      const globs = claudeByRule.get(rule.id)!;

      if (globs.every(g => REPO_WIDE_GLOBS.has(g))) {
        const files = await antigravity.scaffold!(rule.id, catalog, options);
        const path = `.agents/rules/${rule.id.replace(/\//g, '-')}.md`;
        assert.ok(path in files, `Antigravity writes ${path} for ${rule.id}`);
        assert.deepEqual(
          Object.keys(files),
          [path],
          `Antigravity writes only ${path} for ${rule.id}`,
        );

        const data = parseFrontmatter(files[path]!).data;
        assert.equal(data.trigger, 'always_on', `Antigravity writes always_on for ${rule.id}`);
        assert.equal(data.globs, undefined, `Antigravity writes no globs for ${rule.id}`);
        repoWide++;
      } else {
        await assert.rejects(
          () => antigravity.scaffold!(rule.id, catalog, options),
          (err: unknown) => err instanceof SigilError && /ADR probe B1/.test(err.message),
          `Antigravity refuses the scoped rule ${rule.id}`,
        );

        const data = parseFrontmatter(renderArtifact(ANTIGRAVITY_RULE_SPEC, rule, {})).data;
        assert.equal(data.trigger, 'glob', `Antigravity renders glob for ${rule.id}`);
        assert.deepEqual(
          String(data.globs).split(','),
          globs,
          `Antigravity and Claude globs disagree for ${rule.id}`,
        );
        scoped++;
      }
    }

    assert.ok(repoWide > 0, 'at least one repo-wide rule was checked');
    assert.ok(scoped > 0, 'at least one scoped rule was checked');
  });
});
