# SPEC: shared = neutral only; language parts live in their language

Status: proposed, waiting for the owner's go. Evidence: 3 research agents, 1 design agent and an
adversarial review (2026-10-06).

## The owner's rule

- `shared/` holds only language-neutral content.
- Anything specific to a language or stack lives under `languages/<lang>/`.
- There is a generic layer, plus a layer that assembles the final file for every AI tool.
- No duplication. SRP, DRY, KISS and Open/Closed hold.
- `import` follows the same rule.

## Evidence

- **`shared/` is 26% language-specific: 975 of 3,792 lines.**
  - 850 lines are the 10 stack files of `cli` and `wizard`.
  - 33 lines are `settings/allow-dev-tools`, which grants npm/npx only. It also ships in the .NET
    and Python starter packs, so those packs get Node permissions: a real defect.
  - 57 lines are the multi-language `appliesTo` file patterns of `cli-rules` and `wizard-rules`.
    Their bodies are neutral.
  - About 85 more lines are softer TypeScript-flavoured examples inside neutral files.
- **`languages/` duplicates only about 3% generic text** (310 exact lines, ~457 near-verbatim).
  Per-language files are right: siblings share 2-11% of their text.
- **The old decision is reversed.** The layout ADR's case (c) put stack files inside the shared
  skill. This spec reverses it.

## Decision

1. **Generic layer = `shared/`.**
   - It holds the neutral skill: its steps, its neutral references and `standard.yaml`.
2. **Language layer = `languages/<lang>/`.**
   - Each stack file becomes a stack part at `languages/<home>/stack-parts/<skill>.md`. A part has
     no id and no frontmatter. Its stack is the stack named in that folder's `language.yaml`.
   - `standard.yaml` `stacks[].home` names the one language that owns a stack's text. For node-ts
     that is typescript: React and Angular use the same stack, so its text is written once.
   - New `languages/go` and `languages/rust` folders hold their parts (prefixes `go` and `rs`).
3. **Assembly.**
   - One loader, shared by load and import, assembles a skill's own references plus its parts into
     `stack-<id>.md` references. Each reference keeps its source path, so checks point at the real
     file.
   - Resolve fills a `<!-- stack-index -->` marker in `SKILL.md` with a table generated from
     `standard.yaml`.
   - Every target ships the same files at the same paths, and the ids don't change.
4. **Not in this plan:** narrowing an install to the project's detected stack. The task chooses the
   stack, which can differ from the repository's language. References load on demand, so shipping
   all of them costs no context. Plugins are built per pack, not per project. Narrowing needs its
   own decision.

## Slices

| #   | What                                                                                                                | Output for users                                        |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Relocation (listed below)                                                                                           | Byte-identical                                          |
| 2   | Generated stack index (listed below)                                                                                | `cli`/`wizard` `SKILL.md` table regenerated (CHANGELOG) |
| 3   | Content (listed below)                                                                                              | New settings artifacts; old one deprecated              |
| 4   | Import routing (listed below)                                                                                       | none                                                    |
| 5   | Optional: hoist the identical release slot text into its template, only if `catalog:build` output is byte-identical | none                                                    |

**Slice 1, relocation:**

- `stacks[].home` (checked: it must be a language with that stack);
- the go and rust `language.yaml` files;
- the shared loader and `ReferenceFile.sourcePath`;
- `git mv` of the 10 files;
- `move` renames parts;
- layout checks: a part has a shared skill, it sits in its home, and no `stack-*` file remains in
  `shared/`;
- tests: a frozen-install diff, cache invalidation, and the stack checks on the assembled
  references;
- docs: README, ADR, CLAUDE.md, authoring.

**Slice 2, generated stack index:**

- the marker and its table, generated from `displayName`;
- the library names move into the parts' opening lines;
- the mention and link checks read the resolved body.

**Slice 3, content:**

- `ts-`, `cs-` and `py-allow-dev-tools`, with packs pointing at the matching one;
- `shared/allow-dev-tools` gets `deprecated:` with `supersededBy`;
- the soft examples move into the parts;
- a new `stack-leak` warning, driven by `stacks[].terms`.

**Slice 4, import routing:**

- `--shared` sends `stack-<x>.md` to its home's parts, and reports any stack it doesn't know;
- one prefix source: `language.yaml`.

**Kept as is:**

- **`cli-rules`/`wizard-rules` file patterns.** They're file matching, not guidance, and `appliesTo`
  stays unchanged in source.
- **Agent report template: not added.** About 3% duplication isn't worth rewriting 35 agents.
