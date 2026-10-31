/**
 * Tests for Claude-layout discovery: a rule file named `<namespace>-<name>.md`, as
 * `sigil add --target claude` writes it, imports under the catalog id `<name>`.
 *
 * Discovery is I/O-only, so every fixture is a real temporary directory.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverFiles } from '../../dist-cli/authoring/import/discover';
import { withTempDir } from '../helpers/temp-dir';

/** A valid source file: frontmatter with a description, then a body. */
const SOURCE_FILE = '---\ndescription: d\n---\n\nBody.\n';

/** Writes one file per `files` entry, creating parent folders. */
function writeFiles(root: string, files: string[]): void {
  for (const rel of files) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, SOURCE_FILE);
  }
}

/** One rule-prefix case: the files present, the namespace, and the slug discovery gives. */
interface SlugCase {
  name: string;
  files: string[];
  namespace: string;
  kind: 'rule' | 'agent' | 'skill';
  slug: string;
}

const SLUG_CASES: readonly SlugCase[] = [
  {
    name: 'drop a rule name prefix',
    files: ['rules/angular-ng-security.md'],
    namespace: 'angular',
    kind: 'rule',
    slug: 'ng-security',
  },
  {
    name: 'keep a stem that does not start with the prefix',
    files: ['rules/cs-style.md'],
    namespace: 'csharp',
    kind: 'rule',
    slug: 'cs-style',
  },
  {
    name: 'drop the shared namespace prefix',
    files: ['rules/shared-clean-code.md'],
    namespace: 'shared',
    kind: 'rule',
    slug: 'clean-code',
  },
  {
    name: 'keep another language prefix',
    files: ['rules/python-py-security.md'],
    namespace: 'angular',
    kind: 'rule',
    slug: 'python-py-security',
  },
  {
    name: 'drop the prefix once only',
    files: ['rules/angular-angular-x.md'],
    namespace: 'angular',
    kind: 'rule',
    slug: 'angular-x',
  },
  {
    name: 'keep the stem when nothing remains after the prefix',
    files: ['rules/angular-.md'],
    namespace: 'angular',
    kind: 'rule',
    slug: 'angular-',
  },
  {
    name: 'keep an agent name',
    files: ['agents/angular-reviewer.md'],
    namespace: 'angular',
    kind: 'agent',
    slug: 'angular-reviewer',
  },
  {
    name: 'keep a skill folder name',
    files: ['skills/angular-x/SKILL.md'],
    namespace: 'angular',
    kind: 'skill',
    slug: 'angular-x',
  },
];

describe('discoverFiles on a Claude layout namespace', () => {
  for (const { name, files, namespace, kind, slug } of SLUG_CASES) {
    it(`should ${name}`, () => {
      withTempDir(root => {
        writeFiles(root, files);
        const { discovered, unrecognised } = discoverFiles(root, namespace);
        assert.equal(discovered.length, 1);
        const file = discovered[0]!;
        assert.equal(file.kind, kind);
        assert.equal(file.slug, slug);
        assert.equal(file.frontmatter.description, 'd');
        assert.match(file.body, /Body\./);
        assert.deepEqual(unrecognised, []);
      });
    });
  }

  it('should report a second rule that strips to the same name', () => {
    withTempDir(root => {
      writeFiles(root, ['rules/angular-a.md', 'rules/a.md']);
      const { discovered, unrecognised } = discoverFiles(root, 'angular');
      const rules = discovered.filter(file => file.kind === 'rule');
      assert.equal(rules.length, 1);
      assert.equal(rules[0]!.slug, 'a');
      assert.equal(unrecognised.length, 1);
      assert.match(unrecognised[0]!.reason, /same name/);
    });
  });
});
