/**
 * A language skill (`py-generate-tests`) and an existing project command or skill named without
 * the language prefix (`generate-tests`) do the same job. The Claude install says so once, and
 * says nothing when installing for a target that does not read `.claude/`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

async function install(
  dir: string,
  target: string,
  selector: string,
  dryRun = true,
): Promise<string> {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await runAdd([selector], {
      projectDir: dir,
      catalogDir: CATALOG,
      packs: PACKS,
      target,
      deps: false,
      dryRun,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    });
  } finally {
    console.warn = original;
  }
  return lines.join('\n');
}

function writeCommand(dir: string, name: string): void {
  const commands = path.join(dir, '.claude', 'commands');
  fs.mkdirSync(commands, { recursive: true });
  fs.writeFileSync(path.join(commands, `${name}.md`), '');
}

function makeSkillDir(dir: string, name: string): void {
  fs.mkdirSync(path.join(dir, '.claude', 'skills', name), { recursive: true });
}

describe('sigil add — command overlap notes', () => {
  it('should warn when a command without the language prefix already exists', async () => {
    await withTempDirAsync(async dir => {
      writeCommand(dir, 'generate-tests');

      const out = await install(dir, 'claude', 'skill:python/py-generate-tests');

      assert.match(
        out,
        /python\/py-generate-tests overlaps \.claude\/commands\/generate-tests\.md; keep one\./,
      );
      assert.equal(out.match(/overlaps \.claude\//g)?.length, 1);
    });
  });

  it('should say nothing when no unprefixed command exists', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, 'claude', 'skill:python/py-generate-tests');

      assert.doesNotMatch(out, /overlaps \.claude\//);
    });
  });

  it('should warn when an unprefixed skill directory already exists', async () => {
    await withTempDirAsync(async dir => {
      makeSkillDir(dir, 'sync-tests');

      const out = await install(dir, 'claude', 'skill:python/py-sync-tests');

      assert.match(
        out,
        /python\/py-sync-tests overlaps \.claude\/skills\/sync-tests\/; keep one\./,
      );
    });
  });

  it('should say nothing for a target that does not read .claude/', async () => {
    await withTempDirAsync(async dir => {
      writeCommand(dir, 'generate-tests');

      const out = await install(dir, 'cursor', 'skill:python/py-generate-tests');

      assert.doesNotMatch(out, /overlaps \.claude\//);
    });
  });
});
