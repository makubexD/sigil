# Senior engineer: guidance defects (sigil master 4f3806e)

## 1. F1–F4 confirmed

- **F1 real.** ts-async.rule.md:59-71; ts-performance-profiler:60-62 calls it **Critical tier**. Recurs at py-async:49-52 (a `TaskGroup` task per id) and ng-rxjs:37 (`mergeMap` "run all in parallel", no `concurrent`). C# shows only two operations; its risk is F8.
- **F2 real, stronger than drafted.** react-conventions:27 vs react-testing:27-28, and react-code-reviewer:75 flags the `data-testid` usage the conventions rule prescribes. Not in Angular.
- **F3 real, milder than drafted.** ts-debugger:33-35 discovers scripts first; the harm is `npx` downloading an unpinned vitest. Worse cases skip discovery (F17).
- **F4 real in all five.** Patterns at ts-code-quality:51, ng:53, cs:56, py:57, react:62; "Inject dependencies" at ts:28, cs:30-31, ng:27, py:29.

## 2. New defects, ranked by harm

Severity tags: **W** = wrong, would produce a bug. **D** = debatable, a matter of taste.

| ID | path:line | Quote | Why | Fix (one sentence) | Class / guard |
|---|---|---|---|---|---|
| F5 W | cs-security.rule.md:82-85 | "`requested.StartsWith(safeRoot, StringComparison.Ordinal)`" | No trailing separator: `/app/data-secret/x` passes. ts-security:67 adds `path.sep`. | Compare against `safeRoot + Path.DirectorySeparatorChar`. | Path-containment. RETIRED `/StartsWith\(safeRoot,/`, plus a CANONICAL separator phrase in the security family |
| F6 W | ts-security.rule.md:157 | "Reject requests to private IP ranges (`127.x`, `10.x`, `172.16-31.x`, `192.168.x`)" | Misses `169.254.169.254` (cloud metadata), IPv6 and `0.0.0.0`, and never says to check the **resolved** address (DNS rebinding). | Resolve the host, check that IP against loopback/private/link-local (v4 and v6), and connect to that IP. | SSRF. CANONICAL "169.254" in ts/py/cs security |
| F7 W | ts-security.rule.md:89-91; ts-security-auditor:88 | "use `yaml.load(input, { schema: yaml.JSON_SCHEMA })` or `yaml.safeLoad`" | js-yaml 4 removed `safeLoad` (it throws) and made `load` safe, so the auditor's High is a false positive. | Version-condition both lines. | Stale API. RETIRED `/safeLoad/` |
| F8 W | cs-performance-profiler:54; py-performance-profiler:75 | "Sequential `await` on independent operations — use `Task.WhenAll`… Severity: High." | `WhenAll` over one `DbContext` throws "A second operation was started"; SQLAlchemy `AsyncSession` fails the same way. It flags correct code and recommends a crash. | Add "not when they share a DbContext/session/connection". | Shared-context concurrency. CANONICAL caveat next to every "run concurrently" |
| F9 W (contradiction) | ts-refactor-specialist:66, cs:70, ng:67, py:71, react:68 vs clean-code.rule.md:21 | "two or more functions with ≥ 80% structural overlap; extract" vs "Tolerate a second copy… extract on the third" | The refactor agent writes the premature abstraction the doctrine retired. | Use the clean-code wording ("extract on the third, same reason to change"). | RETIRED `/two or more [^.]{0,60}80%/` |
| F10 W (self-contradiction) | ng-async.rule.md:81-86 vs :96-98; :108 vs ng-rxjs:26 | "`search(query)`… `.subscribe(...)`" marked Correct | Each call opens an uncancelled request, the race :96 warns about; the :108 fix subscribes with no teardown, which ng-rxjs:26 forbids. | Use a `switchMap` over a query subject, with `takeUntilDestroyed`. | Example-vs-rule contradiction |
| F11 W | ts-async.rule.md:56-57; py-async.rule.md:59-61 | "letting the first rejection cancel all work"; "for the same 'run concurrently, propagate first error' shape" | Neither cancels siblings; agents assume side effects stopped. | State that siblings keep running, and cancel via `AbortSignal` / `TaskGroup`. | Failure semantics. RETIRED `/rejection cancel all/`, `/same "run concurrently/` |
| F12 W | ts-conventions.rule.md:187, :191; ts-code-reviewer:81 | "`any` without a `@ts-expect-error // reason`"; "rethrow bare `throw`" | `any` raises no error, so the directive fails with TS2578 (unused directive). Bare `throw;` is a JS syntax error. | Use `eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason`, and "don't catch, or wrap with cause". | Cross-language leakage. RETIRED `/bare .?throw/` outside csharp |
| F13 W | cs-async.rule.md:102-105 | "`await (…).WhenBoth();  // or Task.WhenAll + deconstruct`" | `WhenBoth` and tuple-await aren't in the BCL, so it doesn't compile; mixed-type `WhenAll` returns nothing to deconstruct. | Start both tasks, `await Task.WhenAll(a, b)`, then await each. | Fabricated API. RETIRED `/WhenBoth/` |
| F14 W | react-async.rule.md:65-66 | "`{ params: { id: string } }`… `params.id`" | Next.js 15+ `params` is a Promise; synchronous access was removed in 16. | Use `const { id } = await params`. | Stale framework API |
| F15 W (scale) | py-async.rule.md:29, :117 (with :49-52) | "`async with httpx.AsyncClient() as client:`" inside the per-call function | A new pool and TLS handshake per call; with the :49 fan-out, that's N pools. | Inject one long-lived client. | Per-call client. Same class as cs-security:126 (`IHttpClientFactory`) |
| F16 W (contradiction) | ts-testing:163, ng-testing:99, cs-testing:138 vs py-testing:156, react-testing:147 | "Minimum **70% statement/line coverage**" vs "do not assume a number" | Same family, opposite instructions; agents pad tests to an invented number. | Discover the floor from config everywhere. | CANONICAL "do not assume a number" across the testing family |
| F17 W (F3 class) | react-debugger:34,78; react-refactor-specialist:88; ts-refactor-specialist:80; py-refactor-specialist:45,88; cs-testing:57-58 | "`npx vitest run`"; bare `pytest`; "Do not add additional mocking libraries… Moq is sufficient" | No discovery step; bare `pytest` misses the uv/poetry environment; NSubstitute projects get Moq. | Use the project's scripts and the double library it already uses. | Tool default. RETIRED `/npx (vitest|jest)/` in agents |
| F18 D | cs-logging:94-98; py-logging:72-76; ng-logging:51-56 | log, then `throw`/`raise` | Duplicate log entries at every layer. | Log only at the top-level boundary (the doctrine already exists). | Log-and-rethrow |
| F19 D (F4 class) | ts-testing:97-98, :153-154; ng-conventions:90-91; react-conventions:25; ts-conventions:177-178 | "accept a `clock`… parameter"; "`InjectionToken`… swapped in tests"; "Zustand, Jotai"; "a function that mutates must not return meaningful data" | Reshape code or add a library for testability or taste; conflict with YAGNI (template:82) and clean-code:24. | Include in the F4 removal ablation. | Unconditional infrastructure |
| F20 D | ts-project-layout.rule.md:22-23 | "When a file exceeds ~200 lines… split it." | A split trigger D2 missed and RETIRED doesn't match; results.md:99 says D1 "traded functions for modules". | Ablate it together with the God Object thresholds in the structure slots. | Widen the RETIRED split regex |

Minor: ts-async:163-164 (`process.on` in a rule covering `*.tsx`); cs-security:29 (error names the wrong variable).

## 3. Verdict changes

- **F1:** keep P0; bundle F8 and F11 and drop the profilers' "Critical tier", or rule and profiler contradict.
- **F3:** stays P1, scope widened to F17 and F16.
- **F4:** keep it as E (ablation), add the F19 lines, and split out F9 as a **T**, P0 item: that one is a contradiction, not prose taste.
- **Add F5–F7 and F12–F14 as T, P0.** Factual errors; no eval needed. F10 as T, P1. F15 and F18 as E, P2.
- **O1 have → partial:** RETIRED doesn't catch the "~200 lines… split it" wording (F20), and nothing guards consistency across the testing and refactor families.

## 4. Sampling

**Read in full:** the async rules for ts, cs, py, react and ng; ng-rxjs; the security rules for ts, cs and py; ts-testing; py-testing (lines 17-158); ts-conventions; react-conventions; ts-code-quality; the code-quality template body.

**Read in part:** the test-command sections of ts-debugger, ts/py-refactor-specialist and react-debugger; cs-performance-profiler:45-75; cs-testing (16-24, 52-60, 128-142); ng-conventions (86-134); the clean-code bullets.

**Grepped only:** every agent, skill, and logging, dependency and Angular rule, for concurrency, testid, runner commands, coverage, patterns/DI, SSRF/YAML and install commands.

**Not reviewed:** react/ng security, ng-signals/templates/components, documentation/git/project-layout rules, stack-parts, the cli/wizard/feature skills.

API facts (js-yaml 4, Next 15/16, EF, TS2578, `gather`) are from memory, not checked against the docs.
