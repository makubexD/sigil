/**
 * The OpenCode `prompt` spec. A command file at
 * `.opencode/commands/<slug>.md` writes only `description`, translates `{{name}}` to a
 * positional `$1`, skips a prompt with two or more arguments, and forbids the template syntax
 * OpenCode would run or expand.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { checkOutputContract, deriveContracts } from '../../dist-cli/targets/output-contract';
import { specSkipReason } from '../../dist-cli/targets/tool-restriction';
import { OPENCODE_PROMPT_SPEC } from '../../dist-cli/targets/opencode/spec/prompt';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { loadResolvedCatalog } from '../helpers/catalog';
import type { FileMap, ResolvedArtifact } from '../../dist-cli/types';

const SPLIT_ARGS_SKIP_REASON =
  'OpenCode splits arguments on spaces and quotes, so only the last one can hold several words';
const SHELL_REASON = 'OpenCode runs this shell command in the command template';
const FILE_REASON = 'OpenCode expands this file reference in the command template';

/** A minimal prompt artifact with the given frontmatter, id and body. */
function makePrompt(
  fm: Record<string, unknown> = {},
  id = 'shared/x',
  body = 'Do {{a}}',
): ResolvedArtifact {
  return {
    id,
    kind: 'prompt',
    filePath: '/catalog/shared/prompts/x.prompt.md',
    frontmatter: { id, kind: 'prompt', title: 'Prompt', description: 'desc', ...fm },
    body,
  } as unknown as ResolvedArtifact;
}

/** Renders one prompt through the OpenCode spec. */
function render(prompt: ResolvedArtifact): string {
  return renderArtifact(OPENCODE_PROMPT_SPEC, prompt, {});
}

/** Contract violations for one rendered prompt file. */
function contractViolations(prompt: ResolvedArtifact) {
  const files: FileMap = {
    [OPENCODE_PROMPT_SPEC.outputPath(prompt, {})]: render(prompt),
  };
  return checkOutputContract(files, deriveContracts([OPENCODE_PROMPT_SPEC]));
}

describe('opencode prompt spec', () => {
  it('should write a one-arg prompt to .opencode/commands/ with a positional placeholder', () => {
    const prompt = makePrompt({ args: [{ name: 'a' }] }, 'shared/x', 'Do {{a}}');

    assert.equal(OPENCODE_PROMPT_SPEC.outputPath(prompt, {}), '.opencode/commands/shared-x.md');
    assert.equal(parseFrontmatter(render(prompt)).content.trim(), 'Do $1');
  });

  it('should keep a placeholder that is not in args as literal text', () => {
    const prompt = makePrompt({}, 'shared/x', 'Use {{example}}');

    assert.equal(parseFrontmatter(render(prompt)).content.trim(), 'Use {{example}}');
  });

  it('should keep a description holding a colon intact', () => {
    const description = 'Use for: reviewing code';
    const prompt = makePrompt({ description });

    assert.equal(parseFrontmatter(render(prompt)).data.description, description);
  });

  it('should write only description in the frontmatter', () => {
    const prompt = makePrompt({ args: [{ name: 'a' }] }, 'shared/x', 'Do {{a}}');
    const { data } = parseFrontmatter(render(prompt));

    assert.deepEqual(Object.keys(data), ['description']);
  });

  it('should call a body holding !`cmd` a contract violation with the shell reason', () => {
    const violations = contractViolations(
      makePrompt({ args: [{ name: 'a' }] }, 'shared/x', 'Run !`ls` first.'),
    );

    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.problem, SHELL_REASON);
  });

  it('should call a body holding an @file reference a contract violation with the file reason', () => {
    const violations = contractViolations(
      makePrompt({ args: [{ name: 'a' }] }, 'shared/x', 'See @src/a.ts first.'),
    );

    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.problem, FILE_REASON);
  });

  it('should allow a scoped package name and an email address', () => {
    const violations = contractViolations(
      makePrompt({ args: [{ name: 'a' }] }, 'shared/x', 'Ask `@angular/core` or a@b.co.'),
    );

    assert.deepEqual(violations, []);
  });

  it('should skip a prompt with two or more args with the quoting reason', () => {
    const prompt = makePrompt({
      args: [{ name: 'diff' }, { name: 'audience' }],
    });

    assert.equal(OPENCODE_PROMPT_SPEC.skipReason?.(prompt.frontmatter), SPLIT_ARGS_SKIP_REASON);
    assert.equal(specSkipReason(OPENCODE_PROMPT_SPEC, prompt), SPLIT_ARGS_SKIP_REASON);
  });

  it('should not skip a prompt with one arg', () => {
    const prompt = makePrompt({ args: [{ name: 'a' }] });

    assert.equal(OPENCODE_PROMPT_SPEC.skipReason?.(prompt.frontmatter), undefined);
  });

  it('should render both catalog prompts with no forbid hit', async () => {
    const catalog = await loadResolvedCatalog();
    const files: FileMap = {};

    for (const id of ['shared/explain-diff', 'shared/author-artifact']) {
      const prompt = catalog.byId.get(id);
      assert.ok(prompt, `${id} is in the bundled catalog`);
      files[OPENCODE_PROMPT_SPEC.outputPath(prompt, {})] = renderArtifact(
        OPENCODE_PROMPT_SPEC,
        prompt,
        {},
      );
    }

    assert.deepEqual(checkOutputContract(files, deriveContracts([OPENCODE_PROMPT_SPEC])), []);
  });
});
