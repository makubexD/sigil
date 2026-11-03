/**
 * Tests for the generated artifact index: rows built from the real catalog and `packs.yaml`, and
 * the deterministic Markdown page they render to. The page itself is written by
 * `src/emit-artifact-index.ts`; this file checks the pure renderer it uses.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildArtifactIndex,
  renderArtifactIndex,
  type ArtifactIndexRow,
} from '../dist-cli/artifact-index';
import { carriedKinds, installableKinds } from '../dist-cli/targets/capabilities';
import { installSkipReason } from '../dist-cli/targets/install-skip';
import { getAllTargets } from '../dist-cli/targets/index';
import { appliesToEveryFile } from '../dist-cli/targets/shared/repo-wide-rules';
import { packMemberIds, resolveSelection } from '../dist-cli/select/index';
import { parsePacksConfig } from '../dist-cli/packs-config';
import type { Pack, ResolvedCatalog, Target } from '../dist-cli/types';
import { loadResolvedCatalog } from './helpers/catalog';
import { PACKS } from './helpers/install-scenario';

/** From `test-compiled/` up two levels to the repo root. */
const ROOT = path.resolve(__dirname, '../..');

describe('buildArtifactIndex', () => {
  let catalog: ResolvedCatalog;
  let packs: Pack[];
  let targets: Target[];
  let rows: ArtifactIndexRow[];

  before(async () => {
    catalog = await loadResolvedCatalog();
    packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;
    targets = getAllTargets().filter(target => target.scaffold);
    rows = buildArtifactIndex(catalog, packs, targets, ROOT);
  });

  it('should have exactly one row per non-template artifact and no template row', () => {
    const expected = catalog.artifacts
      .filter(artifact => artifact.kind !== 'template')
      .map(artifact => artifact.id)
      .sort();
    assert.deepEqual(rows.map(row => row.id).sort(), expected);
    assert.ok(rows.every(row => row.kind !== 'template'));
  });

  it('should point every row at a source file that exists under the repo root', () => {
    for (const row of rows) {
      assert.ok(fs.existsSync(path.join(ROOT, row.sourcePath)), row.sourcePath);
    }
  });

  it('should list a languages: pack on its members', () => {
    const pack = packs.find(candidate => candidate.name === 'dotnet-tooling');
    assert.ok(pack, 'packs.yaml must define dotnet-tooling');
    const member = packMemberIds(pack, catalog)[0];
    assert.ok(member, 'dotnet-tooling must have members');
    const row = rows.find(candidate => candidate.id === member);
    assert.ok(row?.packs.includes('dotnet-tooling'), member);
  });

  it('should list essentials for an id under pluginExclude', () => {
    const row = rows.find(candidate => candidate.id === 'shared/author-artifact');
    assert.ok(row?.packs.includes('essentials'), 'shared/author-artifact must list essentials');
  });

  it('should skip Antigravity for a scoped csharp rule but list Claude', () => {
    const scoped = rows.filter(row => {
      if (row.kind !== 'rule') return false;
      const artifact = catalog.byId.get(row.id);
      if (artifact?.frontmatter.language !== 'csharp') return false;
      return !appliesToEveryFile(artifact.frontmatter.appliesTo as string[] | undefined);
    });
    assert.ok(scoped.length > 0, 'catalog must have scoped csharp rules');
    for (const row of scoped) {
      assert.ok(!row.targets.includes('antigravity'), `${row.id} should skip antigravity`);
      assert.ok(row.targets.includes('claude'), `${row.id} should install for claude`);
    }
  });

  it('should list a target exactly when a single-artifact install does', () => {
    for (const target of targets) {
      for (const row of rows) {
        const single = resolveSelection({
          selectors: [`${row.kind}:${row.id}`],
          filters: {},
          catalog,
          packs,
          supportedKinds: installableKinds(target),
          carriedKinds: carriedKinds(target),
          targetName: target.name,
          skipReason: artifact => installSkipReason(target, artifact),
        });
        assert.equal(
          row.targets.includes(target.name),
          single.ids.includes(row.id),
          `${target.name} / ${row.id}`,
        );
      }
    }
  });
});

describe('renderArtifactIndex', () => {
  const rows: ArtifactIndexRow[] = [
    {
      id: 'shared/no-target',
      kind: 'skill',
      title: 'shared/no-target',
      description: 'a | b\nc',
      sourcePath: 'catalog/shared/skills/no-target/SKILL.md',
      packs: [],
      targets: [],
    },
    {
      id: 'shared/retired',
      kind: 'skill',
      title: 'shared/retired',
      description: 'still useful',
      sourcePath: 'catalog/shared/skills/retired/SKILL.md',
      packs: ['essentials'],
      targets: ['claude'],
      deprecated: 'use shared/other',
    },
  ];
  const page = renderArtifactIndex(rows, []);
  const lineFor = (id: string): string | undefined =>
    page.split('\n').find(line => line.includes(id));

  it('should escape pipes and newlines in a description cell', () => {
    assert.ok(lineFor('shared/no-target')?.includes('| a \\| b c | — | — | — |'));
  });

  it('should render — in Tools and Install when no target installs a row', () => {
    assert.ok(lineFor('shared/no-target')?.includes('| — | — | — |'));
  });

  it('should prefix a deprecated row description with the reason', () => {
    assert.ok(
      lineFor('shared/retired')?.includes('**Deprecated:** use shared/other. still useful'),
    );
  });

  it('should name config kinds in plain words in the H2 and the contents line', () => {
    const config: ArtifactIndexRow[] = (['mcp', 'settings'] as const).map(kind => ({
      id: `shared/${kind}-x`,
      kind,
      title: `shared/${kind}-x`,
      description: 'x',
      sourcePath: `catalog/shared/${kind}-x.md`,
      packs: [],
      targets: [],
    }));
    const text = renderArtifactIndex(config, []);
    assert.match(text, /^## MCP servers$/m);
    assert.match(text, /^## Settings$/m);
    assert.match(text, /\[MCP servers\]\(#mcp-servers\)/);
  });

  it('should render the same rows byte-identically every time', () => {
    assert.equal(renderArtifactIndex(rows, []), page);
  });
});
