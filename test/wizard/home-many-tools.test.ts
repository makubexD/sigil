/**
 * The menu with more than two AI tools: every real tool plus two extra ones this file registers,
 * so it must stay in its own file (the registry is per process and has no way to remove a tool
 * again). Expectations derive from the registry, so a new real tool needs no edit here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAllTargets, getTarget, registerTarget } from '../../dist-cli/targets';
import type { Target } from '../../dist-cli/types';
import { initTargetOptions } from '../../dist-cli/commands/init-guided';
import { runInit } from '../../dist-cli/commands/init';
import { buildMenu } from '../../dist-cli/wizard/home-menu';
import { toolsToSetUp } from '../../dist-cli/project-context';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';
import { cells, checkCell } from '../helpers/menu-matrix';
import { toolList } from '../../dist-cli/tool-names';

/** A copy of an existing tool under another name, with its own folders. */
function clone(base: Target, name: string, displayName: string): Target {
  const copy = Object.create(Object.getPrototypeOf(base)) as Target;
  Object.defineProperties(copy, Object.getOwnPropertyDescriptors(base));
  const own = (value: unknown) => ({ value, enumerable: true, configurable: true });
  Object.defineProperties(copy, {
    name: own(name),
    displayName: own(displayName),
    initDirs: own([`.${name}/rules`]),
    projectMarkers: own([`.${name}`]),
  });
  return copy;
}

registerTarget(clone(getTarget('copilot'), 'acme', 'Acme AI'));
registerTarget(clone(getTarget('copilot'), 'zeta', 'Zeta AI'));

const ctx = (detectedTargets: string[]) => ({
  projectDir: '/work/app',
  detectedTargets,
  manifestPresent: false,
  installed: 0,
  installedByTarget: {},
  health: { 'up-to-date': 0, outdated: 0, drifted: 0, orphaned: 0, missing: 0 },
  isCatalogCheckout: false,
  looksLikeProject: true,
  isHomeDir: false,
  isFilesystemRoot: false,
});

const initEntry = (detected: string[]) => buildMenu(ctx(detected)).find(i => i.value === 'init');

describe('home menu with every real tool plus two extra ones', () => {
  const tools = getAllTargets().map(t => t.name);
  const without = (set: readonly string[]) => tools.filter(name => !set.includes(name));

  it('should have registered the two extra tools after the real ones', () => {
    assert.deepEqual(tools.slice(-2), ['acme', 'zeta']);
    assert.ok(tools.length >= 4);
  });

  it('should satisfy every menu rule in every folder state', () => {
    const grid = cells(tools);
    assert.ok(grid.length >= 640);
    for (const cell of grid) checkCell(cell, tools);
  });

  it('should not list every tool in the set-up hint of an empty folder', () => {
    const hint = initEntry([])?.hint.split('. ')[0] ?? '';
    assert.equal(hint, `Create the folders for ${toolList(tools, 'or')}`);
    assert.match(hint, /or [0-9]+ more$/);
  });

  it('should stay generic while several tools are left, and name the last one', () => {
    assert.equal(initEntry(['claude'])?.label, 'Set up another AI tool');
    assert.equal(
      initEntry(['claude'])?.hint,
      `Choose one of ${toolList(without(['claude']), 'or')}`,
    );
    assert.equal(initEntry(tools.slice(0, -1))?.label, 'Also set up for Zeta AI');
    assert.equal(initEntry(tools), undefined);
  });

  it('should offer only the tools not set up yet, the rest after them', () => {
    const order = initTargetOptions(['claude', 'acme']).map(o => o.value);
    assert.deepEqual(order, [...without(['claude', 'acme']), 'claude', 'acme']);
    assert.deepEqual(toolsToSetUp(['claude', 'acme']), without(['claude', 'acme']));
  });

  it('should ask only among the tools that are left, and set up the one chosen', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.claude'));
      fs.mkdirSync(path.join(dir, '.acme'));
      const rec = createRecorder();
      const restoreTTY = fakeTTY();
      const restore = mockClack(['zeta'], rec);
      const original = console.log;
      console.log = () => {};
      try {
        await runInit({ projectDir: dir, only: toolsToSetUp(['claude', 'acme']) });
      } finally {
        console.log = original;
        restore();
        restoreTTY();
      }
      assert.deepEqual(
        rec.prompts[0]?.options.map(o => o.value),
        without(['claude', 'acme']),
      );
      assert.equal(fs.existsSync(path.join(dir, '.zeta/rules')), true);
      assert.equal(fs.existsSync(path.join(dir, '.github')), false);
    });
  });
});
