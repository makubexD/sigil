/**
 * An agent's tool restriction can never widen silently. Both providers give an agent every tool when
 * its frontmatter has no `tools:` line, so (1) the schema rejects an empty `tools`/`disallowedTools`
 * list, which the emitters would drop; (2) every agent that declares `tools` gets a `tools:` line from
 * every provider; and (3) `tool-restriction-coverage` fails `sync --check` when an agent ships to a
 * target whose agent spec cannot carry one of its restriction fields.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AgentSchema } from '../../dist-cli/schema';
import { renderArtifact } from '../../dist-cli/targets/emit';
import {
  restrictionOutcome,
  toolSkipReason,
  toolWarning,
  wholeFileSkipReason,
} from '../../dist-cli/targets/tool-restriction';
import { CLAUDE_AGENT_SPEC } from '../../dist-cli/targets/claude-code/spec/agent';
import { COPILOT_AGENT_SPEC } from '../../dist-cli/targets/copilot/spec/agent';
import type { FieldMapping, KindEmitSpec } from '../../dist-cli/targets/spec-types';
import type { ToolDialect } from '../../dist-cli/targets/tool-dialect';
import { emitFile, scaffoldArtifact, specFor } from '../../dist-cli/targets/emit-files';
import { channelFromNativeKinds } from '../../dist-cli/targets/capabilities';
import { COPILOT_LEXICON } from '../../dist-cli/targets/copilot/lexicon';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { getAllTargets, registerTarget, getTarget } from '../../dist-cli/targets/index';
import { runAdd } from '../../dist-cli/commands/add';
import type {
  Artifact,
  CompileOptions,
  FileMap,
  LoadedCatalog,
  ResolvedArtifact,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';
import { makeAgent, makeSkill } from '../helpers/fixtures';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'tool-restriction-coverage';

function catalogOf(artifacts: Artifact[]): LoadedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  } as unknown as LoadedCatalog;
}

const agentWith = (fm: Record<string, unknown>) => makeAgent(fm) as unknown as Artifact;

describe('agent tool restriction — schema', () => {
  for (const field of ['tools', 'disallowedTools']) {
    it(`should reject an empty ${field} list`, () => {
      assert.equal(AgentSchema.safeParse(makeAgent({ [field]: [] }).frontmatter).success, false);
    });

    it(`should accept a non-empty ${field} list`, () => {
      assert.ok(AgentSchema.safeParse(makeAgent({ [field]: ['Read'] }).frontmatter).success);
    });
  }
});

describe('agent tool restriction — emitted on every provider', () => {
  for (const [provider, spec] of [
    ['claude', CLAUDE_AGENT_SPEC],
    ['copilot', COPILOT_AGENT_SPEC],
  ] as const) {
    it(`should give every catalog agent that declares tools a tools line on ${provider}`, async () => {
      const resolved = await loadResolvedCatalog();
      const agents = resolved.artifacts.filter(
        a => a.kind === 'agent' && Array.isArray(a.frontmatter.tools),
      );
      assert.ok(agents.length > 0);
      for (const agent of agents) {
        const out = renderArtifact(spec, agent as ResolvedArtifact, {});
        assert.match(out, /^tools:/m, `${agent.id} lost its tools on ${provider}`);
      }
    });
  }
});

describe('agent tool restriction — refused at render time', () => {
  it('should refuse to render an agent whose restriction the spec drops', () => {
    const agent = makeAgent({ disallowedTools: ['Edit'] }) as unknown as ResolvedArtifact;
    assert.throws(() => renderArtifact(COPILOT_AGENT_SPEC, agent, {}), /disallowedTools/);
  });

  it('should render it through a spec that carries the restriction', () => {
    const agent = makeAgent({ disallowedTools: ['Edit'] }) as unknown as ResolvedArtifact;
    assert.match(renderArtifact(CLAUDE_AGENT_SPEC, agent, {}), /^disallowedTools:/m);
  });
});

describe('restrictionOutcome', () => {
  const namesSpec: KindEmitSpec = {
    ...CLAUDE_AGENT_SPEC,
    toolDialect: {
      kind: 'names',
      names: {
        read: ['Read'],
        search: ['Grep', 'Glob'],
        edit: ['Edit', 'Write'],
        shell: undefined,
        web: undefined,
        agent: undefined,
        todo: undefined,
      },
    },
  };

  it('should be exact when the dialect carries every tool', () => {
    const agent = makeAgent({ tools: ['read', 'search'] });
    assert.deepEqual(restrictionOutcome(namesSpec, agent.frontmatter), { kind: 'exact' });
  });

  it('should skip by default when the dialect cannot carry a tool', () => {
    const agent = makeAgent({ tools: ['read', 'shell'] });
    const outcome = restrictionOutcome(namesSpec, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /shell/);
  });

  it('should warn instead of skipping under toolPolicy nearest', () => {
    const agent = makeAgent({ tools: ['read', 'shell'], toolPolicy: 'nearest' });
    const outcome = restrictionOutcome(namesSpec, agent.frontmatter);
    assert.equal(outcome.kind, 'nearest');
    if (outcome.kind !== 'nearest') return;
    assert.match(outcome.warning, /shell/);
  });

  it('should skip a field the spec does not map', () => {
    const agent = makeAgent({ disallowedTools: ['Edit'] });
    const outcome = restrictionOutcome(COPILOT_AGENT_SPEC, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /disallowedTools/);
  });

  it('should skip a mapped field on a spec with no dialect', () => {
    const agent = makeAgent({ tools: ['Read'] });
    const { toolDialect: _toolDialect, ...noDialect } = CLAUDE_AGENT_SPEC;
    const outcome = restrictionOutcome(noDialect, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /tools/);
  });

  it('should report the skip reason and nothing for an exact render', () => {
    const skipped = makeAgent({ tools: ['read', 'shell'] });
    const exact = makeAgent({ tools: ['read', 'search'] });
    assert.equal(typeof toolSkipReason(namesSpec, skipped), 'string');
    assert.equal(toolSkipReason(namesSpec, exact), undefined);
  });

  it('should refuse an inexact render and allow a nearest one', () => {
    const agent = makeAgent({ tools: ['read', 'shell'] }) as unknown as ResolvedArtifact;
    assert.throws(() => renderArtifact(namesSpec, agent, {}), /shell/);
    const nearest = makeAgent({
      tools: ['read', 'shell'],
      toolPolicy: 'nearest',
    }) as unknown as ResolvedArtifact;
    assert.equal(typeof renderArtifact(namesSpec, nearest, {}), 'string');
  });
});

describe('tool-restriction-coverage', () => {
  it('should flag a restriction a target the agent ships to cannot carry', () => {
    const agent = agentWith({ disallowedTools: ['Edit'] });
    const findings = runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE });
    assert.deepEqual(
      findings.map(f => [f.severity, f.provider]),
      [['error', 'copilot']],
    );
  });

  it('should pass when the agent does not ship to that target', () => {
    const agent = agentWith({ disallowedTools: ['Edit'], platforms: ['claude'] });
    assert.deepEqual(runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE }), []);
  });

  it('should pass a tools list every target carries', () => {
    const agent = agentWith({ tools: ['Read', 'Grep'] });
    assert.deepEqual(runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE }), []);
  });

  it('should flag a strict restriction once, on the target whose dialect cannot carry it', () => {
    const agent = agentWith({ tools: ['read', 'shell'] });
    const findings = runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE });
    assert.deepEqual(
      findings.map(f => [f.severity, f.provider]),
      [['error', FAKE_TARGET]],
    );
    assert.match(findings[0]?.detail ?? '', /shell/);
    assert.match(findings[0]?.detail ?? '', new RegExp(`set platforms: to exclude ${FAKE_TARGET}`));
  });

  it('should pass when platforms excludes the target that cannot carry the restriction', () => {
    const agent = agentWith({ tools: ['read', 'shell'], platforms: ['claude', 'copilot'] });
    assert.deepEqual(runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE }), []);
  });

  it('should warn once when toolPolicy nearest accepts the nearest mapping', () => {
    const agent = agentWith({ tools: ['read', 'shell'], toolPolicy: 'nearest' });
    const findings = runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE });
    assert.deepEqual(
      findings.map(f => [f.severity, f.provider]),
      [['warning', FAKE_TARGET]],
    );
    assert.match(findings[0]?.detail ?? '', /shell/);
    assert.match(findings[0]?.detail ?? '', /nearest mapping/);
  });

  it('should report nothing for the bundled catalog on the real targets', async () => {
    const resolved = await loadResolvedCatalog();
    const realTargets = getAllTargets().filter(target => target.name !== FAKE_TARGET);
    const findings = runConformance(resolved as unknown as LoadedCatalog, realTargets, {
      ruleId: RULE,
    });
    assert.deepEqual(findings, []);
  });
});

// ─── A registered target whose agent dialect cannot express `shell` ──────────
// Registering it here lets add/compile run the real pipeline. Its agent spec maps
// both restriction fields, so tool-restriction-coverage above gains no finding.

const FAKE_TARGET = 'fake-tools';

/** Names dialect without `shell`, so `tools: [read, shell]` is inexact on it. */
const FAKE_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['Read'],
    search: ['Grep', 'Glob'],
    edit: ['Edit'],
    shell: undefined,
    web: undefined,
    agent: undefined,
    todo: undefined,
  },
};

function restrictionMapping(from: 'tools' | 'disallowedTools'): FieldMapping {
  return { from, to: from, required: false, serialize: v => `${from}: ${JSON.stringify(v)}` };
}

const FAKE_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  outputPath: artifact => `.fake/agents/${artifact.frontmatter.name as string}.md`,
  pathPattern: /\.fake\/agents\/.*\.md$/,
  frontmatter: [
    { from: 'name', to: 'name', required: true, serialize: v => `name: ${v as string}` },
    {
      from: 'description',
      to: 'description',
      required: true,
      serialize: v => `description: ${JSON.stringify(v)}`,
    },
    restrictionMapping('tools'),
    restrictionMapping('disallowedTools'),
  ],
  emitEmptyFrontmatter: true,
  toolDialect: FAKE_DIALECT,
  body: [],
  lexicon: COPILOT_LEXICON,
  forbiddenKeys: [],
  bodyForbids: [],
  docs: [],
};

const FAKE_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.fake/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.fake\/skills\/.*\/SKILL\.md$/,
  frontmatter: [
    { from: 'name', to: 'name', required: true, serialize: v => `name: ${v as string}` },
    {
      from: 'description',
      to: 'description',
      required: true,
      serialize: v => `description: ${JSON.stringify(v)}`,
    },
  ],
  emitEmptyFrontmatter: true,
  body: [],
  lexicon: COPILOT_LEXICON,
  forbiddenKeys: [],
  bodyForbids: [],
  docs: [],
};

const fakeToolTarget: Target = {
  name: FAKE_TARGET,
  capabilities: { scaffold: channelFromNativeKinds(['agent', 'skill'], 'not built here') },
  emitSpecs: [FAKE_AGENT_SPEC, FAKE_SKILL_SPEC],
  async compile(catalog) {
    const files: FileMap = {};
    const ctx = { catalog, installSet: new Set(catalog.artifacts.map(a => a.id)) };
    for (const artifact of catalog.artifacts) {
      const spec = specFor(this.emitSpecs ?? [], artifact.kind, 'scaffold');
      if (spec) emitFile(spec, artifact, ctx, files);
    }
    return files;
  },
  async scaffold(artifactId, catalog, options) {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    return scaffoldArtifact({ specs: this.emitSpecs ?? [], artifact, catalog, options });
  },
};
registerTarget(fakeToolTarget);

const PACKS_FILE = path.resolve(__dirname, '../../packs.yaml');

function resolvedOf(artifacts: Artifact[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  } as unknown as ResolvedCatalog;
}

/** Writes a one-agent catalog whose agent's `tools` include `shell`. */
function writeCatalog(dir: string, toolPolicy?: 'nearest'): string {
  const catalogDir = path.join(dir, 'catalog');
  const agentsDir = path.join(catalogDir, 'shared', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, 'code-reviewer.agent.md'),
    [
      '---',
      'id: shared/code-reviewer',
      'kind: agent',
      'name: code-reviewer',
      'title: Code Reviewer',
      'description: Strict test agent.',
      'tools:',
      '  - read',
      '  - shell',
      ...(toolPolicy === undefined ? [] : [`toolPolicy: ${toolPolicy}`]),
      '---',
      '# Reviewer',
      '',
    ].join('\n'),
  );
  return catalogDir;
}

interface CapturedAdd {
  /** `level: text` for each clack log line (the skip advice goes through its `warn`). */
  logs: string[];
  warnings: string[];
}

/** Runs a non-interactive add for the fake target, capturing its log and warning lines. */
async function addStrictAgent(dir: string, catalogDir: string): Promise<CapturedAdd> {
  const recorder = createRecorder();
  const restore = mockClack([], recorder);
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: string) => void warnings.push(String(message));
  try {
    await runAdd(['agent:shared/code-reviewer'], {
      projectDir: dir,
      catalogDir,
      packs: PACKS_FILE,
      target: FAKE_TARGET,
      deps: true,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    });
  } finally {
    console.warn = warn;
    restore();
  }
  return { logs: recorder.logs, warnings };
}

describe('strict agents are skipped, not thrown', () => {
  it('should skip a strict agent on add, print its reason, and write nothing', async () => {
    await withTempDirAsync(async dir => {
      const { logs } = await addStrictAgent(dir, writeCatalog(dir));
      const advice = logs.join('\n');
      assert.match(advice, /skipped/);
      assert.match(advice, /shell/);
      assert.equal(fs.existsSync(path.join(dir, '.fake')), false);
    });
  });

  it('should write a nearest agent and warn that shell was mapped inexactly', async () => {
    await withTempDirAsync(async dir => {
      const { warnings } = await addStrictAgent(dir, writeCatalog(dir, 'nearest'));
      assert.ok(fs.existsSync(path.join(dir, '.fake/agents/code-reviewer.md')));
      const warning = warnings.join('\n');
      assert.match(warning, /shared\/code-reviewer/);
      assert.match(warning, /shell/);
    });
  });

  it('should leave a strict agent out of a compile', async () => {
    const agent = makeAgent({ tools: ['read', 'shell'] }) as unknown as Artifact;
    const options: CompileOptions = { version: '0.0.0', packs: [] };
    const files = await getTarget(FAKE_TARGET).compile(resolvedOf([agent]), options);
    assert.deepEqual(Object.keys(files), []);
  });

  it('should not throw when a skill co-installs an agent the target skips', () => {
    const agent = makeAgent({ tools: ['read', 'shell'] }) as unknown as ResolvedArtifact;
    const skill = {
      ...makeSkill({ uses: { rules: [], agents: [agent.id] } }),
      resolvedRules: [],
      resolvedAgentIds: [agent.id],
    } as unknown as ResolvedArtifact;
    const options: ScaffoldOptions = { projectDir: '.', includeDeps: true };
    const files = scaffoldArtifact({
      specs: getTarget(FAKE_TARGET).emitSpecs ?? [],
      artifact: skill,
      catalog: resolvedOf([skill, agent]),
      options,
    });
    assert.ok(files['.fake/skills/cs-generate-tests/SKILL.md']);
    assert.deepEqual(
      Object.keys(files).filter(p => p.includes('/agents/')),
      [],
    );
  });

  it('should report the whole-file skip reason and the nearest warning', () => {
    const strict = makeAgent({ tools: ['read', 'shell'] });
    const nearest = makeAgent({ tools: ['read', 'shell'], toolPolicy: 'nearest' });
    const target = getTarget(FAKE_TARGET);
    assert.match(wholeFileSkipReason(target, strict) ?? '', /shell/);
    assert.equal(wholeFileSkipReason(target, nearest), undefined);
    assert.match(toolWarning(FAKE_AGENT_SPEC, nearest) ?? '', /shell/);
  });
});
