# SPEC (rev 2, after review): one catalog standard — "one family, one skeleton"

## Objective

One structural standard for the whole catalog, chosen on evidence (5 research agents + 1 adversarial
review; key claims spot-checked in code).

## Findings that drive it

- **Folder shape** (visible): 35 per-language skills vs 2 shared skills with stack files. This part is
  principled: the variant is picked by the project's language vs by the task (cli/wizard build CLIs in
  Go/Rust, which have no language namespace).
- **Inside families** (the real non-uniformity): members of the same family were written in two lineages
  ({ng, cs, ts} vs {py, react}) with different skeletons — 6 of 7 agent families, nearly every skill
  family. Copies have drifted: `cs-audit-deps:44` "Python version → TFM"; `py/react-sync-tests:51`
  "undocumented" for "untested". Rules: `py/react-conventions` claim to extend clean-code but don't;
  `ng/cs-conventions` and `*-code-quality` both extend it (double load); root-only vs `**/` globs;
  `react-security` misses `.jsx`; the package-manager family has four names. `ts-generate-tests`'s
  description never says TypeScript.

## The standard

**Every artifact belongs to a family; every family has exactly one skeleton.**

1. **Skeleton** = the ordered H2 section list (+ required frontmatter keys) declared once per family.
   A new `family-skeleton` check enforces it for every member, templated or not.
2. **Shared prose** moves into a `template:` only where measured overlap passes a documented threshold
   (skeleton + prose, not just wording). Below it, the family gets the structural check only.
   This amends the CLAUDE.md "templatize only after measured overlap" invariant via a superseding ADR.
3. **Who picks the variant decides delivery**: the project's language → one artifact per language
   (build-time); the task → one shared skill + `references/stack-<id>.md` (run-time), Markdown-linked.
4. **One vocabulary as data**: language id → prefix → pack stem → stack id, read and validated by
   `catalog-layout`.
5. **Descriptions name their language** (checked) so per-language members never compete in a polyglot repo.

### Rejected: shared skill + stack files for everything

Agents and rules can't load references and rules activate by path, so the catalog would still have two
shapes; frontmatter (`allowedTools`) differs per language; sigil's install unit is a language. (Engine
cost — reference trimming, stack-keyed `uses:`, pack selection, 35 id migrations — is secondary.)

## Tasks (P0 must, P1 should, P2 could)

- P0 **ADR + invariant amendment** (supersedes the overlap clause; defines threshold; records the
  canonical-form choice and why).
- P0 **Spike first**: one agent family (debugger) + generate-tests end to end through Claude, Copilot and
  the open standard; snapshot diff; decide numbering (unnumbered H2s or numbering inside slots — template
  prose can't hold `## N.` when optional steps exist, `src/templates.ts:35-41`).
- P0 **`family-skeleton` check** with a deliberately divergent fixture that fails.
- P0 **Canonical skeleton per family**, chosen by comparison (not majority); convert all members
  (7 agent families, 6 skill families; scaffold-project per open question 1).
- P0 **Fix the confirmed defects** (copy errors, false/double `extends`, `.jsx` gaps, descriptions).
- P1 Rules conventions: `**/` globs from `language.yaml`; only `*-code-quality` extends clean-code;
  package-manager family via a **family alias map** (no rename — an id rename leaves the old installed
  rule file loaded next to the new one).
- P1 Vocabulary table as data + validation; pack stems `<lang>-starter|tooling`.
- P1 Templates only where the threshold passes (each needs a dated `docs:` citation).
- P1 Round-trip check of `new`/`patch`/`edit`/`import` on slot-only agent bodies.
- P2 Cosmetic sweep via `sync --apply` (scaffold comments, tag style, key order, title format).

## Out of scope

cli/wizard delivery; merging per-language skills into runtime-stack skills; artifact id changes.

## Success criteria (verifiable)

- `sync --check`: 0 errors including `family-skeleton`; the divergent fixture fails it.
- A test asserts the emitted path set and the artifact id set are unchanged against today's baseline.
- Against the frozen install `test/fixtures/installs/master-8882c86`, `status`/`update` report changed
  artifacts as `outdated`, never `modified` or a conflict; the `release-skill` template revision is unchanged.
- Every per-language description names its language (checked).

## Riskiest assumption

One skeleton fits all five languages for the weakest families (document, generate-tests, scaffold:
25–35% shared intent). The spike tests it before the sweep.

## Decisions (owner, 2026-10-05)

- Approved. **Structure first ("close the roots")**: the skeleton, the family data and the checks come
  before content; artifact text may stay rough or wrong until a later content pass.
- scaffold-project becomes two families: new project, and add a project to an existing solution.
  Members keep their ids (family membership is explicit data); renames wait for a content pass.
- generate-tests: one form (the workflow) for all five; py/react convention content moves to their
  reference or rule.
- Outputs stay the files each AI officially supports; the neutral structure is rendered per target.
