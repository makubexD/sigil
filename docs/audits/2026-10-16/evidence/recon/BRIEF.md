# Benchmark v2 recon brief (shared by every recon agent)

Goal: find every capability in a repository that could help AI coding agents write correct, efficient, readable,
scalable, secure code with little overengineering and low token cost — so it can later be compared with sigil
(`C:\WorkSpaceMaku\Others\sigil`, a catalog of rules/skills/agents/hooks compiled to Claude Code and GitHub Copilot).

## Hard constraints
- READ-ONLY in the repository you analyze. Do not install, build, run its scripts, or make network requests.
- You may run read-only shell commands (find, wc, grep, git log/show, node -e for counting) and write ONLY into your
  output folder under this scratchpad (`bench2/<your-id>/`).
- Never claim to have read a file you did not read. Mark every statement as **fact** (with path:line) or
  **inference**. Disclose sampling: what you read fully, what you listed only.
- Quotes: at most 25 words each, with `path:line`.

## Outputs (all in `bench2/<your-id>/`)
1. `listing.tsv` — deterministic, produced by a script, not by hand: one row per artifact
   (skill / agent / rule / command / hook / script / workflow / eval / template / config / doc-of-note) with
   `kind<TAB>path<TAB>bytes<TAB>name<TAB>first 160 chars of description`. Cover the whole scope you were given.
2. `inventory.jsonl` — one JSON object per *capability* you assessed in depth (a capability may span several files):
   ```
   {"repo":"","id":"<short-kebab>","paths":["..."],"kind":"skill|agent|rule|hook|command|script|workflow|eval|tool|validator|doc",
    "category":"<one of the categories below, or a new one you justify>",
    "responsibility":"<one sentence: what it actually does, from the body, not the name>",
    "trigger":"<how it activates: always-on / path glob / description match / explicit command / hook event / CI>",
    "scope":"universal | language:<x> | framework:<x> | lifecycle:<stage> | platform:<x>",
    "deps":["..."], "bytes":0,
    "quality":1-5, "qualityEvidence":"<why, with path:line>",
    "bestIdeas":[{"idea":"<one sentence>","quote":"<≤25 words>","at":"path:line"}],
    "weaknesses":["<with path:line where possible>"],
    "tokenCost":"<always-loaded bytes / on-demand / per-invocation; duplication noticed>",
    "portable":"<portable concept | platform-specific (which) | depends on undocumented assumption>"}
   ```
   Categories (start here, extend with evidence): spec-driven-development, requirements, architecture-design,
   planning, implementation-refactoring, language-engineering, framework-engineering, code-review, testing,
   debugging, security, performance, documentation, git-ci-release, orchestration-delegation,
   context-token-management, repo-exploration, tooling-validation, evals-measurement, hooks-automation,
   customization-overlays.
3. `profile.md` — Deliverable A, ≤ 2,500 words: purpose and users; core capabilities; architectural model (how
   artifacts are authored, composed, distributed, activated); key components with paths; target platforms and
   platform assumptions; languages/frameworks covered (and how deep: idioms, types, async, testing, security,
   performance, tooling per language); lifecycle stages covered (spec → plan → implement → verify → review → ship);
   customization/precedence mechanisms; testing/validation/CI of the repo itself (what is checked: structure only,
   or behaviour?); token implications (always-on bytes, duplication); strengths; weaknesses; maintenance burden;
   open questions. Then a section **"Top ideas worth taking"**: up to 15, ranked, each with the idea, path:line,
   why it would raise code quality or cut cost, and what evidence the repo offers that it works (an eval, a test,
   or none).
4. Your final reply to the orchestrator: ≤ 300 words — files written, coverage (counts read fully vs listed),
   the 5 strongest ideas, and anything you could not access.

Work systematically: list first (script), then read the code-relevant artifacts in depth, following references
into implementations (hook scripts, validators, eval runners), not just READMEs.
