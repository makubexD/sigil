/**
 * `sigil status` must call an artifact outdated exactly when `sigil update` would rewrite it.
 * Before this, status compared only template revisions: on 2026-10-19 it reported 35 of 36
 * artifacts up to date in a project where `update` then refreshed 15
 * (docs/audits/2026-10-16/results.md, row 13). The wizard's install states render the same way:
 * without the installed set they dropped a Boundary section and called the file outdated.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir, withTempDirAsync } from '../helpers/temp-dir';
import { getAllTargets } from '../../dist-cli/targets';
import { installableKinds } from '../../dist-cli/targets/capabilities';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { resolveCatalog } from '../../dist-cli/resolve';
import { applyProjectOverlays } from '../../dist-cli/overlays';
import { computeInstallStates } from '../../dist-cli/install-state';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'dist-cli/cli.js');

/** One artifact per installable kind; the cli/wizard pair renders each other's Boundary section. */
const PICKS: ReadonlyArray<{ kind: string; id: string; source: string }> = [
  {
    kind: 'rule',
    id: 'typescript/ts-testing',
    source: 'languages/typescript/rules/ts-testing.rule.md',
  },
  { kind: 'skill', id: 'shared/cli', source: 'shared/skills/cli/SKILL.md' },
  { kind: 'skill', id: 'shared/wizard', source: 'shared/skills/wizard/SKILL.md' },
  {
    kind: 'agent',
    id: 'typescript/ts-code-reviewer',
    source: 'languages/typescript/agents/ts-code-reviewer.agent.md',
  },
  { kind: 'hook', id: 'shared/protect-config', source: 'shared/hooks/protect-config.hook.md' },
];

/** Picks whose catalog source the test edits; the others must stay up to date. */
const EDITED = new Set([
  'typescript/ts-testing',
  'shared/cli',
  'typescript/ts-code-reviewer',
  'shared/protect-config',
]);

function sigil(dir: string, catalog: string, ...args: string[]): string {
  return execFileSync(
    process.execPath,
    [
      CLI,
      ...args,
      '--project-dir',
      dir,
      '--catalog-dir',
      path.join(catalog, 'catalog'),
      '--packs',
      path.join(catalog, 'packs.yaml'),
    ],
    { cwd: dir, encoding: 'utf-8' },
  );
}

function outdatedByStatus(dir: string, catalog: string, target: string): string[] {
  const rows = JSON.parse(sigil(dir, catalog, 'status', '--json', '--target', target)) as Array<{
    id: string;
    status: string;
  }>;
  return rows
    .filter(r => r.status === 'outdated')
    .map(r => r.id)
    .sort();
}

function changedByUpdate(dir: string, catalog: string, target: string): string[] {
  const out = sigil(dir, catalog, 'update', '--dry-run', '--target', target);
  return [...new Set([...out.matchAll(/^ {2}↑ {2}(\S+)/gm)].map(m => m[1]!))].sort();
}

/** Copies the catalog and packs.yaml so the test can edit artifact sources. */
function copyCatalog(into: string): void {
  fs.cpSync(path.join(ROOT, 'catalog'), path.join(into, 'catalog'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'packs.yaml'), path.join(into, 'packs.yaml'));
}

function editSources(catalog: string): void {
  for (const pick of PICKS.filter(p => EDITED.has(p.id))) {
    const file = path.join(catalog, 'catalog', pick.source);
    const text = fs.readFileSync(file, 'utf8');
    const edited =
      pick.kind === 'hook'
        ? text.replace('matcher: "Edit|Write"', 'matcher: "Edit|Write|MultiEdit"')
        : `${text.trimEnd()}\n\nA line added after install.\n`;
    assert.notEqual(edited, text, `edit applied to ${pick.source}`);
    fs.writeFileSync(file, edited);
  }
}

const TARGETS = getAllTargets().filter(t => t.scaffold);

describe('status reports what update would change', () => {
  for (const target of TARGETS) {
    const kinds = new Set(installableKinds(target));
    const picks = PICKS.filter(p => kinds.has(p.kind as never));

    it(`${target.name}: nothing outdated right after install, then exactly what update rewrites`, () => {
      withTempDir(work => {
        const catalog = path.join(work, 'src');
        const project = path.join(work, 'project');
        fs.mkdirSync(project);
        copyCatalog(catalog);
        // An overlay narrows the rule: status must render with it, as add and update do.
        fs.mkdirSync(path.join(project, '.sigil'));
        fs.writeFileSync(
          path.join(project, '.sigil/overlays.yaml'),
          'rules:\n  typescript/ts-testing:\n    scope: [src]\n',
        );
        const specs = picks.map(p => `${p.kind}:${p.id}`);
        sigil(project, catalog, 'add', ...specs, '--target', target.name, '--yes');

        assert.deepEqual(outdatedByStatus(project, catalog, target.name), [], 'fresh install');

        editSources(catalog);
        const expected = picks
          .filter(p => EDITED.has(p.id))
          .map(p => p.id)
          .sort();
        assert.deepEqual(
          changedByUpdate(project, catalog, target.name),
          expected,
          'update preview',
        );
        assert.deepEqual(outdatedByStatus(project, catalog, target.name), expected, 'status');
      });
    });
  }
});

describe('install states agree with update', () => {
  for (const target of TARGETS) {
    const kinds = new Set(installableKinds(target));
    const picks = PICKS.filter(p => kinds.has(p.kind as never));

    it(`${target.name}: every pick is up to date right after install`, async () => {
      await withTempDirAsync(async project => {
        const specs = picks.map(p => `${p.kind}:${p.id}`);
        sigil(project, ROOT, 'add', ...specs, '--target', target.name, '--yes');
        const { catalog } = await loadAndValidate(
          path.join(ROOT, 'catalog'),
          path.join(ROOT, 'packs.yaml'),
        );
        const { resolved } = applyProjectOverlays(resolveCatalog(catalog), project);

        const states = await computeInstallStates({
          candidateIds: picks.map(p => p.id),
          target,
          catalog: resolved,
          projectDir: project,
        });

        const notUpToDate = [...states.values()].filter(s => s.state !== 'up-to-date');
        assert.deepEqual(notUpToDate, []);
      });
    });
  }
});

/** Hashes every file under `dir`, so a test can prove a command wrote nothing. */
function treeHash(dir: string): string {
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(rel => fs.statSync(path.join(dir, rel)).isFile())
    .sort();
  return files.map(rel => `${rel}\0${fs.readFileSync(path.join(dir, rel), 'utf8')}`).join('\0');
}

describe('status and update agree on the edge cases', () => {
  const claude = TARGETS.find(t => t.name === 'claude')!;

  /** A copied catalog and a project with `specs` installed for Claude Code. */
  function setUp(work: string, specs: string[], overlays?: string): [string, string] {
    const catalog = path.join(work, 'src');
    const project = path.join(work, 'project');
    fs.mkdirSync(path.join(project, '.sigil'), { recursive: true });
    copyCatalog(catalog);
    if (overlays) fs.writeFileSync(path.join(project, '.sigil/overlays.yaml'), overlays);
    sigil(project, catalog, 'add', ...specs, '--target', 'claude', '--yes');
    return [catalog, project];
  }

  function agree(project: string, catalog: string, expected: string[]): void {
    const before = treeHash(project);
    assert.deepEqual(changedByUpdate(project, catalog, 'claude'), expected, 'update preview');
    assert.deepEqual(outdatedByStatus(project, catalog, 'claude'), expected, 'status');
    assert.equal(treeHash(project), before, 'status and a preview write nothing');
  }

  it('a removed output path: the skill is outdated, in status and in the install states', async () => {
    await withTempDirAsync(async work => {
      const [catalog, project] = setUp(work, ['skill:shared/cli']);
      fs.rmSync(path.join(catalog, 'catalog/languages/go/stack-parts/cli.md'));

      agree(project, catalog, ['shared/cli']);
      const { catalog: loaded } = await loadAndValidate(
        path.join(catalog, 'catalog'),
        path.join(catalog, 'packs.yaml'),
      );
      const states = await computeInstallStates({
        candidateIds: ['shared/cli'],
        target: claude,
        catalog: resolveCatalog(loaded),
        projectDir: project,
      });
      assert.equal(states.get('shared/cli')?.state, 'outdated');
    });
  });

  it('a refused overlay: update leaves the rule as installed, so status does too', () => {
    withTempDir(work => {
      const [catalog, project] = setUp(
        work,
        ['rule:typescript/ts-testing'],
        'rules:\n  typescript/ts-testing:\n    scope: [src]\n',
      );
      fs.writeFileSync(
        path.join(project, '.sigil/overlays.yaml'),
        'rules:\n  typescript/ts-testing:\n    scope: []\n',
      );
      agree(project, catalog, []);
    });
  });

  it('a template revision that leaves the render unchanged is not outdated', () => {
    withTempDir(work => {
      const [catalog, project] = setUp(work, ['rule:typescript/ts-code-quality']);
      const template = path.join(catalog, 'catalog/shared/templates/code-quality.template.md');
      const text = fs.readFileSync(template, 'utf8');
      const bumped = text.replace(
        /^revision: (\d+)$/m,
        (_, n: string) => `revision: ${Number(n) + 1}`,
      );
      assert.notEqual(bumped, text);
      fs.writeFileSync(template, bumped);
      agree(project, catalog, []);
    });
  });
});
