/**
 * Tests for src/authoring/import/ — translate.ts + plan.ts (renderArtifactFile).
 *
 * All tests are pure (no disk I/O) except renderArtifactFile which we test by
 * parsing the output with gray-matter and asserting the round-trip is correct.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';
import { slugToTitle, translateFrontmatter } from '../../dist-cli/authoring/import/translate';
import { renderArtifactFile } from '../../dist-cli/authoring/import/plan';

// ─── slugToTitle ──────────────────────────────────────────────────────────────

describe('slugToTitle', () => {
  it('strips cs- prefix and appends displayName', () => {
    assert.equal(slugToTitle('cs-generate-tests', '.NET / C#'), 'Generate Tests (.NET / C#)');
  });

  it('strips ts- prefix', () => {
    assert.equal(slugToTitle('ts-audit-deps', 'TypeScript'), 'Audit Deps (TypeScript)');
  });

  it('strips ng- prefix and applies acronym map', () => {
    assert.equal(slugToTitle('ng-rxjs', 'Angular'), 'RxJS (Angular)');
  });

  it('applies acronym map to API', () => {
    assert.equal(
      slugToTitle('cs-api-compat-reviewer', '.NET / C#', 'csharp'),
      'API Compat Reviewer (.NET / C#)',
    );
  });

  it('handles slug with no known prefix', () => {
    assert.equal(slugToTitle('xunit-testing', '.NET / C#'), 'Xunit Testing (.NET / C#)');
  });

  it('single-word slug', () => {
    assert.equal(slugToTitle('cs-release', '.NET / C#'), 'Release (.NET / C#)');
  });
});

// ─── translateFrontmatter: rule ───────────────────────────────────────────────

describe('translateFrontmatter — rule', () => {
  const opts = { language: 'csharp', displayName: '.NET / C#' };

  it('maps paths → appliesTo', () => {
    const { frontmatter } = translateFrontmatter(
      'rule',
      'cs-async',
      {
        description: 'Async conventions.',
        paths: ['**/*.cs'],
      },
      opts,
    );
    assert.deepEqual(frontmatter.appliesTo, ['**/*.cs']);
  });

  it('defaults appliesTo to ["**/*"] when paths absent', () => {
    const { frontmatter } = translateFrontmatter('rule', 'cs-code-quality', {}, opts);
    assert.deepEqual(frontmatter.appliesTo, ['**/*']);
  });

  it('synthesises severity and extends', () => {
    const { frontmatter } = translateFrontmatter('rule', 'cs-async', { description: 'x' }, opts);
    assert.equal(frontmatter.severity, 'recommended');
    assert.deepEqual(frontmatter.extends, []);
  });

  it('tags contain language and slug words (prefix stripped)', () => {
    const { frontmatter } = translateFrontmatter('rule', 'cs-project-layout', {}, opts);
    assert.ok(frontmatter.tags.includes('csharp'), 'has language tag');
    assert.ok(frontmatter.tags.includes('project'), 'has slug word');
    assert.ok(frontmatter.tags.includes('layout'), 'has slug word');
    assert.ok(!frontmatter.tags.includes('cs'), 'prefix stripped from tags');
  });

  it('id is <language>/<slug>', () => {
    const { frontmatter } = translateFrontmatter('rule', 'cs-async', {}, opts);
    assert.equal(frontmatter.id, 'csharp/cs-async');
  });

  it('unknown source fields go into droppedFields', () => {
    const { droppedFields } = translateFrontmatter(
      'rule',
      'cs-async',
      {
        description: 'x',
        unexpectedField: 'foo',
      },
      opts,
    );
    assert.ok(droppedFields.includes('unexpectedField'));
    assert.ok(!droppedFields.includes('description'));
  });
});

// ─── translateFrontmatter: agent ──────────────────────────────────────────────

describe('translateFrontmatter — agent', () => {
  const opts = { language: 'csharp', displayName: '.NET / C#' };

  it('maps comma-string tools to array', () => {
    const { frontmatter } = translateFrontmatter(
      'agent',
      'cs-debugger',
      {
        name: 'cs-debugger',
        description: 'Debugger agent.',
        tools: 'Read, Grep, Glob, Bash, Edit',
      },
      opts,
    );
    assert.deepEqual(frontmatter.tools, ['Read', 'Grep', 'Glob', 'Bash', 'Edit']);
  });

  it('handles tools with no spaces around commas', () => {
    const { frontmatter } = translateFrontmatter(
      'agent',
      'cs-debugger',
      {
        tools: 'Read,Grep,Bash',
      },
      opts,
    );
    assert.deepEqual(frontmatter.tools, ['Read', 'Grep', 'Bash']);
  });

  it('preserves name from frontmatter (incl. prefix)', () => {
    const { frontmatter } = translateFrontmatter(
      'agent',
      'cs-code-reviewer',
      {
        name: 'cs-code-reviewer',
        description: 'x',
        tools: 'Read',
      },
      opts,
    );
    assert.equal(frontmatter.name, 'cs-code-reviewer');
  });

  it('falls back to slug when name absent', () => {
    const { frontmatter } = translateFrontmatter(
      'agent',
      'cs-debugger',
      {
        description: 'x',
        tools: 'Read',
      },
      opts,
    );
    assert.equal(frontmatter.name, 'cs-debugger');
  });
});

// ─── translateFrontmatter: skill ─────────────────────────────────────────────

describe('translateFrontmatter — skill', () => {
  const opts = { language: 'csharp', displayName: '.NET / C#' };

  it('maps allowed-tools (comma string) to allowedTools array', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        'allowed-tools': 'Read, Write, Edit, Bash, Glob, Grep',
        description: 'Generate tests.',
      },
      opts,
    );
    assert.deepEqual(frontmatter.allowedTools, ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']);
  });

  it('maps argument-hint to argumentHint', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        'argument-hint': '[file-or-class] (optional)',
        description: 'x',
      },
      opts,
    );
    assert.equal(frontmatter.argumentHint, '[file-or-class] (optional)');
  });

  it('maps disable-model-invocation: true to disableModelInvocation', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-release',
      {
        'disable-model-invocation': true,
        description: 'x',
      },
      opts,
    );
    assert.equal(frontmatter.disableModelInvocation, true);
  });

  it('omits disableModelInvocation when false/absent', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      opts,
    );
    assert.equal(frontmatter.disableModelInvocation, undefined);
  });

  it('when_to_use goes into bodyPrefix, NOT description', () => {
    const { frontmatter, bodyPrefix } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'Generate tests.',
        when_to_use: 'Use when you need tests.',
      },
      opts,
    );
    // description stays clean
    assert.equal(frontmatter.description, 'Generate tests.');
    assert.ok(!frontmatter.description.includes('when_to_use'), 'when_to_use not in description');
    assert.ok(!frontmatter.description.includes('\n'), 'description is single-line');
    // body prefix carries the when_to_use content
    assert.ok(bodyPrefix?.includes('## When to Use'), 'bodyPrefix has heading');
    assert.ok(bodyPrefix?.includes('Use when you need tests.'), 'bodyPrefix has content');
  });

  it('bodyPrefix is undefined when when_to_use absent', () => {
    const { bodyPrefix } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      opts,
    );
    assert.equal(bodyPrefix, undefined);
  });

  it('synthesizes uses: { rules: [], agents: [] }', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      opts,
    );
    assert.deepEqual(frontmatter.uses, { rules: [], agents: [] });
  });

  it('appliesTo defaults to ["**/*"]', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      opts,
    );
    assert.deepEqual(frontmatter.appliesTo, ['**/*']);
  });
});

// ─── renderArtifactFile ───────────────────────────────────────────────────────

describe('renderArtifactFile', () => {
  function parse(content: string): Record<string, unknown> {
    return matter(content).data as Record<string, unknown>;
  }

  it('round-trips a rule via gray-matter', () => {
    const { frontmatter } = translateFrontmatter(
      'rule',
      'cs-async',
      {
        description: 'Async correctness.',
        paths: ['**/*.cs'],
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const content = renderArtifactFile(frontmatter, '\nBody text.\n');
    const parsed = parse(content);
    assert.equal(parsed.id, 'csharp/cs-async');
    assert.equal(parsed.kind, 'rule');
    assert.deepEqual(parsed.appliesTo, ['**/*.cs']);
    assert.equal(parsed.severity, 'recommended');
  });

  it('round-trips a skill with argumentHint containing [ via gray-matter', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'Generate tests.',
        'allowed-tools': 'Read, Write',
        'argument-hint': '[file-or-class] (optional)',
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const content = renderArtifactFile(frontmatter, '\nBody.\n');
    // gray-matter must parse without throwing ([ was previously unquoted → YAML parse error)
    const parsed = parse(content);
    assert.equal(parsed.argumentHint, '[file-or-class] (optional)');
    assert.deepEqual(parsed.allowedTools, ['Read', 'Write']);
  });

  it('round-trips glob patterns in appliesTo via gray-matter', () => {
    const { frontmatter } = translateFrontmatter(
      'rule',
      'cs-async',
      {
        description: 'x',
        paths: ['**/*.cs', '**/*.csproj'],
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const content = renderArtifactFile(frontmatter, '\nBody.\n');
    // gray-matter must parse without throwing (**/*.cs was previously unquoted → YAML alias error)
    const parsed = parse(content);
    assert.deepEqual(parsed.appliesTo, ['**/*.cs', '**/*.csproj']);
  });

  it('uses block serializes as { rules: [], agents: [] } (not blank values)', () => {
    const { frontmatter } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const content = renderArtifactFile(frontmatter, '\nBody.\n');
    const parsed = parse(content);
    assert.deepEqual(parsed.uses, { rules: [], agents: [] });
  });

  it('disableModelInvocation emitted only when true', () => {
    const { frontmatter: fmTrue } = translateFrontmatter(
      'skill',
      'cs-release',
      {
        description: 'x',
        'disable-model-invocation': true,
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const contentTrue = renderArtifactFile(fmTrue, '\n');
    const parsedTrue = parse(contentTrue);
    assert.equal(parsedTrue.disableModelInvocation, true);

    const { frontmatter: fmFalse } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'x',
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const contentFalse = renderArtifactFile(fmFalse, '\n');
    const parsedFalse = parse(contentFalse);
    assert.equal(parsedFalse.disableModelInvocation, undefined);
  });

  it('when_to_use is in body not in description field', () => {
    const { frontmatter, bodyPrefix } = translateFrontmatter(
      'skill',
      'cs-generate-tests',
      {
        description: 'Generate tests.',
        when_to_use: 'Use after coding.',
      },
      { language: 'csharp', displayName: '.NET / C#' },
    );
    const body = bodyPrefix ? `${bodyPrefix}Original body.\n` : 'Original body.\n';
    const content = renderArtifactFile(frontmatter, body);
    const parsed = matter(content);
    // description is clean single-line
    assert.equal((parsed.data as Record<string, unknown>).description, 'Generate tests.');
    // body contains the when_to_use section
    assert.ok(parsed.content.includes('## When to Use'), 'body has heading');
    assert.ok(parsed.content.includes('Use after coding.'), 'body has content');
  });
});
