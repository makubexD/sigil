/**
 * Tests for src/authoring/import/discover-copilot.ts — Copilot `.github/` discovery.
 *
 * Every fixture is written to a real temporary directory, because discovery is I/O-only:
 * suffixes, YAML-first parsing, skill references and the `.github/` root files all matter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverCopilotFiles, resolveCopilotRoot } from '../../dist-cli/authoring/import';
import { SigilError } from '../../dist-cli/errors';
import { withTempDir } from '../helpers/temp-dir';

const SINGLE_FILE_REASON =
  'not imported: single-file instructions are not split into rules; move each into instructions/';
const ROOT_MD_REASON = 'Root-level .md file — not a recognised artifact location';

const RULE = '---\ndescription: A rule.\napplyTo: "**/*.ts"\n---\n# A rule\n\nDo the thing.\n';
const AGENT =
  '---\nname: reviewer\ndescription: Reviews.\ntools:\n  - read\n  - search\n---\n# Reviewer\n\nYou review.\n';
const PROMPT = '---\ndescription: Explains.\nagent: agent\n---\nExplain ${input:audience}.\n';
const SKILL = '---\ndescription: Writes docs.\n---\n# Document\n\nWrite docs.\n';

/** Write `content` at `rel` under `root`, creating parent directories. */
function writeFile(root: string, rel: string, content: string): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** Create and return `<project>/.github`. */
function copilotDir(project: string): string {
  const github = path.join(project, '.github');
  fs.mkdirSync(github, { recursive: true });
  return github;
}

describe('resolveCopilotRoot', () => {
  it('returns <root>/.github for a project root and the directory itself for .github', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      assert.equal(resolveCopilotRoot(project), github);
      assert.equal(resolveCopilotRoot(github), github);
    });
  });

  it('throws when the directory has no .github folder', () => {
    withTempDir(project => {
      assert.throws(
        () => resolveCopilotRoot(project),
        (err: unknown) =>
          err instanceof SigilError && err.message === `No .github/ folder in ${project}`,
      );
    });
  });
});

describe('discoverCopilotFiles — file kinds', () => {
  it('finds one file of each kind in a project root', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/a.instructions.md', RULE);
      writeFile(github, 'agents/reviewer.agent.md', AGENT);
      writeFile(github, 'prompts/explain.prompt.md', PROMPT);
      writeFile(github, 'skills/doc/SKILL.md', SKILL);
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(
        result.discovered.map(file => file.kind),
        ['rule', 'agent', 'prompt', 'skill'],
      );
      assert.deepEqual(result.unrecognised, []);
    });
  });

  it('strips the namespace prefix without a rename note', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/typescript-ts-a.instructions.md', RULE);
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.equal(file?.slug, 'ts-a');
      assert.ok(!(file?.notes ?? []).some(note => note.startsWith('file name normalised:')));
    });
  });

  it('normalises a file name and notes the change', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/Foo_Bar.instructions.md', RULE);
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.equal(file?.slug, 'foo-bar');
      assert.ok(file?.notes?.includes('file name normalised: Foo_Bar → foo-bar'));
    });
  });

  it('skips README.md in a flat directory silently', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/README.md', '# Read me');
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.discovered, []);
      assert.deepEqual(result.unrecognised, []);
    });
  });
});

describe('discoverCopilotFiles — unrecognised entries', () => {
  it('reports files that do not match the Copilot suffixes', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/foo.md', '# Foo');
      writeFile(github, 'agents/x.md', '# X');
      const result = discoverCopilotFiles(github, 'typescript');
      assert.equal(result.discovered.length, 0);
      assert.deepEqual(result.unrecognised.map(entry => entry.reason).sort(), [
        'Expected agents/*.agent.md',
        'Expected instructions/*.instructions.md',
      ]);
    });
  });

  it('reports a folder inside a flat directory', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      fs.mkdirSync(path.join(github, 'instructions', 'nested'), { recursive: true });
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.unrecognised, [
        { relativePath: 'instructions/nested', reason: 'Expected instructions/*.instructions.md' },
      ]);
    });
  });

  it('reports a file name that yields no slug', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'instructions/___.instructions.md', RULE);
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.discovered, []);
      assert.deepEqual(
        result.unrecognised.map(entry => entry.reason),
        ['not imported: no usable name in the file name'],
      );
    });
  });

  it('accepts the first of two files with the same kind and slug', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      // Case alone won't do: on Windows and macOS, Foo and foo are one file.
      writeFile(github, 'agents/foo_bar.agent.md', AGENT);
      writeFile(github, 'agents/foo-bar.agent.md', AGENT);
      const result = discoverCopilotFiles(github, 'typescript');
      assert.equal(result.discovered.length, 1);
      assert.equal(result.unrecognised.length, 1);
      const kept = result.discovered[0];
      const rejected = result.unrecognised[0];
      assert.ok(kept !== undefined && rejected !== undefined);
      assert.equal(rejected.reason, `not imported: same name as ${kept.relativePath}`);
      assert.notEqual(rejected.relativePath, kept.relativePath);
    });
  });

  it('reports copilot-instructions.md and AGENTS.md beside .github/', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'copilot-instructions.md', '# Instructions');
      writeFile(project, 'AGENTS.md', '# Agents');
      const result = discoverCopilotFiles(github, 'typescript');
      assert.equal(result.discovered.length, 0);
      assert.deepEqual(
        result.unrecognised.map(entry => entry.reason),
        [SINGLE_FILE_REASON, SINGLE_FILE_REASON],
      );
    });
  });

  it('reports another markdown file directly in .github/', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'notes.md', '# Notes');
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.unrecognised, [{ relativePath: 'notes.md', reason: ROOT_MD_REASON }]);
    });
  });

  it('does not follow a symlinked instruction file', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      const outside = writeFile(project, 'outside.md', RULE);
      const link = path.join(github, 'instructions', 'linked.instructions.md');
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(outside, link);
      const result = discoverCopilotFiles(github, 'typescript');
      assert.equal(result.discovered.length, 0);
      assert.equal(result.unrecognised.length, 1);
      const reason = result.unrecognised[0]?.reason ?? '';
      assert.ok(
        reason.startsWith('not imported:') || reason === 'Expected instructions/*.instructions.md',
      );
    });
  });

  it('ignores .github/workflows', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'workflows/ci.yml', 'name: ci\n');
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.discovered, []);
      assert.deepEqual(result.unrecognised, []);
    });
  });
});

describe('discoverCopilotFiles — agent tools', () => {
  it('reports an agent whose tools list is empty and never discovers it', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(
        github,
        'agents/reviewer.agent.md',
        '---\nname: reviewer\ndescription: Reviews.\ntools: []\n---\n# Reviewer\n',
      );
      const result = discoverCopilotFiles(github, 'typescript');
      assert.deepEqual(result.discovered, []);
      assert.deepEqual(
        result.unrecognised.map(entry => entry.reason),
        ['not imported: tools is empty, and an absent list would grant every tool'],
      );
    });
  });

  it('keeps a YAML tools list as an array', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'agents/reviewer.agent.md', AGENT);
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.deepEqual(file?.frontmatter.tools, ['read', 'search']);
    });
  });
});

describe('discoverCopilotFiles — skill and prompt fields', () => {
  it('carries a skill body When to Use and Arguments into frontmatter', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(
        github,
        'skills/doc/SKILL.md',
        '---\ndescription: Writes docs.\n---\n## When to Use\n\nUse when writing docs.\n\n' +
          '**Arguments:** [topic]\n\n# Document\n\nWrite docs.\n',
      );
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.equal(file?.frontmatter.when_to_use, 'Use when writing docs.');
      assert.equal(file?.frontmatter['argument-hint'], '[topic]');
    });
  });

  it('carries prompt placeholder args into frontmatter', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'prompts/explain.prompt.md', PROMPT);
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.deepEqual(file?.frontmatter.args, [{ name: 'audience' }]);
    });
  });

  it('parses a double-quoted skill description with escapes as YAML', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(
        github,
        'skills/doc/SKILL.md',
        '---\ndescription: "He said \\"hi\\": ok"\n---\n# Document\n',
      );
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.equal(file?.frontmatter.description, 'He said "hi": ok');
    });
  });

  it('reverses Copilot lexicon values in a skill reference', () => {
    withTempDir(project => {
      const github = copilotDir(project);
      writeFile(github, 'skills/doc/SKILL.md', SKILL);
      writeFile(github, 'skills/doc/references/x.md', 'Read AGENTS.md first.');
      const [file] = discoverCopilotFiles(github, 'typescript').discovered;
      assert.equal(file?.references?.[0]?.content, 'Read {sigil:conventions-file} first.');
    });
  });
});
