/**
 * Minimal in-memory artifact and catalog fixture factories for tests.
 *
 * Use these instead of re-declaring inline fake objects in each test file.
 * All returned objects are plain JSON-serializable shapes matching the runtime
 * Artifact / ResolvedCatalog types — no disk I/O, no async.
 */
// ── Individual artifact factories ─────────────────────────────────────────────

export interface FakeRule {
  id: string;
  kind: 'rule';
  filePath: string;
  frontmatter: {
    id: string;
    kind: 'rule';
    title: string;
    description: string;
    severity: string;
    appliesTo: string[];
    tags: string[];
    extends: string[];
    [key: string]: unknown;
  };
  body: string;
}

export interface FakeAgent {
  id: string;
  kind: 'agent';
  filePath: string;
  frontmatter: {
    id: string;
    kind: 'agent';
    title: string;
    description: string;
    name: string;
    [key: string]: unknown;
  };
  body: string;
}

export interface FakeSkill {
  id: string;
  kind: 'skill';
  filePath: string;
  frontmatter: {
    id: string;
    kind: 'skill';
    title: string;
    description: string;
    name: string;
    language?: string;
    uses?: { rules?: string[]; agents?: string[] };
    [key: string]: unknown;
  };
  body: string;
}

/**
 * Create a minimal fake rule artifact.
 * `fmOverrides` is shallow-merged into frontmatter so tests can tweak any field.
 */
export function makeRule(fmOverrides: Record<string, unknown> = {}): FakeRule {
  return {
    id: 'test/fake',
    kind: 'rule',
    filePath: '/fake/fake.rule.md',
    frontmatter: {
      id: 'test/fake',
      kind: 'rule',
      title: 'Fake Rule',
      description: 'A fake artifact for testing.',
      severity: 'recommended',
      appliesTo: ['**/*.ts'],
      tags: ['foo', 'bar'],
      extends: [],
      ...fmOverrides,
    },
    body: '- Fake body.',
  };
}

/** Alias matching the original helper name used in block G. */
export const makeRuleArtifact = makeRule;

/** Create a minimal fake agent artifact. */
export function makeAgent(fmOverrides: Record<string, unknown> = {}): FakeAgent {
  return {
    id: 'shared/code-reviewer',
    kind: 'agent',
    filePath: '/catalog/shared/agents/code-reviewer.agent.md',
    frontmatter: {
      id: 'shared/code-reviewer',
      kind: 'agent',
      title: 'Code Reviewer',
      description: 'desc',
      name: 'code-reviewer',
      ...fmOverrides,
    },
    body: '# Reviewer',
  };
}

/** Create a minimal fake skill artifact. */
export function makeSkill(fmOverrides: Record<string, unknown> = {}): FakeSkill {
  return {
    id: 'csharp/cs-generate-tests',
    kind: 'skill',
    filePath: '/catalog/languages/csharp/skills/cs-generate-tests/SKILL.md',
    frontmatter: {
      id: 'csharp/cs-generate-tests',
      kind: 'skill',
      title: 'Generate Tests',
      description: 'desc',
      name: 'cs-generate-tests',
      language: 'csharp',
      uses: { rules: ['shared/clean-code'], agents: ['shared/code-reviewer'] },
      ...fmOverrides,
    },
    body: '# Skill',
  };
}

// ── Catalog factory ───────────────────────────────────────────────────────────

type AnyArtifact = FakeRule | FakeAgent | FakeSkill | Record<string, unknown>;

/**
 * Build a minimal in-memory catalog (no disk I/O) from a list of artifacts.
 * Matches the shape consumed by planMove, resolveSelection, etc.
 */
export function makeCatalog(artifacts: AnyArtifact[]) {
  const byId = new Map<string, AnyArtifact>(artifacts.map(a => [(a as any).id, a]));
  return { artifacts, byId, languages: new Map<string, unknown>() };
}

/**
 * Build the specific fake catalog used by the move-planner tests (block J).
 * Contains one rule, one agent, and one skill that references both.
 */
export function buildFakeCatalog() {
  const rule: FakeRule = {
    id: 'shared/clean-code',
    kind: 'rule',
    filePath: '/catalog/shared/rules/clean-code.rule.md',
    frontmatter: {
      id: 'shared/clean-code',
      kind: 'rule',
      title: 'Clean Code',
      description: 'desc',
      appliesTo: ['**/*'],
      severity: 'recommended',
      extends: [],
      tags: [],
    },
    body: '- Clean.',
  };
  const agent: FakeAgent = {
    id: 'shared/code-reviewer',
    kind: 'agent',
    filePath: '/catalog/shared/agents/code-reviewer.agent.md',
    frontmatter: {
      id: 'shared/code-reviewer',
      kind: 'agent',
      title: 'Code Reviewer',
      description: 'desc',
      name: 'code-reviewer',
    },
    body: '# Reviewer',
  };
  const skill: FakeSkill = {
    id: 'csharp/cs-generate-tests',
    kind: 'skill',
    filePath: '/catalog/languages/csharp/skills/cs-generate-tests/SKILL.md',
    frontmatter: {
      id: 'csharp/cs-generate-tests',
      kind: 'skill',
      title: 'Generate Tests',
      description: 'desc',
      name: 'cs-generate-tests',
      language: 'csharp',
      uses: { rules: ['shared/clean-code'], agents: ['shared/code-reviewer'] },
    },
    body: '# Skill',
  };
  return makeCatalog([rule, agent, skill]);
}
