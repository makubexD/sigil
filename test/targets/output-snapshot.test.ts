/**
 * Output snapshot: everything sigil writes for the bundled catalog, hashed per file and compared with
 * a committed baseline. A refactor of the target layer must leave every hash unchanged; a deliberate
 * content change regenerates the baseline (`npm run snapshot:update`) and the diff is reviewed.
 *
 * Covers `build` (dist/claude, dist/copilot, registry.json) and `add` into a project for both targets
 * — skills with references and `uses`, a rule with `extends`, a templated skill, a prompt, and config
 * kinds merged into JSON the user already had — plus a partial install (the Boundary section lists
 * only installed siblings) and an `update` run over the install. In-process: no CLI is spawned.
 *
 * Only values that change between runs are masked: `installedAt`, `generatedAt`, and the package
 * version stamped into JSON. Keys are POSIX paths, and content must be LF-only on every OS.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runBuild } from '../../dist-cli/commands/build';
import { runUpdate } from '../../dist-cli/commands/update';
import { withTempDirAsync } from '../helpers/temp-dir';

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = path.join(ROOT, 'catalog');
const PACKS = path.join(ROOT, 'packs.yaml');
const BASELINE_DIR = path.join(ROOT, 'test', 'fixtures', 'output-snapshot');
const UPDATE = process.env.SIGIL_SNAPSHOT_UPDATE === '1';
const PKG_VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

const MASKED_KEYS = new Set(['installedAt', 'generatedAt']);
const VERSION_KEYS = new Set(['version', 'sigilVersion']);
const JSON_INDENT = 2;

/** One artifact of each shape the emitters treat differently. */
const FULL_SELECTION = [
  'skill:csharp/cs-generate-tests',
  'skill:shared/cli',
  'skill:typescript/ts-release',
  'rule:angular/ng-conventions',
  'prompt:shared/explain-diff',
  'mcp:shared/filesystem',
  'hook:shared/protect-config',
  'settings:shared/allow-dev-tools',
];

/** Config files the user already has, so the snapshot covers merging, not only creating. */
const USER_CONFIG: Record<string, unknown> = {
  '.claude/settings.json': { model: 'user-choice', permissions: { allow: ['Bash(make test)'] } },
  '.mcp.json': { mcpServers: { 'user-server': { command: 'user-mcp' } } },
  '.vscode/mcp.json': { servers: { 'user-server': { command: 'user-mcp' } } },
};

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (MASKED_KEYS.has(key)) out[key] = '<masked>';
    else if (VERSION_KEYS.has(key) && v === PKG_VERSION) out[key] = '<version>';
    else out[key] = mask(v);
  }
  return out;
}

function normalize(relPath: string, content: string): string {
  if (!relPath.endsWith('.json')) return content;
  return JSON.stringify(mask(JSON.parse(content)), null, JSON_INDENT);
}

/** Every file under `dir`, keyed by POSIX path, valued by the sha256 of its normalized content. */
function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(dir, full).split(path.sep).join('/');
      const content = fs.readFileSync(full, 'utf8');
      assert.ok(!content.includes('\r'), `${rel} contains a carriage return`);
      out[rel] = crypto.createHash('sha256').update(normalize(rel, content)).digest('hex');
    }
  };
  walk(dir);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Compares with the committed baseline, or rewrites it under SIGIL_SNAPSHOT_UPDATE=1. */
function matchBaseline(name: string, actual: Record<string, string>): void {
  const file = path.join(BASELINE_DIR, `${name}.json`);
  if (UPDATE) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(actual, null, JSON_INDENT) + '\n');
    return;
  }
  assert.ok(fs.existsSync(file), `no baseline for ${name}; run npm run snapshot:update`);
  const expected = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter(key => expected[key] !== actual[key])
    .map(key => (!(key in actual) ? `- ${key}` : !(key in expected) ? `+ ${key}` : `~ ${key}`));
  assert.deepEqual(
    changed,
    [],
    `${name} output changed (- removed, + added, ~ changed). If intended, run npm run snapshot:update and review the diff.`,
  );
}

function seedUserConfig(dir: string): void {
  for (const [rel, content] of Object.entries(USER_CONFIG)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content, null, JSON_INDENT) + '\n');
  }
}

async function add(dir: string, target: string, selectors: string[], deps = true): Promise<void> {
  await runAdd(selectors, {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target,
    deps,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

describe('output snapshot', () => {
  it('should build dist/ for every target exactly as the baseline', async () => {
    await withTempDirAsync(async dir => {
      await runBuild({ target: 'all', catalogDir: CATALOG, packs: PACKS, outDir: dir });
      matchBaseline('build', hashTree(dir));
    });
  });

  for (const target of ['claude', 'copilot']) {
    it(`should install a full selection for ${target} exactly as the baseline`, async () => {
      await withTempDirAsync(async dir => {
        seedUserConfig(dir);
        await add(dir, target, FULL_SELECTION);
        matchBaseline(`add-${target}`, hashTree(dir));
      });
    });

    it(`should install a lone skill for ${target} exactly as the baseline`, async () => {
      await withTempDirAsync(async dir => {
        await add(dir, target, ['skill:shared/cli'], false);
        matchBaseline(`add-partial-${target}`, hashTree(dir));
      });
    });

    it(`should leave a fresh ${target} install unchanged on update`, async () => {
      await withTempDirAsync(async dir => {
        seedUserConfig(dir);
        await add(dir, target, FULL_SELECTION);
        const before = hashTree(dir);
        await runUpdate([], {
          projectDir: dir,
          target,
          catalogDir: CATALOG,
          packs: PACKS,
          force: false,
          dryRun: false,
          yes: true,
        });
        assert.deepEqual(hashTree(dir), before);
      });
    });
  }
});
