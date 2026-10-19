# Senior rebuttal (catalog lens)

## 1. Where others are wrong

- **Principal, F2 "not a contradiction":** react-conventions:27's own example is `data-testid="submit-button"`. A button has a role, so react-code-reviewer:75 flags it. The fix is the same (delete :27), but it goes in the errata now.
- **Principal, F3 "RETIRED `npx vitest run`":** RETIRED is global (catalog-doctrine.test.ts:66-73), and react-scaffold-project:94,102 and react-allow-dev-tools.settings:15,25 use the literal correctly. The principal also missed react-sync-tests:57,84. RETIRED needs an `except` field.
- **Me, F9 regex:** `/two or more [^.]{0,60}80%/` misses py:71 and react:68. Use `/(>|≥) ?80% (structural )?overlap/` instead. It hits all 5 and spares template:64 and ts-dependencies:66.
- **CTO #1 "> 3 lines → ablation":** F6 and F10 replace text. Gate on net added lines.
- **CTO #1, F16 as errata:** facts.md marks it D.

## 2. Concessions

- **F11:** py-async:59-61 is correct. Only ts-async:57 changes.
- **CANONICAL for F1/F6:** I was wrong. The security family includes ng and react (standard.yaml:261-266), and async does too. Use an IMPLIES check instead (if a text matches A, it must also match B).
- **F16:** W becomes D. The 3-vs-2 split stays. The owner picks; I recommend discovery.
- **Sequencing:** F1 ships now. Runs pin commits (CTO).

## 3. PRs by class

| PR | Items | Guard |
|---|---|---|
| 0 infra | – | RETIRED `except`; an `IMPLIES {when, then}` table |
| A security | F5, F6 | RETIRED `/StartsWith\(safeRoot,/`; IMPLIES `/private IP/` ⇒ `/169\.254/` and `/resolved/` |
| B wrong API | F7, F12, F13, F14 | RETIRED `/safeLoad/`, `/WhenBoth/`, `/either rethrow bare/` (spares cs-code-quality:67), ``/`any`[^.]{0,30}without a `@ts-expect-error/`` |
| C concurrency | F1, F8, F10, F11-ts, F15; "Critical tier" | IMPLIES fan-out ⇒ a bound; RETIRED `/rejection cancel all/`, `/Critical tier/` |
| D toolchain | F3, F17, F21, ts-sync-tests:89 | RETIRED `/npx (vitest\|jest)/` except scaffold and settings; `/Fix any failures/`; CANONICAL generate-tests "never weaken an assertion" |
| E family drift | F2, F9, F16 | RETIRED `/`data-testid` over CSS/`, the F9 regex; CANONICAL testing "do not assume a number" |

Check the API facts in A and B against the docs before merging. Mine came from memory.

## 4. Top 5

1. PR 0 + A: security, exploitable.
2. PR C: concurrency.
3. PR B: code that does not compile or run.
4. PR D: bent tests and the wrong runner.
5. PR E, then the F4/F19/F20 removal ablation.
