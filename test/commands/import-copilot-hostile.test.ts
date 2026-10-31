/**
 * `.github/` folders are untrusted input. Each case here came from attacking the real CLI: a small
 * file that must not hang import, widen an agent's access, or reach outside the source folder.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseYamlFrontmatter } from '../../dist-cli/frontmatter-parse';
import { normalizeCopilotBody } from '../../dist-cli/authoring/import/copilot-body';
import { discoverCopilotFiles } from '../../dist-cli/authoring/import/discover-copilot';
import { translateFrontmatter } from '../../dist-cli/authoring/import/translate';
import { reverseLexicon } from '../../dist-cli/targets/lexicon';
import { getTarget } from '../../dist-cli/targets/index';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const IMPORT_TIMEOUT_MS = 20_000;
const ALIAS_DEPTH = 34;
const CONTROL_CHAR_RE = /\p{Cc}/u;

/** Writes `files` under `root`, creating parent folders. */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

/** Runs `sigil import <source> <args>` against an empty catalog in `root`. */
function runImport(root: string, source: string, args: string[]) {
  const catalogDir = path.join(root, 'catalog');
  fs.mkdirSync(path.join(catalogDir, 'shared'), { recursive: true });
  const cli = [CLI, 'import', source, ...args, '--catalog-dir', catalogDir];
  const result = spawnSync(process.execPath, cli, { encoding: 'utf8', timeout: IMPORT_TIMEOUT_MS });
  return { ...result, output: result.stdout + result.stderr, catalogDir };
}

const COPILOT_ARGS = ['--from', 'copilot', '--language', 'x', '--create-language', '--yes'];

/** Prompt frontmatter whose `args` doubles at every alias, 2^33 items once written out. */
function aliasBomb(): string {
  const lines = ['a0: &a0 [{name: x}]'];
  for (let i = 1; i < ALIAS_DEPTH; i++) lines.push(`a${i}: &a${i} [*a${i - 1}, *a${i - 1}]`);
  return lines.join('\n');
}

describe('sigil import --from copilot on hostile files', () => {
  it('should finish on a YAML alias bomb in a prompt', () => {
    withTempDir(root => {
      const bomb = `---\ndescription: d\n${aliasBomb()}\nargs: *a${ALIAS_DEPTH - 1}\n---\n\nBody.\n`;
      writeFiles(root, { 'p/.github/prompts/b.prompt.md': bomb });
      const result = runImport(root, path.join(root, 'p'), COPILOT_ARGS);
      assert.equal(result.signal, null, 'import must not hang');
      assert.equal(result.status, 0, result.output);
    });
  });

  it('should finish on a prompt arg list that contains itself', () => {
    withTempDir(root => {
      const cycle = '---\ndescription: d\nargs: &a\n  - *a\n---\n\nBody.\n';
      writeFiles(root, { 'p/.github/prompts/c.prompt.md': cycle });
      const result = runImport(root, path.join(root, 'p'), COPILOT_ARGS);
      assert.equal(result.signal, null, 'import must not hang');
      assert.equal(result.status, 0, result.output);
    });
  });

  it('should refuse a symlinked .github', () => {
    withTempDir(root => {
      writeFiles(root, { 'elsewhere/agents/x.agent.md': '---\ndescription: d\n---\n\nBody.\n' });
      fs.mkdirSync(path.join(root, 'p'));
      fs.symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'p/.github'));
      const result = runImport(root, path.join(root, 'p'), COPILOT_ARGS);
      assert.notEqual(result.status, 0);
      assert.match(result.output, /symbolic link/);
    });
  });

  it('should mask control characters in the report', () => {
    withTempDir(root => {
      const agent =
        '---\ndescription: d\nname: "\\e[2Jpwn"\ntools: [read]\n"\\e[2Jkey": 1\n---\n\nB\n';
      writeFiles(root, { 'p/.github/agents/e.agent.md': agent });
      const result = runImport(root, path.join(root, 'p'), COPILOT_ARGS);
      const reported = result.stdout.split('\n').filter(l => /note: name|dropped source/.test(l));
      assert.equal(reported.length, 2, result.output);
      for (const line of reported) assert.doesNotMatch(line, CONTROL_CHAR_RE);
    });
  });
});

describe('sigil import layouts', () => {
  it('should suggest --from copilot when pointed at .github without it', () => {
    withTempDir(root => {
      writeFiles(root, { '.github/agents/a.agent.md': '---\ndescription: d\n---\n\nBody.\n' });
      const args = ['--language', 'x', '--create-language', '--yes'];
      const result = runImport(root, path.join(root, '.github'), args);
      assert.notEqual(result.status, 0);
      assert.match(result.output, /re-run with --from copilot/);
      assert.doesNotMatch(result.output, /Invalid id/);
    });
  });

  it('should not print the hint for --from copilot when nothing is found', () => {
    withTempDir(root => {
      fs.mkdirSync(path.join(root, 'p/.github'), { recursive: true });
      const result = runImport(root, path.join(root, 'p'), COPILOT_ARGS);
      assert.match(result.output, /Nothing to import/);
      assert.doesNotMatch(result.output, /re-run with --from copilot/);
    });
  });
});

describe('discoverCopilotFiles on unreadable frontmatter', () => {
  /** Discovers one agent file with these bytes. */
  function discoverAgent(root: string, content: string) {
    writeFiles(root, { '.github/agents/a.agent.md': content });
    return discoverCopilotFiles(path.join(root, '.github'), 'x');
  }

  it('should keep the tools of a file that starts with a BOM', () => {
    withTempDir(root => {
      const { discovered } = discoverAgent(root, '\uFEFF---\ntools: [read]\n---\n\nBody.\n');
      assert.deepEqual(discovered[0]?.frontmatter.tools, ['read']);
      assert.equal(discovered[0]?.body, 'Body.');
    });
  });

  it('should refuse a frontmatter block that is never closed', () => {
    withTempDir(root => {
      const { discovered, unrecognised } = discoverAgent(root, '---\ntools: [read]\n\nBody.\n');
      assert.deepEqual(discovered, []);
      assert.match(unrecognised[0]?.reason ?? '', /frontmatter block is not closed/);
    });
  });

  it('should still import a body that opens with a rule after real frontmatter', () => {
    withTempDir(root => {
      const content = '---\ntools: [read]\n---\n---\n\nBody.\n';
      assert.equal(discoverAgent(root, content).discovered.length, 1);
    });
  });
});

describe('discoverCopilotFiles on linked kind folders', () => {
  for (const dir of ['instructions', 'agents', 'prompts', 'skills']) {
    it(`should report a linked ${dir}/ and read nothing under it`, () => {
      withTempDir(root => {
        writeFiles(root, {
          'elsewhere/x.instructions.md': '---\napplyTo: "**"\n---\n\nSecret.\n',
          '.github/README.md': 'readme',
        });
        fs.symlinkSync(path.join(root, 'elsewhere'), path.join(root, '.github', dir));
        const { discovered, unrecognised } = discoverCopilotFiles(path.join(root, '.github'), 'x');
        assert.deepEqual(discovered, []);
        assert.equal(unrecognised[0]?.relativePath, dir);
        assert.match(unrecognised[0]?.reason ?? '', /symbolic link/);
      });
    });
  }
});

describe('translateFrontmatter on untrusted prompt args', () => {
  const opts = { language: 'x', displayName: 'X' };

  it('should copy only name and description', () => {
    const args = JSON.parse('[{"name":"a","__proto__":{"polluted":1},"extra":2}]') as unknown;
    const { frontmatter } = translateFrontmatter('prompt', 'p', { args }, opts);
    assert.deepEqual(frontmatter.args, [{ name: 'a' }]);
    assert.equal(Object.keys(frontmatter.args?.[0] ?? {}).includes('__proto__'), false);
  });

  it('should report args that were not named objects as dropped', () => {
    const fm = { args: [{ name: 'a' }, ['nested'], 3] };
    const { frontmatter, droppedFields } = translateFrontmatter('prompt', 'p', fm, opts);
    assert.deepEqual(frontmatter.args, [{ name: 'a' }]);
    assert.deepEqual(droppedFields, ['args']);
  });

  it('should report a non-list args as dropped', () => {
    const { frontmatter, droppedFields } = translateFrontmatter('prompt', 'p', { args: 'x' }, opts);
    assert.equal(frontmatter.args, undefined);
    assert.deepEqual(droppedFields, ['args']);
  });
});

describe('reverseLexicon term boundaries', () => {
  const lexicon = getTarget('copilot').lexicon;
  assert.ok(lexicon);

  const unchanged = [
    'MY_AGENTS.md',
    'docs/AGENTS.md',
    'AGENTS.mdx',
    'https://x.test/.github/skills/y',
    'a/.github/instructions/b',
  ];
  for (const text of unchanged) {
    it(`should leave ${text} as written`, () => {
      assert.equal(reverseLexicon(text, lexicon), text);
    });
  }

  it('should still replace a term in quotes, backticks and at a sentence end', () => {
    assert.equal(
      reverseLexicon('`AGENTS.md`, "AGENTS.md". See AGENTS.md.', lexicon),
      '`{sigil:conventions-file}`, "{sigil:conventions-file}". See {sigil:conventions-file}.',
    );
  });
});

describe('guards a mutation showed were untested', () => {
  it('should keep a date-like value as a string', () => {
    assert.equal(parseYamlFrontmatter('since: 2024-01-01')?.since, '2024-01-01');
  });

  it('should keep a generated-looking comment in an agent body', () => {
    const comment = '<!-- Generated by sigil — source: x -->';
    const { body } = normalizeCopilotBody('agent', `# T\n\n${comment}\n\nBody.\n`);
    assert.ok(body.startsWith(comment));
  });
});
