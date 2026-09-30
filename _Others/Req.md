I ran this command:
`node .\dist-cli\cli.js add --project-dir C:\WorkspaceMaku\TestCaI`

I pointed it to a test project and generated these artifacts:
`sigil add skill\:angular/ng-add-package skill\:angular/ng-audit-deps skill\:angular/ng-document --target copilot --yes`

Target = `copilot`.

Now inspect what was generated in the target directory.

I noticed something important:

The information in the **skill header/front matter is much smaller and less useful than the actual content inside the skill**. The header should contain the important metadata needed by the target AI provider, but the generated artifact also needs to preserve the important behavior, instructions, boundaries, and context from the catalog.

I also found another possible problem.

For example, `ng-security-auditor.agent.md` contains:

`## 2. Discover conventions and security baseline`

Inside that section it says:

`Read CLAUDE.md and any rules files present`

STOP and analyze this deeply.

Why would a generated **Copilot** artifact explicitly tell Copilot to read `CLAUDE.md`?

If the catalog is supposed to be **AI-provider agnostic**, this looks wrong. Even worse, when the target is explicitly `copilot`, generating instructions that reference Claude-specific files makes little sense.

But do NOT assume this example is the only problem.

### What I want you to do

1. **Analyze the entire catalog.**

   - Inspect every relevant skill.
   - Inspect every agent.
   - Inspect every rule.
   - Inspect every template.
   - Inspect generators/translators.
   - Inspect metadata/front matter.
   - Inspect the code responsible for generating artifacts for each AI provider.

2. Find **all provider-specific leakage**.
   Look for things like:

   - `CLAUDE.md`
   - Claude-specific instructions
   - Copilot-specific instructions inside the provider-neutral catalog
   - Provider-specific paths
   - Provider-specific commands
   - Provider-specific terminology
   - Provider-specific metadata
   - Anything else that breaks the idea of an agnostic catalog.

3. Determine what belongs where.

The catalog should contain the **canonical, provider-agnostic knowledge**.
Then, when generating an artifact for a specific provider, the system should transform/adapt that canonical information into the format and conventions required by that provider.

Think:

`Catalog → Canonical Artifact → Provider Translation → Copilot / Claude / Other`

NOT:

`Catalog → Artifact containing random Claude/Copilot assumptions`

4. Analyze the artifact headers/front matter.

The generated artifact currently appears to lose important information compared with the source artifact.

Determine:

- What metadata is actually required?
- What metadata is useful?
- What metadata is provider-specific?
- What information should stay in the body?
- What information should be in front matter?
- What information should never be duplicated?
- What information is being lost during generation?

Do not simply copy everything everywhere. Find the **best optimized structure**.

5. Analyze the existing templates and artifact-creation process.

I believe we already have a skill/template/process intended to help create good artifacts such as:

- Skills
- Agents
- Rules
- Commands
- Other AI artifacts

Find it.

Determine whether it is actually good enough to enforce these principles.
If we already have a good template/process, **improve and reuse it**.
If we do not have one, create or propose the correct canonical process.

6. Research and validate best practices.

Do not make decisions only from what currently exists in this repository.
Analyze the best practices for creating:

- Skills
- Agents
- Rules
- Commands
- Provider-specific AI artifacts

The solution should work well across multiple AI providers, not only Copilot or Claude.
The goal is to avoid creating something that works for one provider but becomes garbage when translated to another.

7. Think about future providers.

Today we may have Copilot and Claude.
Tomorrow we may have other providers.
The architecture should make adding another provider as simple as possible.

Ideally:

`One canonical definition → multiple provider-specific outputs`

Each provider gets only the transformation required for that provider.
Do not pollute the canonical catalog with provider-specific instructions unless there is a very strong reason.

8. Check for redundancy.

If a section or instruction is already represented somewhere else, determine whether it should be removed, merged, or referenced instead.
Do not keep sections just because they already exist.

Ask:

> "Does this information actually help the AI perform the job, or is it noise?"

Optimize for:

- Less duplication
- Less noise
- Clear boundaries
- Small useful artifacts
- Strong instructions
- Provider portability
- Easy maintenance
- Easy future translation

### Important

Do **not** immediately change things based only on the `ng-security-auditor.agent.md` example.
That example is only a signal that something may be wrong.
First perform a **deep analysis of the entire catalog and generation pipeline**.
Then identify the root architectural problem.
Then propose the best solution.
Then implement the solution consistently across the catalog.
The final result should follow this principle:

**Caveman rule:**

> Catalog knows the knowledge.
> Provider knows the format.
> Translator connects them.
> No Claude junk inside Copilot artifacts.
> No Copilot junk inside Claude artifacts.
> Do not lose important information during translation.
> Do not duplicate information for no reason.
> One source of truth. Multiple clean outputs.

Also add comments/references in the appropriate templates or process files pointing to **official provider documentation and other strong references** where useful. These references should help us periodically verify whether provider artifact formats or best practices changed.

This is important because those changes will **not happen automatically**. We need a clear manual maintenance/check process so that when Copilot, Claude, or another provider changes its artifact format or recommendations, we know where to check and what needs to be updated.

Before finishing, show:

1. What is wrong today.
2. Why it is wrong.
3. What the canonical architecture should be.
4. What existing templates/processes can be reused.
5. What needs to change.
6. How the new approach prevents the same problem in the future.
7. What was changed in the catalog and generation pipeline.
8. How the approach supports multiple AI providers.
