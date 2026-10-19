# Principal engineer: architecture and invariants

Paths are relative to the sigil repo unless they start with `bench2/`. F = fact (I read the line). I = inference.

## 1. Verdicts I agree with

- Evals: E1, E3, E4, E5, E6, E7, E8 (E2 agreed, with an ordering caveat in §2)
- Doctrine: A1, A3, F4 (A2 agreed only in a re-scoped form, see §4)
- Review: R1, R2, R3, R4, R5 (reject)
- Hooks: H3 (verify first), H4 (reject)
- Testing: T2
- Coverage: C1 to C5 (product calls, gated U)
- SDD and other: S2, S3, O2, O3 (reject), O4, O5 (reject)

## 2. Verdicts I would change

- **F1: the scope is too narrow, and CANONICAL is the wrong tool.** I agree with fixing the class. But the class also covers the profiler family, which grades unbounded fan-out as the *fix* for a "Critical" finding: ts-performance-profiler.agent.md:59-65, cs-performance-profiler:54, react-performance-profiler:84 (F). py-async.rule.md:49-51 fans `TaskGroup` over a whole `ids` list (F). cs-async.rule.md:101-105 recommends `.WhenBoth()`, which is not a .NET API; no catalog file defines it (F, by grep). Separately, CANONICAL requires a phrase in *every* family member (catalog-doctrine.test.ts:80-90, F). That would force fan-out prose into react-async and ng-async, which have none today (F); Part 1 says added prose costs. **My verdict:** add RETIRED patterns (`items.map(` fan-out without a bound, `WhenBoth`) plus a conditional assertion: any delivered text that recommends fan-out names a bound. Raise F1 to P0.
- **F2 contradiction → not a contradiction, so P2 removal instead of a P0 fix.** react-conventions:27 says "`data-testid` over CSS class selectors" (F), and react-testing:27-28 says role queries come before testid (F). Both load on `*.test.tsx` (appliesTo, F). Together they give one consistent order (role > testid > CSS). Delete line 27, since testing owns query doctrine. That follows the D2 pattern, and the RETIRED pattern stays.
- **F3: one path → a class across agent families, P0/P1.** The same defect appears in react-debugger:34,78, react-refactor-specialist:46,88 and react-code-reviewer:86 (F). ts-generate-tests:90-91 already says "never hardcode `vitest run`" (F), so sigil contradicts itself. The fix is a RETIRED pattern on unconditioned `npx vitest run`. `dotnet test` (one canonical runner) is fine.
- **T1 adapt → have.** feature SKILL.md:103-104 already requires "show that they fail for the expected reason" (F). `generate-tests` writes tests for *existing* code (family sections, standard.yaml:347-361, F), where RED does not apply, so T2 covers the real need there.
- **E2: sequence it.** The fan-out trap grades the *current* ts-async as wrong, so run it on the pre-F1 catalog first: F1 then gets a measured before/after (I).
- **O1 have → partial.** The pinning mechanism exists, but no safety carve-out is pinned. CANONICAL holds only code-quality and code-reviewer phrases (catalog-doctrine.test.ts:48-55, F). "trust boundar" appears only in py-security (F, grep). A1 and F4 are deletion sweeps, so pin the existing safety text *before* they run (ponytail check-rule-copies.js:44-56, bench2/ponytail/profile.md idea 2).
- **H-section header "Copilot has no hooks" is wrong.** docs/ideas/copilot-hooks.md:5-8 describes `.github/hooks/` for Copilot (F). The gap is sigil's emitter (copilot/capabilities.ts:22, F), not the provider.

## 3. Missing capabilities

1. **Truthful test-gen reporting / no bar-lowering to green.** py/react/ts-generate-tests say "Fix any failures before finishing" (py:84, react:102, ts:91, F). On existing code, a failing generated test may reveal a bug, and "fixing" it weakens the assertion. Source: dotnet idea 13 (bench2/dotnet/profile.md, unit-test-generation.prompt.md:119-136). Home: the `generate-tests` family, "Run and report" section, pinned by a CANONICAL entry for that family.
2. **Fail-closed safety hooks.** protect-config fails open: `catch { return; }` on unparseable stdin (protect-config.hook.md:21, F). Source: ECC idea 3 (pre-bash-dispatcher.js:27-29). This applies to H1 too.
3. **Read-only agents that carry Bash.** ts-security-auditor:7,17 is "read-only by instruction, not sandboxed" (F). No verdict covers this. A PreToolUse guard scoped to reviewer agents is the obvious candidate (I; verify that Claude Code exposes the agent identity to hooks).
4. **Invariant debt the table should own.** description-budget.ts:20 hard-codes `CHAR_BUDGET = 1536` (F). That violates "never hard-code a provider's limit in a rule" (CLAUDE.md, provider-limits invariant).

## 4. Invariant risks per proposal

- **F1 / F2 / F3:** Catalog text plus `RETIRED` and conditional assertions in test/catalog-doctrine.test.ts. The bound idiom differs per language (p-limit, Semaphore, SemaphoreSlim), so fixes stay in languages/<lang>/, not `shared/`.
- **E1 / E2 / E3:** In test/evals/code-quality (measure.mjs `signTestP`:178). Evals are "not run by `npm test`" (test/evals/README.md:3, F), so a "T" gate needs a home: extend `evals:check` (already in `ci:local`) to unit-test the task-level statistic and run each bad reference. src/ is untouched.
- **A2:** `SpecLimit.field` is `'name'|'description'|'body'`, measured per emitted file (spec-types.ts:138-147, F). A set-level menu budget does not fit that shape. Step 1: move the 1536 limit onto the Claude skill spec's `limits`, with a combined description + when_to_use measure, and delete the constant. Step 2, only if a documented total exists: a new `SpecLimit` scope. Packs must be read via `parsePacksConfig`.
- **A3:** Make test/rule-load.test.ts a ratchet against a checked-in baseline with a reason field. Caveat: rule-load.cjs:22-23 measures resolved source via `path.posix.matchesGlob`, not rendered output (F); label it a proxy.
- **H1:** A `hook` kind (`ownedBy: ['claude']`; plugin channel `none`, claude-code/capabilities.ts:33, F) ships only via `add`, through `replaceMerge` and `ensureHomeBackup`. Detection must diff old against new (Edit `old_string`, on-disk file for Write), or edits to files with existing markers will ask. `permissionDecision: "ask"` deepens Claude-only vocabulary and raises the copilot-hooks cost (I). One script, markers as data.
- **H2:** Varies with language (tsc, mypy, dotnet build), so it goes in `languages/<lang>/hooks/`. Re-entry (`stop_hook_active`) and time budget need tests like test/catalog/protect-config-hook.test.ts. Same merge invariants as H1.
- **R1:** Spans six reviewer families. A new `template:` is barred (templates need three measured duplicates; this is new prose). Put it in each family's Output section, one CANONICAL row per family, and tie "proof for high" to `severities` (standard.yaml:46).
- **T2:** `generate-tests` family, "Write tests" section, all five members; gated on a test-gen scenario.
- **C1 to C5:** Every new rule must join a family or be recorded as `absent`; a ts-only family forces four `absent` entries. Framework rules (ASP.NET, FastAPI) cannot load stack parts, so they need per-language rules with narrow `appliesTo` (I).
- **S1:** Not via `uses:`: `add` closes over dependencies (co-install.ts:12, F), so `feature` would install all five reviewers. Use "if installed" prose.
- **O6:** Family `keys` are exact (F), so adding `claude:` changes every agent family at once.

## 5. Top 5 priorities

1. **F1 class fix** (async rules, profilers, py `TaskGroup`, cs `WhenBoth`). Acceptance: RETIRED patterns have zero hits; every fan-out recommendation in delivered text names a bound.
2. **F3 class fix plus truthful test-gen.** Acceptance: no unconditioned runner fallback in node-family agents; the `generate-tests` CANONICAL phrase forbids weakening assertions to reach green.
3. **E1 + E2 + E3 together.** Acceptance: `evals:check` unit-tests the task-level sign test; at least 4 trap tasks, each with a bad reference that passes the happy path and fails hidden tests; the trap baseline runs before F1 merges.
4. **Pin safety carve-outs, then move description-budget onto `limits`.** Acceptance: CANONICAL rows exist for existing trust-boundary/security text before any A1/F4 deletion; no numeric provider limit remains in conformance/rules.
5. **H1, once the user confirms.** Acceptance: one test per marker; no ask when the marker already exists; malformed stdin asks rather than passing; it is installed through `replaceMerge` and does not stack on re-add.
