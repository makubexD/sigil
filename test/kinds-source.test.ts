/**
 * Where each kind's source file lives is declared once, on KIND_REGISTRY (`sourceDir`,
 * `sourceSuffix`). Loading, kind inference, `sigil new` and `sigil move` all derive from it, so a
 * kind can't be written to one folder and looked for in another (`settings` once went to
 * `settingss/`), and a new kind is covered everywhere by its registry entry alone.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_KINDS, kindOfSourceFile, sourceRelPath } from '../dist-cli/kinds';
import { computeDestinationPath } from '../dist-cli/authoring/move/plan';
import { runNew } from '../dist-cli/commands/new';
import { loadCatalog } from '../dist-cli/load';
import { withTempDirAsync } from './helpers/temp-dir';

const posix = (p: string) => p.split(path.sep).join('/');

describe('kind source layout', () => {
  it('should place each kind in its own folder with its own file name', () => {
    assert.deepEqual(
      Object.fromEntries(ALL_KINDS.map(kind => [kind, posix(sourceRelPath(kind, 'x'))])),
      {
        mcp: 'mcps/x.mcp.md',
        hook: 'hooks/x.hook.md',
        settings: 'settings/x.settings.md',
        prompt: 'prompts/x.prompt.md',
        skill: 'skills/x/SKILL.md',
        agent: 'agents/x.agent.md',
        rule: 'rules/x.rule.md',
        workflow: 'workflows/x.workflow.md',
        template: 'templates/x.template.md',
      },
    );
  });

  for (const kind of ALL_KINDS) {
    it(`should read the ${kind} kind back from its own file name`, () => {
      assert.equal(kindOfSourceFile(path.basename(sourceRelPath(kind, 'x'))), kind);
    });
  }

  it('should not guess a kind for an unrelated file', () => {
    assert.equal(kindOfSourceFile('README.md'), undefined);
  });

  it('should load an artifact of every kind from where sourceRelPath puts it', async () => {
    await withTempDirAsync(async root => {
      for (const kind of ALL_KINDS) {
        const file = path.join(root, 'shared', sourceRelPath(kind, `probe-${kind}`));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `---\nid: shared/probe-${kind}\nkind: ${kind}\n---\n`);
      }
      const loaded = (await loadCatalog(root)).artifacts.map(a => a.kind).sort();
      assert.deepEqual(loaded, [...ALL_KINDS].sort());
    });
  });
});

describe('sigil move destination', () => {
  it('should move a settings artifact into settings/, not settingss/', () => {
    const dest = posix(computeDestinationPath('shared/x', 'settings', '/c'));
    assert.match(dest, /\/shared\/settings\/x\.settings\.md$/);
  });

  it('should keep a template under templates/ with its three-part id', () => {
    const dest = posix(computeDestinationPath('shared/templates/x', 'template', '/c'));
    assert.match(dest, /\/shared\/templates\/x\.template\.md$/);
  });
});

describe('sigil new destination', () => {
  it('should create a settings artifact under settings/', async () => {
    await withTempDirAsync(async root => {
      await runNew('settings', { name: 'probe', catalogDir: root, yes: true, interactive: false });
      assert.ok(fs.existsSync(path.join(root, 'shared', 'settings', 'probe.settings.md')));
    });
  });
});
