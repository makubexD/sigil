/**
 * A team catalog for tests: the bundled catalog copied beside the project, plus one rule
 * (`shared/team-only`) that exists only there.
 *
 * `status`, `prune` and `update` must judge a manifest entry against the catalog it was installed
 * from, so a test needs a real second catalog that validates on its own rather than a stubbed one.
 */
import fs from 'node:fs';
import path from 'node:path';

/** From test-compiled/helpers/ we go up two levels to the project root. */
const ROOT = path.resolve(__dirname, '../..');

/** Absolute paths to the copied catalog directory and its `packs.yaml`. */
export interface TeamCatalog {
  dir: string;
  packs: string;
}

/**
 * The bundled shared rule the team rule is copied from. It is a base rule, so the copy adds no
 * `extends` target of its own and stays valid on its own.
 */
const SOURCE_RULE = path.join(ROOT, 'catalog/shared/rules/clean-code.rule.md');

/** `source` with the rule's frontmatter id and title rewritten to the team rule's. */
function teamRuleSource(source: string): string {
  const withId = source.replace(/^id: shared\/clean-code$/m, 'id: shared/team-only');
  const withTitle = withId.replace(/^title: Clean Code Baseline$/m, 'title: Team only');
  if (withId === source || withTitle === withId) {
    throw new Error(`could not rewrite ${SOURCE_RULE} into shared/team-only`);
  }
  return withTitle;
}

/**
 * Declares the copied rule as a second base in the COPIED `standard.yaml` only: a shared rule that
 * is neither a family member nor a base fails `family-skeleton` (`sigil sync --check`). The
 * bundled catalog's own standard.yaml is never touched.
 */
function registerBase(dir: string): void {
  const file = path.join(dir, 'standard.yaml');
  const text = fs.readFileSync(file, 'utf8');
  const edited = text.replace(
    /^bases: \[shared\/clean-code, shared\/git\]$/m,
    'bases: [shared/clean-code, shared/git, shared/team-only]',
  );
  if (edited === text) throw new Error(`could not register shared/team-only in ${file}`);
  fs.writeFileSync(file, edited);
}

/**
 * Copies the bundled catalog and packs.yaml into `<root>/team-catalog`, then adds the
 * `shared/team-only` rule copied from a bundled shared rule.
 */
export function makeTeamCatalog(root: string): TeamCatalog {
  const dir = path.join(root, 'team-catalog');
  fs.cpSync(path.join(ROOT, 'catalog'), dir, { recursive: true });
  const packs = path.join(dir, 'packs.yaml');
  fs.copyFileSync(path.join(ROOT, 'packs.yaml'), packs);
  fs.writeFileSync(
    path.join(dir, 'shared/rules/team-only.rule.md'),
    teamRuleSource(fs.readFileSync(SOURCE_RULE, 'utf8')),
  );
  registerBase(dir);
  return { dir, packs };
}
