# CTO: rebuttal

## 1. Where others are wrong

- **Principal (".84 power"):** that figure is for a continuous metric. Traps are binary. reb-power.js gives sign-flip power of .01 at K=4, .63 at K=6 and .89 at K=8.
- **SME and principal (calibrate on "`none` fails ≥ 1/3"):** use **≥ 2/3**, and score against a fresh `none` arm. Runs selected because they failed overstate the baseline.
- **Principal (F2 at P2):** the senior is right. The example is a button, so F2 is errata.

## 2. Concessions

- **E1:** sign-flip on task means plus a 10% floor. My "9/10" was a sign-test bound.
- **Baselines:** interleaved, always, because versions drift. D2 is p = .063, and B1's T5 is biased.
- **Trap count:** my 4-trap design cannot reach significance.
- **E8:** stays. It is a cheap probe of whether a skill fires.
- **H1 and H2:** I take the SME's terms. The runs show 0 suppressions and 0 type errors, so neither is built yet.
- **Senior's points:** gate on net lines, F16 is D, and IMPLIES replaces CANONICAL.

## 3. Roadmap

| # | Item | Cost | Stop |
|---|---|---|---|
| 1 | PR0 infra; PR A/B (F5–F7, F12–F14), each with a docs citation | 1.5 ed | More than 2 wrong: re-audit the senior's list |
| 2 | PR C/D/E (F1, F8, F10, F11-ts, F15, F3, F17, F21, F2, F9, F16) | 2.5 ed | Over 3 net lines: move to #7 |
| 3 | Safety pins, `CHAR_BUDGET` → `limits`, A3 ratchet | 2 ed | – |
| 4 | Sign-flip test, E3 + judge selftest, `typeErrors` and `suppressions` metrics | 1.5 ed | Unit-tested |
| 5 | Calibrate about 12 TS traps, 3 of them pressure tasks | 3 ed, $22 | Fewer than 6 survive: cut rules toward errata and skip #6 |
| 6 | Interleaved batch: `none` / master / deletion (F4, F18–F20) | $80–100 | Master not superior on C: freeze correctness prose, kill A1 and C1–C5 |
| 7 | Prose-sized fixes, gated by #6 | 1 ed | – |
| 8 | H1, only if a pressure run suppresses and the owner approves; E8 before any skill edit | 2.5 ed | Otherwise skip |

Total: about 14 ed and $105–125.

## 4. Kills

- **Kill:** A2, H3, T1, H4, O3, O5, R5, R2, R3, T2, O4, O6, and A1 beyond TS.
- **Defer:** H2 until `typeErrors` > 0; C1–C5 and R1 until #6 says yes; the Copilot hook target.
- **Limit:** S1 to one line.
