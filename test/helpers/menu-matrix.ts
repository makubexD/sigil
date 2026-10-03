/**
 * Every folder state the home menu can meet, built from independent axes, plus the rules that must
 * hold for all of them. The menu is pure, so thousands of cells cost nothing and a new state
 * (a third AI tool, a damaged record) is covered by adding a value to an axis.
 */
import assert from 'node:assert/strict';
import { recommendNext, toolsToSetUp } from '../../dist-cli/project-context';
import type { ProjectContext } from '../../dist-cli/project-context';
import { buildMenu, describeContext } from '../../dist-cli/wizard/home-menu';
import { buildNextMenu, nextSummary } from '../../dist-cli/wizard/home-next';
import { toolList, toolName } from '../../dist-cli/tool-names';

type Health = ProjectContext['health'];

const NONE: Health = { 'up-to-date': 0, outdated: 0, drifted: 0, orphaned: 0, missing: 0 };

const FOLDERS: Record<string, Partial<ProjectContext>> = {
  project: {},
  empty: { looksLikeProject: false },
  catalog: { isCatalogCheckout: true },
  home: { isHomeDir: true },
  root: { isFilesystemRoot: true },
};

const INSTALLS: Record<string, { installed: number; health: Health }> = {
  none: { installed: 0, health: NONE },
  healthy: { installed: 3, health: { ...NONE, 'up-to-date': 3 } },
  missing: { installed: 3, health: { ...NONE, 'up-to-date': 2, missing: 1 } },
  outdated: { installed: 3, health: { ...NONE, 'up-to-date': 2, outdated: 1 } },
};

/** Every subset of `names`, the empty one first. */
export function subsets(names: readonly string[]): string[][] {
  return Array.from({ length: 2 ** names.length }, (_, mask) =>
    names.filter((_name, bit) => (mask >> bit) & 1),
  );
}

export interface Cell {
  label: string;
  ctx: ProjectContext;
}

/** The whole grid for the given tools. */
export function cells(tools: readonly string[]): Cell[] {
  const out: Cell[] = [];
  for (const [folder, folderState] of Object.entries(FOLDERS)) {
    for (const detected of subsets(tools)) {
      for (const [installs, state] of Object.entries(INSTALLS)) {
        for (const damaged of [false, true]) {
          const installed = damaged ? 0 : state.installed;
          const owner = detected[0] ?? tools[0] ?? 'claude';
          out.push({
            label: `${folder} | tools [${detected.join(',')}] | installs ${installs}${damaged ? ' | damaged' : ''}`,
            ctx: {
              projectDir: '/work/app',
              detectedTargets: detected,
              manifestPresent: installed > 0 || damaged,
              installed,
              installedByTarget: installed > 0 ? { [owner]: installed } : {},
              health: damaged ? NONE : state.health,
              isCatalogCheckout: false,
              looksLikeProject: true,
              isHomeDir: false,
              isFilesystemRoot: false,
              ...folderState,
              ...(damaged ? { manifestError: 'bad json' } : {}),
            },
          });
        }
      }
    }
  }
  return out;
}

const HARDCODED_LIST = /Claude Code or Copilot|\bboth\b/i;

/** The rules every menu must follow, whatever the folder and however many tools exist. */
export function checkCell({ label, ctx }: Cell, allTools: readonly string[]): void {
  const fail = (what: string): string => `${label}: ${what}`;
  const menu = buildMenu(ctx);
  const values = menu.map(item => item.value);
  const recs = recommendNext(ctx);

  for (const rec of recs)
    assert.ok(values.includes(rec.action), fail(`'${rec.action}' is advised but not shown`));
  assert.ok(
    menu.filter(item => item.recommended).length <= 1,
    fail('more than one recommended entry'),
  );
  if (recs[0]) assert.equal(menu[0]?.value, recs[0].action, fail('the top advice is not first'));
  assert.deepEqual(values.slice(-2), ['help', 'quit'], fail('help and quit must end the menu'));

  const left = toolsToSetUp(ctx.detectedTargets);
  assert.equal(
    values.includes('init'),
    left.length > 0,
    fail('set-up entry shown only while a tool is left'),
  );
  assert.equal(
    values.includes('install'),
    ctx.manifestError === undefined,
    fail('install hidden only when damaged'),
  );
  assert.equal(
    values.includes('restore'),
    ctx.health.missing > 0,
    fail('restore shown only when files are missing'),
  );
  if (ctx.manifestError) {
    assert.ok(
      recs.every(r => r.action === 'repair' || r.action === 'change-folder'),
      fail('a damaged record advises repair only'),
    );
  }
  if (recs.length === 0) {
    assert.notEqual(values[0], 'init', fail('with no advice, Enter must not add a second tool'));
  }
  checkInitEntry(label, ctx, menu, left, allTools);
  checkWording(label, ctx, menu);
  checkNextMenus(label, ctx);
}

/** The short menu after an install or a set up: only when nothing more urgent than install is advised. */
function checkNextMenus(label: string, ctx: ProjectContext): void {
  const top = recommendNext(ctx)[0];
  const urgent = top !== undefined && top.action !== 'install';
  const left = toolsToSetUp(ctx.detectedTargets);
  for (const after of ['install', 'init'] as const) {
    const where = `${label} | after ${after}`;
    const next = buildNextMenu(ctx, after);
    assert.equal(next === undefined, urgent, `${where}: short menu only without urgent advice`);
    if (!next) continue;
    const values = next.map(item => item.value);
    assert.equal(values[0], after === 'install' ? 'quit' : 'install', `${where}: first row`);
    for (const needed of ['quit', 'install', 'all'] as const) {
      assert.ok(values.includes(needed), `${where}: missing '${needed}'`);
    }
    assert.equal(values.includes('init'), after === 'install' && left.length > 0, `${where}: init`);
    assert.equal(
      values.includes('status'),
      after === 'install' && ctx.installed > 0,
      `${where}: check`,
    );
    assert.ok(next.length <= 5, `${where}: short means short`);
    const lines = [nextSummary(ctx), ...next.flatMap(item => [item.label, item.hint])];
    for (const line of lines) {
      assert.doesNotMatch(line, /\n|recommended|\bboth\b/i, `${where}: ${JSON.stringify(line)}`);
    }
  }
}

function checkInitEntry(
  label: string,
  ctx: ProjectContext,
  menu: ReturnType<typeof buildMenu>,
  left: string[],
  allTools: readonly string[],
): void {
  const init = menu.find(item => item.value === 'init');
  if (!init) return;
  if (ctx.detectedTargets.length === 0) {
    assert.equal(init.label.replace(' (recommended)', ''), 'Set up this project', label);
    assert.ok(init.hint.includes(toolName(allTools[0] ?? '')), `${label}: hint names the tools`);
    return;
  }
  for (const name of ctx.detectedTargets) {
    assert.ok(
      !init.label.includes(toolName(name)),
      `${label}: label names a tool that is already set up`,
    );
  }
  const expected =
    left.length === 1 ? `Also set up for ${toolList(left)}` : 'Set up another AI tool';
  assert.equal(init.label.replace(' (recommended)', ''), expected, label);
}

function checkWording(
  label: string,
  ctx: ProjectContext,
  menu: ReturnType<typeof buildMenu>,
): void {
  const lines = [...describeContext(ctx), ...menu.flatMap(item => [item.label, item.hint])];
  for (const line of lines) {
    assert.doesNotMatch(
      line,
      /\n(?!$)/,
      `${label}: a line spans several lines: ${JSON.stringify(line)}`,
    );
    assert.doesNotMatch(line, HARDCODED_LIST, `${label}: hardcoded provider wording: ${line}`);
  }
}
