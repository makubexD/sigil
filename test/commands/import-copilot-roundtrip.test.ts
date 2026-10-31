/**
 * Round trip: install real catalog artifacts for Copilot, import the resulting `.github/` layout
 * back into an empty catalog, and compare it with the bundled source. A mismatch is a bug in the
 * import pipeline, not something this test papers over — see
 * `docs/plan-import-copilot-layout.md` step 10.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runImport } from '../../dist-cli/commands/import';
import { loadCatalog } from '../../dist-cli/load';
import { getTarget } from '../../dist-cli/targets/index';
import { add, PACKS } from '../helpers/install-scenario';
import { loadResolvedCatalog } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';
import type {
  Artifact,
  LoadedCatalog,
  ResolvedArtifact,
  ResolvedCatalog,
} from '../../dist-cli/types';

const RULE = 'typescript/ts-async';
const AGENT = 'typescript/ts-debugger';
/** Its prose names `eval`, which the trust scanner's `config/dangerous-command` rule blocks. */
const TRUST_BLOCKED_AGENT = 'typescript/ts-code-reviewer';
const SKILL = 'typescript/ts-document';
const PROMPT = 'shared/explain-diff';
const ALL_SELECTORS = [`rule:${RULE}`, `agent:${AGENT}`, `skill:${SKILL}`, `prompt:${PROMPT}`];
const RENDERED = [
  '.github/instructions/typescript-ts-async.instructions.md',
  '.github/agents/ts-debugger.agent.md',
  '.github/prompts/shared-explain-diff.prompt.md',
];

/** An imported catalog and the project its `.github/` layout came from. */
interface RoundTrip {
  project: string;
  catalogDir: string;
  catalog: LoadedCatalog;
}

/** Installs `selectors` for Copilot into `<root>/<name>`; returns the project directory. */
async function install(
  root: string,
  name: string,
  selectors: string[],
  deps = true,
): Promise<string> {
  const project = path.join(root, name);
  fs.mkdirSync(project, { recursive: true });
  await add(project, 'copilot', selectors, deps);
  return project;
}

/** Imports `project`'s Copilot layout into `catalogDir` under the language or shared namespace. */
async function importProject(project: string, catalogDir: string, shared: boolean): Promise<void> {
  const common = { from: 'copilot', catalogDir, dryRun: false, yes: true, overwrite: false };
  if (shared) await runImport(project, { ...common, shared: true, createLanguage: false });
  else await runImport(project, { ...common, language: 'typescript', createLanguage: true });
}

/** Creates an empty catalog directory at `<root>/catalog` and returns its path. */
function emptyCatalog(root: string): string {
  const dir = path.join(root, 'catalog');
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  return dir;
}

/** Installs one artifact, imports it, and loads the resulting catalog. */
async function singleRoundTrip(
  root: string,
  selector: string,
  shared: boolean,
  deps = true,
): Promise<RoundTrip> {
  const project = await install(root, 'project', [selector], deps);
  const catalogDir = emptyCatalog(root);
  await importProject(project, catalogDir, shared);
  return { project, catalogDir, catalog: await loadCatalog(catalogDir) };
}

/**
 * Installs every artifact of the table into one project, imports the language artifacts from it
 * and the prompt from a prompt-only project into the same catalog, and loads that catalog.
 */
async function allKindsRoundTrip(root: string): Promise<RoundTrip> {
  const project = await install(root, 'project', ALL_SELECTORS, false);
  const promptProject = await install(root, 'prompt-project', [`prompt:${PROMPT}`], false);
  const catalogDir = emptyCatalog(root);
  await importProject(project, catalogDir, false);
  await importProject(promptProject, catalogDir, true);
  return { project, catalogDir, catalog: await loadCatalog(catalogDir) };
}

/** The artifact at `id` in a catalog, or a failure naming the missing id. */
function find<T extends Artifact>(artifacts: Map<string, T>, id: string): T {
  const artifact = artifacts.get(id);
  assert.ok(artifact, `missing artifact ${id}`);
  return artifact;
}

/** The source side of a comparison: the bundled catalog, resolved. */
async function source(id: string): Promise<ResolvedArtifact> {
  const catalog: ResolvedCatalog = await loadResolvedCatalog();
  return find(catalog.byId, id);
}

/** The body an adapter renders: the composed body when resolution produced one. */
function sourceBody(artifact: ResolvedArtifact): string {
  return (artifact.resolvedBody ?? artifact.body).trim();
}

/** Re-renders the rule, agent and prompt from an imported catalog into `second`. */
async function rerender(catalogDir: string, second: string): Promise<void> {
  await runAdd([`rule:${RULE}`, `agent:${AGENT}`, `prompt:${PROMPT}`], {
    projectDir: second,
    catalogDir,
    packs: PACKS,
    target: 'copilot',
    deps: false,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

/** Asserts that `rel` is byte-identical in both project directories. */
function assertSameFile(a: string, b: string, rel: string): void {
  assert.equal(
    fs.readFileSync(path.join(b, rel), 'utf8'),
    fs.readFileSync(path.join(a, rel), 'utf8'),
    rel,
  );
}

/** A prompt's argument names, order-insensitive (Copilot carries them only as placeholders). */
function argNames(artifact: Artifact | ResolvedArtifact): string[] {
  const args = (artifact.frontmatter.args as Array<{ name: string }> | undefined) ?? [];
  return args.map(arg => arg.name).sort();
}

describe('Copilot import round trip', () => {
  it('should bring a rule back with its title, description, scope and body', async () => {
    await withTempDirAsync(async root => {
      const { catalog } = await singleRoundTrip(root, `rule:${RULE}`, false);
      const sourceArtifact = await source(RULE);
      const imported = find(catalog.byId, RULE);
      assert.equal(imported.frontmatter.title, sourceArtifact.frontmatter.title);
      assert.equal(imported.frontmatter.description, sourceArtifact.frontmatter.description);
      assert.deepEqual(imported.frontmatter.appliesTo, sourceArtifact.frontmatter.appliesTo);
      assert.equal(imported.body.trim(), sourceBody(sourceArtifact));
    });
  });

  it('should bring an agent back with its name, title, description, tools and body', async () => {
    await withTempDirAsync(async root => {
      const { catalog } = await singleRoundTrip(root, `agent:${AGENT}`, false);
      const sourceArtifact = await source(AGENT);
      const imported = find(catalog.byId, AGENT);
      assert.equal(imported.frontmatter.name, sourceArtifact.frontmatter.name);
      assert.equal(imported.frontmatter.title, sourceArtifact.frontmatter.title);
      assert.equal(imported.frontmatter.description, sourceArtifact.frontmatter.description);
      assert.deepEqual(imported.frontmatter.tools, sourceArtifact.frontmatter.tools);
      assert.equal(imported.body.trim(), sourceBody(sourceArtifact));
      assert.match(imported.body, /\{sigil:[a-z-]+\}/);
    });
  });

  it('should bring a skill back with its fields and the inlined rules kept in the body', async () => {
    await withTempDirAsync(async root => {
      const { catalog } = await singleRoundTrip(root, `skill:${SKILL}`, false, false);
      const sourceArtifact = await source(SKILL);
      const imported = find(catalog.byId, SKILL);
      const src = sourceArtifact.frontmatter;
      assert.equal(imported.frontmatter.name, src.name);
      assert.equal(imported.frontmatter.description, src.description);
      assert.equal(imported.frontmatter.whenToUse, src.whenToUse);
      assert.equal(imported.frontmatter.argumentHint, src.argumentHint);
      assert.deepEqual(imported.frontmatter.allowedTools, src.allowedTools);
      const body = imported.body.trim();
      assert.ok(body.startsWith(sourceBody(sourceArtifact)), 'body should start with the source');
      assert.ok(body.includes('## Coding guidelines to apply'));
    });
  });

  it('should bring a prompt back with its description, arguments and body', async () => {
    await withTempDirAsync(async root => {
      const { catalog } = await singleRoundTrip(root, `prompt:${PROMPT}`, true);
      const sourceArtifact = await source(PROMPT);
      const imported = find(catalog.byId, PROMPT);
      assert.equal(imported.frontmatter.description, sourceArtifact.frontmatter.description);
      assert.deepEqual(argNames(imported), argNames(sourceArtifact));
      assert.equal(imported.body.trim(), sourceBody(sourceArtifact));
      assert.ok(imported.body.includes('{{audience}}'), 'placeholders restored');
    });
  });

  it('should re-render the rule, agent and prompt byte-identically from the imported catalog', async () => {
    await withTempDirAsync(async root => {
      const { project, catalogDir } = await allKindsRoundTrip(root);
      const second = path.join(root, 'second');
      fs.mkdirSync(second);
      await rerender(catalogDir, second);
      for (const rel of RENDERED) assertSameFile(project, second, rel);
    });
  });

  it('should refuse an agent the trust scanner blocks and write nothing for it', async () => {
    await withTempDirAsync(async root => {
      const project = await install(root, 'project', [`agent:${TRUST_BLOCKED_AGENT}`], false);
      const catalogDir = emptyCatalog(root);
      await assert.rejects(importProject(project, catalogDir, false), /Fix the errors above/);
      const written = path.join(catalogDir, 'languages', `${TRUST_BLOCKED_AGENT}.agent.md`);
      assert.equal(fs.existsSync(written), false);
      assert.equal(
        fs.existsSync(path.join(catalogDir, 'languages', 'typescript', 'agents')),
        false,
      );
    });
  });

  it('should leave no Copilot lexicon literal in any imported body', async () => {
    await withTempDirAsync(async root => {
      const { catalog } = await allKindsRoundTrip(root);
      const lexicon = getTarget('copilot').lexicon;
      assert.ok(lexicon, 'the copilot target has a lexicon');
      const values = Object.values(lexicon).map(entry => entry.value);
      for (const artifact of catalog.artifacts) {
        for (const value of values) {
          assert.ok(!artifact.body.includes(value), `${artifact.id} still contains '${value}'`);
        }
      }
    });
  });
});
