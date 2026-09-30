# Template extraction: measured evidence, 2026-08-05

## Question

The architecture plan called for authoring 5 catalog templates (`workflow-skill`,
`reference-skill`, `specialist-agent`, `convention-rule`, `config-note`) to hoist shared body
structure out of the ~95 catalog artifacts. Before writing any of them: does the catalog actually
contain the verbatim duplication a template exists to remove?

## Method

For each candidate family, searched for exact-duplicate lines (≥40 chars — the same threshold
`validate/template-checks.ts`'s `literalLines` heuristic uses) across sibling files, then read the
full text under matching headings in at least two siblings to check whether the _prose_, not just
the heading, was duplicated.

## Findings

**`config-note` → real, narrowed to `mcp-note`.** All 4 `shared/*.mcp.md` artifacts share one
exact authoring-hint HTML comment verbatim
(`<!-- Describe what this MCP server provides. The server: above is merged into .mcp.json. -->`).
`shared/protect-config.hook.md` and `shared/allow-dev-tools.settings.md` are each the only artifact
of their kind — a template needs ≥3 concrete examples of the same duplication (the project's own
`ts-code-quality` rule) to be worth the indirection, so hook/settings stayed hand-authored.
**Built**: `catalog/shared/templates/mcp-note.template.md`, applied to all 4 mcp artifacts.

**`workflow-skill` / `reference-skill` (skills)** — not built. `## When to Use` /
`## Step 1 — Resolve target` / `## Step 3 — Read the target` / `## Step 5 — Run and report`
headings do repeat verbatim across `cs-generate-tests` / `ts-generate-tests` / `ng-generate-tests`,
but the prose under every one of them diverges: different discovery mechanisms (`.sln` vs
`package.json` vs `angular.json`), different mock/test frameworks (Moq vs `vi.fn()` vs
`HttpTestingController`), different report formats. Hoisting the prose would mean forcing
per-language guidance into a shared mold; hoisting only the headings saves one short line per
artifact for real machinery cost.

**`specialist-agent` (agents)** — not built. `## 1. Determine scope` (15/26 files) and `## 5.
Output` (11/26) headings repeat, but `cs-code-reviewer` vs `ts-code-reviewer`'s "Determine scope"
paragraphs use different scope-derivation language, and their "Output" report formats name
different tools (`tsc`/`eslint`/`vitest` vs nothing C#-specific) and word severity tiers
differently even where the concept matches (`"in a main path"` vs `"in main path"`). Same
per-role, per-language divergence pattern as skills — see the persona-sentence duplicates below.

**`convention-rule` (rules)** — not built. `## Naming` (6 files), `## Never` (4), `## Error
Handling` (4) headings repeat; the tables underneath are structurally similar (Symbol/Style/Example
columns) but the actual naming conventions differ by language on purpose (`_camelCase` vs
`#camelCase` private fields, `IPascalCase` vs no-I-prefix interfaces) — this is the content the
rule exists to state, not incidental duplication.

**Persona sentences** (agents): a handful of one-line personas repeat exactly twice each
(`"You are an independent code reviewer. Audit code objectively..."`,
`"You are a security auditor. Your sole output is..."`) — these are per-_role_ pairs (one language

- its `shared/` counterpart or a close sibling), not a catalog-wide pattern. Below the 3-example
  bar; noted here in case a third sibling in the same role appears later.

## Outcome

Only `mcp-note` shipped. The other four planned templates are not abandoned — they're gated on
future measured duplication, not built speculatively now. If a third language adds e.g.
`py-generate-tests` and its prose turns out to genuinely match the ts/cs/ng trio beyond headings,
re-run this same line-level check before extracting `workflow-skill`.
