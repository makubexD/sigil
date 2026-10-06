/**
 * `sigil move` end to end on the layout cases the catalog standard covers: a template (three-part
 * id `shared/templates/<name>`) and a catalog kept under a folder named like a namespace, where the
 * post-move check must read the layout relative to the catalog root.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { runMove } from '../../dist-cli/commands/move';
import { withTempDirAsync } from '../helpers/temp-dir';

const BUNDLED_TEMPLATE = path.resolve(
  __dirname,
  '../../catalog/shared/templates/mcp-note.template.md',
);
const RULE =
  '---\nid: shared/probe\nkind: rule\ntitle: Probe\ndescription: A probe rule.\n---\n\n- **Probe.** x\n';

const LANGUAGE_YAML = 'displayName: "C#"\nglobs:\n  - "**/*.cs"\n';
const RULE_IN = (id: string, language: string) =>
  `---\nid: ${id}\nkind: rule\ntitle: Probe\ndescription: A probe rule.\nlanguage: ${language}\n---\n\n- **Probe.** x\n`;

function write(catalogDir: string, rel: string, content: string): void {
  const file = path.join(catalogDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const move = (catalogDir: string, from: string, to: string) =>
  runMove(from, to, { catalogDir, dryRun: false, yes: true });

describe('sigil move — layout', () => {
  it('should move a template to its new three-part id', async () => {
    await withTempDirAsync(async root => {
      const dir = path.join(root, 'catalog', 'shared', 'templates');
      fs.mkdirSync(dir, { recursive: true });
      const source = fs
        .readFileSync(BUNDLED_TEMPLATE, 'utf8')
        .replace(/^id: .*$/m, 'id: shared/templates/probe');
      fs.writeFileSync(path.join(dir, 'probe.template.md'), source);
      await move(path.join(root, 'catalog'), 'shared/templates/probe', 'shared/templates/renamed');
      assert.ok(fs.existsSync(path.join(dir, 'renamed.template.md')));
      assert.ok(!fs.existsSync(path.join(dir, 'probe.template.md')));
    });
  });

  it("should rename an agent's name: with its id", async () => {
    await withTempDirAsync(async root => {
      const catalogDir = path.join(root, 'catalog');
      const agent =
        '---\nid: shared/probe\nkind: agent\nname: probe\ntitle: P\n' +
        'description: Use to probe.\ntools:\n  - Read\n---\n\nProbe.\n';
      write(catalogDir, 'shared/agents/probe.agent.md', agent);
      await move(catalogDir, 'shared/probe', 'shared/renamed');
      const moved = matter.read(path.join(catalogDir, 'shared', 'agents', 'renamed.agent.md')).data;
      assert.equal(moved.name, 'renamed');
    });
  });

  it('should drop language: when an artifact moves to shared/', async () => {
    await withTempDirAsync(async root => {
      const catalogDir = path.join(root, 'catalog');
      write(catalogDir, 'languages/csharp/language.yaml', LANGUAGE_YAML);
      write(catalogDir, 'languages/csharp/rules/probe.rule.md', RULE_IN('csharp/probe', 'csharp'));
      await move(catalogDir, 'csharp/probe', 'shared/probe');
      const moved = matter.read(path.join(catalogDir, 'shared', 'rules', 'probe.rule.md')).data;
      assert.equal(moved.language, undefined);
    });
  });

  it('should set language: when an artifact moves into a language', async () => {
    await withTempDirAsync(async root => {
      const catalogDir = path.join(root, 'catalog');
      write(catalogDir, 'languages/csharp/language.yaml', LANGUAGE_YAML);
      write(catalogDir, 'shared/rules/probe.rule.md', RULE);
      await move(catalogDir, 'shared/probe', 'csharp/probe');
      const file = path.join(catalogDir, 'languages', 'csharp', 'rules', 'probe.rule.md');
      assert.equal(matter.read(file).data.language, 'csharp');
    });
  });

  it('should move a shared rule in a catalog kept under languages/<x>/', async () => {
    await withTempDirAsync(async tmp => {
      const catalogDir = path.join(tmp, 'languages', 'notes', 'catalog');
      const rules = path.join(catalogDir, 'shared', 'rules');
      fs.mkdirSync(rules, { recursive: true });
      fs.writeFileSync(path.join(rules, 'probe.rule.md'), RULE);
      await move(catalogDir, 'shared/probe', 'shared/renamed');
      assert.ok(fs.existsSync(path.join(rules, 'renamed.rule.md')));
    });
  });
});
