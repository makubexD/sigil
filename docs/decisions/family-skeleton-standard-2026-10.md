# One family, one skeleton (2026-10)

Status: accepted 2026-10-05. Extends `catalog-layout-standard-2026-10.md` (where an artifact goes)
with how the artifacts inside a family are shaped, and replaces its "templatize once overlap is
measured" clause as the way families stay uniform.

## Question

The catalog still looked mixed after the layout standard. The owner asked for one standard,
chosen on evidence, applied everywhere, with the structure settled before the content.

## Evidence

Five read-only research agents and one adversarial review (2026-10-05); key claims checked in code.

- **The folder shape is principled.** 35 per-language skills sit next to two shared skills with stack
  files (`cli`, `wizard`). The variant is picked by the project's language in the first case and by
  the task in the second (both build CLIs in Go or Rust, which have no language namespace).
- **The real non-uniformity is inside families.** Language members of the same family were written in
  two lineages ({angular, csharp, typescript} and {python, react}) with different skeletons: 6 of 7
  agent families and nearly every skill family. Copies have drifted (`cs-audit-deps` says
  "Python version → TFM"; `py-sync-tests` and `react-sync-tests` say "undocumented" for "untested").
- **The earlier overlap metric measured wording, not structure.** Word-4-gram Jaccard of 0.02–0.09
  hid that release, sync-tests, add-package and audit-deps follow the same steps in every language
  (45–70% of each body is the same intent).
- **One concern had four names.** `cs-nuget`, `py-packaging`, `react-npm` and `ts-npm` are one family;
  name-based `catalog-symmetry` could not see that angular has none.
- **Official guidance** (Anthropic skill best practices, `anthropics/skills`, OpenAI skills) uses one
  shared skill with per-language references for same-workflow skills. It does not carry over to
  sigil's catalog: agents and rules cannot load references and rules activate by path, frontmatter
  such as `allowedTools` differs per language, and sigil installs per language. Making shared skills
  install for one language would need reference trimming, stack-keyed `uses:`, a new pack selector
  and 35 id migrations.

## Decision

**Every language agent, rule and skill belongs to a family, and every family has exactly one
skeleton.**

- **Families are data**, in `catalog/standard.yaml` (author-only; consumer commands never read it).
  A family lists its kind and its members explicitly, so ids never change to fit a family name, and
  may declare:
  - `sections`: the H2 headings every member has, in order. Step numbering is ignored; a section may
    be `optional`; language-specific material goes under an H3 inside a skeleton section.
  - `keys`: frontmatter every member sets.
  - `absent`: a language with no member, and why.
- **One severity scale.** `standard.yaml` declares `severities` (Critical, High, Medium, Low, the
  scale the security auditors already used); every report template grades findings on it, so two
  agents' reports compare. The content pass moved the code and architecture reviewers off
  Critical/Major/Minor/Nit.
- **A section is optional only while a member lacks it.** The content pass filled every gap, so every
  skeleton section is now required; `optional` stays in the format for a new family's first members.
- **Structure before content.** Skeletons and checks come first; member text may stay rough until a
  content pass fills it.
- **Who picks the variant decides delivery**, unchanged from the layout standard: the project's
  language gives one artifact per language; a task-chosen stack gives one shared skill with
  `references/stack-<id>.md`.
- **One vocabulary as data.** Each `language.yaml` names its artifact-name `prefix` and its `stack`;
  stacks are declared once in `standard.yaml` (go and rust are stacks with no language).
- **Templates hold shared prose, not structure.** A family's skeleton lives in `standard.yaml`; a
  `template:` is added only where members repeat real prose, so a template is never a list of headings.
- **scaffold-project is two families**: create a new project (python, react) and add a project to an
  existing solution or workspace (`add-project`: csharp, typescript). Members keep their ids.

## Guards

- `family-skeleton` (`sync --check`, error): a member missing from the catalog, of another kind, or
  in two families; sections that drift from the skeleton; a missing required key; a language artifact
  in no family.
- Rule families declare keys only (`appliesTo`, `appliesToRationale`): a rule's H2s are its
  language-specific topics, not steps. Templated families (`release`, `code-quality`) take their
  sections from the template, so members with `template:` are not compared.
- `catalog-layout` (error, when `standard.yaml` exists): a language without a prefix or stack, a stack
  not declared, a name off its language's prefix, a stack file for an undeclared stack, a language
  rule glob without a leading double-star segment (it matches only at the repository root, so a
  monorepo's nested projects never get the rule), and a shared rule that two rules of one language
  extend (that language loads it twice), a language description that never names its language, and
  a report tier heading (`#### Major`, `#### Low / Informational`) that is not exactly one declared
  severity.
  Only `*-code-quality` extends `shared/clean-code`.
- `catalog-symmetry` (warning) reads families from the data, honouring `absent`.

## Rejected

- **Shared skill plus stack files for every skill.** See the evidence: two shapes would remain
  (agents and rules), per-language frontmatter would be widened or lost, and installs would carry
  every language until the engine learns to trim.
- **A template for every family.** Most families share structure, not prose; heading-only templates
  would add indirection without removing duplication.
- **Renaming ids to match families** (package-manager, add-project). A renamed rule or skill leaves
  the old installed file loaded next to the new one; membership as data needs no rename.
