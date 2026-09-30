# Provider-neutral catalog bodies: a translation lexicon (2026-08-10)

## Why

`_Others/Req.md` reported that a Copilot-targeted install of `angular/ng-*` produced
`ng-security-auditor.agent.md` telling **Copilot** to "Read `CLAUDE.md`" — a Claude-specific
instruction shipped verbatim into GitHub Copilot output. The ask: analyze the entire catalog and
generation pipeline for provider-specific leakage, determine the canonical architecture, and fix it
consistently — not just the one reported file.

## 1. What was wrong today

The 4-stage pipeline (`load` → `validate` → `resolve` → `targets/<provider>`) is correctly layered,
and every (provider, kind) frontmatter mapping already goes through a declarative `FieldMapping` —
so a provider needing different frontmatter syntax was never a problem. **The body was a different
story: it had no translation mechanism at all.** `renderArtifact()` (`src/targets/emit.ts`) passed
`artifact.body` straight through for every kind except `prompt`/`workflow`, which only translate
`{{name}}` template placeholders — a different concern (parameterization, not provider identity).
Any provider-specific string an author typed into a body — a filename, a directory, an invocation
token — shipped unchanged to every provider that kind emits to.

Two live leaks, found by grepping the whole catalog rather than trusting the one reported example:

| Leak                        | Files                    | Why it happened                                                                                            |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` in body prose   | 29 (20 agents, 9 skills) | Authors wrote what Claude actually reads, never considering the same sentence ships to Copilot too.        |
| Claude's `$ARGUMENTS` token | 18 skill bodies          | A Claude Code skill-body feature, documented as Claude-only, hardcoded into a body every provider renders. |

Both passed `sigil sync --check` before this pass — the existing `platform-path-leak` conformance
rule only matched `/\.claude\//` and its own rewrite instruction _explicitly excused_ `CLAUDE.md`:
_"CLAUDE.md itself is fine to keep since Claude Code, not sigil, defines that convention."_ That
reasoning is backwards — who defines a convention says nothing about whether it is accurate on every
other provider's output. Corrected as part of this pass.

Confirmed against live official docs (2026-08-10): Copilot reads `AGENTS.md` (agent instructions,
nearest-in-tree wins) and `.github/copilot-instructions.md` (repo-wide), never `CLAUDE.md`
([GitHub — repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)).
`$ARGUMENTS` is documented as a Claude Code-only body feature; the Agent Skills open standard
(agentskills.io) admits only six frontmatter fields outside Claude Code and no body-argument
mechanism at all ([Claude Code — Skills](https://code.claude.com/docs/en/skills)).

## 2. The canonical architecture

Give the body layer the same translation step the frontmatter layer already had:

```
catalog body (neutral {sigil:<term>} tokens)  →  renderArtifact()  →  provider lexicon substitution  →  provider text
```

- `src/targets/lexicon.ts` — `LEXICON_TERMS` (the single term list), `ProviderLexicon` type,
  `applyLexicon()`. An unknown term throws at render time — a typo fails the build instead of
  shipping a literal unresolved token.
- `src/targets/{claude-code,copilot}/lexicon.ts` — one `ProviderLexicon` table per provider, each
  entry a `{value, doc}` pair backed by the same `DocRef` citation discipline every `KindEmitSpec`
  already carries.
- `KindEmitSpec.lexicon` (new required field, `src/targets/spec-types.ts`) — every spec must supply
  one; `renderArtifact()` applies it **unconditionally** to the artifact's own body and to every
  body section that inlines another artifact's body (a skill's "## Applied Rules" pulling in a
  rule's `resolvedBody`) — not opt-in, the same reason `{{name}}` translation was reliable and this
  wasn't.

Three terms at first, deliberately (a fourth was added later, see the update below): `conventions-file` (`CLAUDE.md` / `AGENTS.md`), `rules-dir`
(`.claude/rules/` / `.github/instructions/`), `arguments` (`$ARGUMENTS` / "the request you were
given"). A fourth candidate — `product` ("Claude Code" / "GitHub Copilot") — was cut during
implementation: several catalog artifacts (mcp install notes, the `author-artifact` prompt)
legitimately name both products side-by-side as documentation ABOUT sigil's own multi-provider
behavior, not a per-provider instruction; adding that term would have flagged genuinely correct
prose as a leak. Matches the standing "minimum, no noise" preference — a term earns a place only
when it fixes a real, found leak.

**Update 2026-09-27:** a fourth term, `skills-dir` (`.claude/skills/` / `.github/skills/`), met
that bar. The shared `cli-auditor`/`wizard-auditor` agents must tell the model where their skill's
`references/auditor.md` lives, and `platform-path-leak` correctly flagged the first draft's
hardcoded `.claude/skills/` path as wrong on Copilot. User-level folders differ further
(`~/.claude/skills` vs `~/.copilot/skills`), so bodies name those in prose, not by path.

## 3. The second net

Every `KindEmitSpec` now also carries `UNTRANSLATED_TOKEN_FORBID` in `bodyForbids` (a `{sigil:…}`
token surviving to rendered output means an unknown term or a spec that forgot to wire its
lexicon), and every Copilot spec additionally carries `CLAUDE_LITERAL_FORBIDS_ON_COPILOT` (a
hardcoded `CLAUDE.md`/`$ARGUMENTS` that bypassed the lexicon entirely) — both in
`src/targets/lexicon-forbid.ts`. This is the guard the original gap lacked: `checkOutputContract()`
now fails loud on a hardcoded literal the moment it's authored, not just on a periodic audit.

## 4. A second, independent instance of the same bug

Wiring the lexicon into every `KindEmitSpec` and rebuilding immediately surfaced 27 output-contract
errors on the Copilot side (all 47 catalog leaks minus the 20 that only reach the Copilot `AGENTS.md`
aggregate) — confirming the guard works. But the 20 agent-body leaks did **not** appear, because
Copilot's `AGENTS.md` (`buildAgentsMd`/`renderAgentSection`, `copilot/build-helpers.ts`) and
`copilot-instructions.md` (`buildCopilotInstructions`) are hand-rolled aggregates that read
`artifact.resolvedBody ?? artifact.body` directly — they never call `renderArtifact()` at all, so
they never got the lexicon pass (or the `{{…}}` translation, historically) for free. Fixed by calling
`applyLexicon()` explicitly in both. This was the same root cause the audit set out to fix, found a
second time by grepping "every generator/translator," per Req.md's own instruction not to stop at
the first example.

## 5. A fix-composition bug, caught by re-running the check after apply

`provider-term-leak`'s `fix()` initially computed `newBody` from `ctx.catalog`'s in-memory artifact
snapshot — a single pre-fix snapshot taken once by `detect()`. For an artifact with more than one
leak (9 files leaked both `conventions-file` and `arguments`), `fix()` runs once per finding; the
second call's `newBody` was computed from the _original_ unmodified body, and `fix-mechanical.ts`
writes each edit as a full-body replacement — so the second write silently reverted the first fix.
Unlike `redundant-default`'s `frontmatterPatch` (which merges per-key and is safe under repeated
calls), a full-body `newBody` replacement is not. Caught by re-running `sigil sync --check`
immediately after `--apply` — 9 files still failed. Fixed by having `fix()` read the current on-disk
body instead of the stale snapshot, so sequential fixes on the same file compose correctly.

## 6. Closing two related information-loss bugs found in the same sweep

Req.md also asked what metadata is lost during generation. Two real, live losses, both fixed:

- **Copilot's skill spec silently dropped `allowedTools`.** The Agent Skills open standard's
  six-field outside-Claude-Code list _does_ include `allowed-tools` — this was the same bug class as
  the `tools`-on-agents gap fixed earlier in the week (a field authored, schema-valid, silently
  unmapped). Now emitted as `allowed-tools: <csv>`.
- **Copilot's skill spec silently dropped `argumentHint`.** Unlike `allowedTools`, `argument-hint`
  is a documented hard error outside Claude Code — it cannot become a `FieldMapping`. Rendered
  instead as a `**Arguments:** <hint>` body line, the same pattern `whenToUse` already used for its
  own `## When to Use` body section.
- **Latent (0 catalog uses, so no prior output impact): a skill's own `relatedArtifacts`** was
  declared on `SkillSchema` but neither skill spec ever rendered it — agents already get a
  `## Boundary` section from the same field. Wired `renderBoundarySection` into both skill specs and
  threaded `catalog`/`installSet` through every skill render call site (mirroring the existing
  per-artifact agent pattern) so the mechanism is ready the moment a skill authors the field.

## 7. What's genuinely still open

- **9 `body-density` findings**, catalog-wide, carried over unchanged from the 2026-08-10 frontmatter
  audit — unrelated to this pass, still deferred for the same reason (per-skill judgment about
  re-teaching vs. load-bearing prose, not a mechanical trim).
- **One `platform-path-leak` advisory warning** on `shared/author-artifact` — its own body
  legitimately discusses `.claude/`-style paths as part of teaching the lexicon; editorial, does not
  fail `--check`.
- `shared/author-artifact`'s lexicon-explainer paragraph deliberately does not spell out the
  `{sigil:<term>}` bracket syntax inline — doing so would itself look like an untranslated token to
  `UNTRANSLATED_TOKEN_FORBID`. It points to `src/targets/lexicon.ts` instead. A future doc-body
  syntax-escape mechanism (e.g. an explicit "literal, do not translate" marker) would remove this
  restriction, but wasn't built here — no other artifact needed it.

## 8. How this scales to a future third provider

Per `docs/reference/spec.md` § Extension model (step 7, added by this pass): a new provider adds one
`ProviderLexicon` table with a `{value, doc}` entry per existing term, wires `lexicon:` onto its
`KindEmitSpec`s, and adds `UNTRANSLATED_TOKEN_FORBID` plus its own cross-provider-literal forbids.
`provider-term-leak` needs no changes — it derives its detection from every registered lexicon's
`value`s, so a new provider's table is picked up automatically the moment it's added to
`ALL_LEXICON_TERMS`' inputs.

## Verification

`npm run check` (523/523 → tests unchanged in count, all still green after the fix-composition
correction), `npm run validate` (96/96), `npm run catalog:build` (both targets, zero output-contract
errors), and the exact reported scenario reproduced and re-verified: `sigil add
skill:angular/ng-add-package skill:angular/ng-audit-deps skill:angular/ng-document --target copilot`
now emits `AGENTS.md`, `allowed-tools:`, and `**Arguments:**` with no `CLAUDE.md`/`$ARGUMENTS`
anywhere in the output; `--target claude` reproduces the mirror image.
