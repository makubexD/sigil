/**
 * `sigil import --from copilot` reads a Copilot `.github/` layout, and an import with the default
 * Claude layout points a Copilot-looking project at the flag. These run the real compiled CLI, the
 * way the other test/commands suites do.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');

/** All four Copilot artifact folders, plus a single-file instruction that is reported, not imported. */
const COPILOT_FILES: Record<string, string> = {
  '.github/instructions/sample-rule.instructions.md':
    '---\napplyTo: "src/**/*.ts"\n---\n\n- **Rule.** Keep it short.\n',
  '.github/agents/sample-agent.agent.md':
    '---\nname: sample-agent\ndescription: Reviews changes.\ntools: [read, search]\n---\n\nReview the diff.\n',
  '.github/skills/sample-skill/SKILL.md':
    '---\nname: sample-skill\ndescription: Sample skill. Use when testing import.\n---\n\nUse this skill.\n',
  '.github/prompts/sample-prompt.prompt.md':
    '---\ndescription: Explain a change.\n---\n\nExplain ${input:change}.\n',
  '.github/copilot-instructions.md': '# House rules\n',
};

/** Writes each relative path under `root`, creating parent folders. */
function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

/** A project holding the fixture, and an empty catalog to import into. */
function setup(root: string, files = COPILOT_FILES): { project: string; catalog: string } {
  const project = path.join(root, 'project');
  writeTree(project, files);
  const catalog = path.join(root, 'catalog');
  fs.mkdirSync(path.join(catalog, 'shared'), { recursive: true });
  return { project, catalog };
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the compiled CLI in `cwd` and returns its exit code and streams. */
function sigil(cwd: string, args: string[]): CliResult {
  const done = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
  });
  return { status: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? '' };
}

const FOUR_KINDS = [
  'instructions/sample-rule.instructions.md',
  'agents/sample-agent.agent.md',
  'skills/sample-skill/SKILL.md',
  'prompts/sample-prompt.prompt.md',
];

describe('sigil import --from copilot', () => {
  it('should list all four kinds in a dry run, report unrecognised files, and write nothing', () => {
    withTempDir(root => {
      const { project, catalog } = setup(root);
      const args = ['import', project, '--from', 'copilot', '--language', 'x', '--dry-run'];
      const done = sigil(root, [...args, '--catalog-dir', catalog]);
      assert.equal(done.status, 0, done.stderr);
      for (const name of FOUR_KINDS) assert.ok(done.stdout.includes(name), `missing ${name}`);
      assert.match(done.stdout, /Unrecognised files \(not imported\):/);
      assert.match(done.stdout, /copilot-instructions\.md {2}— not imported: single-file/);
      assert.match(done.stdout, /\[dry-run\] No files written\./);
      assert.equal(fs.existsSync(path.join(catalog, 'languages')), false);
    });
  });

  it('should fail when the source has no .github/ folder', () => {
    withTempDir(root => {
      const { catalog } = setup(root, {});
      const done = sigil(root, [
        'import',
        root,
        '--from',
        'copilot',
        '--language',
        'x',
        '--dry-run',
        '--catalog-dir',
        catalog,
      ]);
      assert.notEqual(done.status, 0);
      assert.match(done.stderr, /No \.github\/ folder in /);
    });
  });

  it('should reject an unknown layout before writing anything', () => {
    withTempDir(root => {
      const { project, catalog } = setup(root);
      const done = sigil(root, [
        'import',
        project,
        '--from',
        'nope',
        '--language',
        'x',
        '--create-language',
        '--yes',
        '--catalog-dir',
        catalog,
      ]);
      assert.notEqual(done.status, 0);
      assert.match(done.stderr, /Unknown layout 'nope': use claude or copilot\./);
      assert.equal(fs.existsSync(path.join(catalog, 'languages', 'x', 'language.yaml')), false);
    });
  });

  it('should suggest --from copilot when a .github/ project finds nothing', () => {
    withTempDir(root => {
      const { project, catalog } = setup(root);
      const done = sigil(root, [
        'import',
        project,
        '--language',
        'x',
        '--dry-run',
        '--catalog-dir',
        catalog,
      ]);
      assert.equal(done.status, 0, done.stderr);
      assert.match(done.stdout, /Nothing to import\./);
      assert.match(done.stdout, /This looks like a Copilot layout: re-run with --from copilot\./);
    });
  });

  it('should import a Claude template unchanged and print no hint', () => {
    withTempDir(root => {
      const { catalog } = setup(root);
      const source = path.join(root, 'claude-source');
      writeTree(source, {
        'rules/style.md':
          '---\ndescription: House style.\npaths: ["**/*.ts"]\n---\n\n- Keep it short.\n',
      });
      const done = sigil(root, [
        'import',
        source,
        '--shared',
        '--dry-run',
        '--catalog-dir',
        catalog,
      ]);
      assert.equal(done.status, 0, done.stderr);
      assert.match(done.stdout, /style\.md/);
      assert.doesNotMatch(done.stdout, /This looks like a Copilot layout/);
    });
  });

  it('should print each discovery note as `    note: <text>`', () => {
    withTempDir(root => {
      const rule = '---\ndescription: House style.\n---\n\n- Keep it short.\n';
      const { project, catalog } = setup(root, {
        '.github/instructions/no-scope.instructions.md': rule,
      });
      const done = sigil(root, [
        'import',
        project,
        '--from',
        'copilot',
        '--language',
        'x',
        '--dry-run',
        '--catalog-dir',
        catalog,
      ]);
      assert.equal(done.status, 0, done.stderr);
      assert.ok(
        done.stdout.includes(
          '    note: no applyTo in source; imported as **/*, which applies to every file',
        ),
        done.stdout,
      );
    });
  });

  it('should write the four kinds and leave a catalog that passes sigil validate', () => {
    withTempDir(root => {
      const { project, catalog } = setup(root);
      writeTree(catalog, {
        'languages/x/language.yaml': 'displayName: X\nprefix: x\nstack: x\n',
      });
      const imported = sigil(root, [
        'import',
        project,
        '--from',
        'copilot',
        '--language',
        'x',
        '--yes',
        '--overwrite',
        '--catalog-dir',
        catalog,
      ]);
      assert.equal(imported.status, 0, imported.stderr);
      const validated = sigil(root, ['validate', '--catalog-dir', catalog]);
      assert.equal(validated.status, 0, validated.stderr);
    });
  });
});
