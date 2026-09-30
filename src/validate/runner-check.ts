/**
 * §7: flags a skill body that hardcodes a specific test-runner import outside of an explicit
 * "Example shown with X" framing. Not an error — a real worked example legitimately shows one
 * runner's syntax — but an un-framed hardcoded import reads as prescriptive rather than
 * illustrative, and can silently disagree with whatever the target project actually runs (this
 * audit's motivating case: `ts-generate-tests` hardcoded Vitest in a repo that runs `node:test`).
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';

const HARDCODED_RUNNER_RE = /from\s+["'](?:vitest|jest)["']/i;
const RUNNER_FRAMING_RE = /example shown with/i;

export function checkHardcodedRunner(ctx: ValidateCtx, artifact: Artifact): void {
  if (artifact.kind !== 'skill') return;
  if (!HARDCODED_RUNNER_RE.test(artifact.body)) return;
  if (RUNNER_FRAMING_RE.test(artifact.body)) return;
  ctx.warnings.push(
    `[${artifact.id}] body imports a specific test runner (vitest/jest) without an ` +
      `"Example shown with <runner>" framing nearby — the runner should be discovered from ` +
      `the target project's package.json, not hardcoded. If this is a deliberate worked ` +
      `example, add the framing sentence to make that explicit.`,
  );
}
