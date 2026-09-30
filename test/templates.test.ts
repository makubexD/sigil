/**
 * Tests for src/templates.ts — slot parsing and template composition.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlots, composeTemplate, composeArtifactAgainstTemplate } from '../dist-cli/templates';
import type { Artifact } from '../dist-cli/types';

const REQUIRED_SLOT = { key: 'whenToUse', required: true, description: 'Trigger conditions.' };
const OPTIONAL_SLOT = { key: 'notes', required: false, description: 'Extra caveats.' };

function makeTemplate(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'shared/templates/workflow-skill',
    kind: 'template',
    filePath: '/fake/workflow-skill.template.md',
    frontmatter: {
      id: 'shared/templates/workflow-skill',
      kind: 'template',
      title: 'Workflow Skill',
      description: 'Ordered, step-driven skill template.',
      appliesToKind: ['skill'],
      revision: 1,
      slots: [REQUIRED_SLOT, OPTIONAL_SLOT],
      docs: [{ url: 'https://example.com/docs', verifiedOn: '2026-01-01', covers: 'layout' }],
    },
    body: '## When to Use\n\n<!-- slot: whenToUse -->\n\n## Notes\n\n<!-- slot: notes -->',
    ...overrides,
  };
}

function makeSkillArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'typescript/ts-probe',
    kind: 'skill',
    filePath: '/fake/ts-probe/SKILL.md',
    frontmatter: {
      id: 'typescript/ts-probe',
      kind: 'skill',
      template: 'shared/templates/workflow-skill',
    },
    body: '<!-- slot: whenToUse -->\nUse this when probing.',
    ...overrides,
  };
}

describe('parseSlots', () => {
  it('should parse a single slot with trimmed content', () => {
    // Arrange
    const body = '<!-- slot: whenToUse -->\n  Use this when probing.  \n';

    // Act
    const result = parseSlots(body);

    // Assert
    assert.deepEqual(result.errors, []);
    assert.equal(result.slots.whenToUse, 'Use this when probing.');
  });

  it('should report an error when content precedes the first marker', () => {
    // Arrange
    const body = 'stray text\n<!-- slot: whenToUse -->\ncontent';

    // Act
    const result = parseSlots(body);

    // Assert
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0]!, /content found before the first/);
  });

  it('should report a duplicate-marker error and keep the first occurrence', () => {
    // Arrange
    const body = '<!-- slot: whenToUse -->\nfirst\n<!-- slot: whenToUse -->\nsecond';

    // Act
    const result = parseSlots(body);

    // Assert
    assert.equal(result.slots.whenToUse, 'first');
    assert.ok(result.errors.some(e => e.includes("duplicate slot marker: 'whenToUse'")));
  });

  it('should return no slots and no errors for an empty body', () => {
    // Arrange / Act
    const result = parseSlots('');

    // Assert
    assert.deepEqual(result.slots, {});
    assert.deepEqual(result.errors, []);
  });

  it('should report an error when a non-empty body has no slot markers at all', () => {
    // Arrange / Act
    const result = parseSlots('just plain prose, no markers');

    // Assert
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0]!, /no "<!-- slot: \.\.\. -->" markers/);
  });
});

describe('composeTemplate', () => {
  it('should substitute matching slot content into the template body', () => {
    // Arrange
    const templateBody = '## Heading\n\n<!-- slot: whenToUse -->\n\nDone.';
    const artifactBody = '<!-- slot: whenToUse -->\nTrigger condition.';

    // Act
    const result = composeTemplate(templateBody, [REQUIRED_SLOT], artifactBody);

    // Assert
    assert.deepEqual(result.errors, []);
    assert.match(result.body, /## Heading\n\nTrigger condition\.\n\nDone\./);
  });

  it('should report a missing-required-slot error when the artifact omits it', () => {
    // Arrange
    const templateBody = '<!-- slot: whenToUse -->';

    // Act
    const result = composeTemplate(templateBody, [REQUIRED_SLOT], '');

    // Assert
    assert.ok(result.errors.some(e => e.includes("missing required slot 'whenToUse'")));
  });

  it('should report an unknown-slot error for a key the template does not declare', () => {
    // Arrange
    const templateBody = '<!-- slot: whenToUse -->';
    const artifactBody = '<!-- slot: whenToUse -->\nok\n<!-- slot: bogus -->\nextra';

    // Act
    const result = composeTemplate(templateBody, [REQUIRED_SLOT], artifactBody);

    // Assert
    assert.ok(result.errors.some(e => e.includes("unknown slot 'bogus'")));
  });

  it('should collapse blank lines left by an absent optional slot', () => {
    // Arrange
    const templateBody = 'Start\n\n<!-- slot: notes -->\n\nEnd';

    // Act
    const result = composeTemplate(templateBody, [OPTIONAL_SLOT], '');

    // Assert
    assert.equal(result.body, 'Start\n\nEnd');
  });
});

describe('composeArtifactAgainstTemplate', () => {
  it('should return undefined when the artifact has no template: field', () => {
    // Arrange
    const artifact = makeSkillArtifact({ frontmatter: { id: 'x', kind: 'skill' } });
    const catalog = { byId: new Map<string, Artifact>() };

    // Act
    const result = composeArtifactAgainstTemplate(artifact, catalog);

    // Assert
    assert.equal(result, undefined);
  });

  it('should return undefined when the referenced template id does not exist', () => {
    // Arrange
    const artifact = makeSkillArtifact();
    const catalog = { byId: new Map<string, Artifact>() };

    // Act
    const result = composeArtifactAgainstTemplate(artifact, catalog);

    // Assert
    assert.equal(result, undefined);
  });

  it('should return undefined when the template does not apply to the artifact kind', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: { ...makeTemplate().frontmatter, appliesToKind: ['rule'] },
    });
    const artifact = makeSkillArtifact();
    const catalog = { byId: new Map([[template.id, template]]) };

    // Act
    const result = composeArtifactAgainstTemplate(artifact, catalog);

    // Assert
    assert.equal(result, undefined);
  });

  it('should compose body + slots + templateId when everything lines up', () => {
    // Arrange
    const template = makeTemplate();
    const artifact = makeSkillArtifact();
    const catalog = { byId: new Map([[template.id, template]]) };

    // Act
    const result = composeArtifactAgainstTemplate(artifact, catalog);

    // Assert
    assert.ok(result);
    assert.equal(result!.templateId, 'shared/templates/workflow-skill');
    assert.equal(result!.slots.whenToUse, 'Use this when probing.');
    assert.match(result!.body, /## When to Use\n\nUse this when probing\./);
  });
});
