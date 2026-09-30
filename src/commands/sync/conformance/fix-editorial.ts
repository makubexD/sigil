/**
 * `sigil sync --apply --editorial` — the model-backed half of the conformance engine. Handles
 * findings from `editorial` rules (prose rewrites, trigger-phrase rewording, cross-references)
 * that `mechanical` fixes can't safely automate because the right answer requires judgment.
 *
 * Every proposed edit must clear four rails (editorial-rails.ts) before it is written:
 *   1. Re-parses as valid frontmatter + body.
 *   2. Passes the artifact's zod schema.
 *   3. Passes checkOutputContract() for every provider spec matching this kind.
 *   4. Only touches the fields the task declared ownership of — identity fields
 *      (id/kind/name/language/uses/extends/platforms/deprecated) are never touched by any task.
 * A failed rail drops the edit and reports why; it never writes a partial result. The model call
 * itself lives in editorial-model-client.ts, injected here as `modelClient` so tests use a fake
 * client instead of making real network calls (ts-testing rule: mock only at the I/O boundary).
 *
 * @module
 */
import fs from 'fs';
import matter from 'gray-matter';
import {
  defaultEditorialModelClient,
  type EditorialModelClient,
  type EditorialProposal,
} from './editorial-model-client';
import {
  passesOwnershipRail,
  passesOutputContractRail,
  passesSchemaRail,
  tryParseCandidate,
} from './editorial-rails';
import { CONFORMANCE_RULES } from './registry';
import type { ConformanceContext, ConformanceFinding, EditorialTask } from './types';

export type { EditorialModelClient, EditorialProposal } from './editorial-model-client';

export interface EditorialResult {
  readonly ruleId: string;
  readonly artifactId: string;
  readonly filePath: string;
  readonly status: 'written' | 'rejected';
  readonly reason?: string;
}

function rejected(ruleId: string, task: EditorialTask, reason: string): EditorialResult {
  return {
    ruleId,
    artifactId: task.artifactId,
    filePath: task.filePath,
    status: 'rejected',
    reason,
  };
}

/** Runs one proposal through all four rails, returning the write-ready content or a rejection reason. */
function checkRails(
  task: EditorialTask,
  before: Record<string, unknown>,
  proposal: EditorialProposal,
  originalBody: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  const after = { ...before, ...proposal.frontmatterPatch };
  const bodyAfter = proposal.body ?? originalBody;
  const bodyChanged = proposal.body !== undefined && proposal.body !== originalBody;

  const ownershipFailure = passesOwnershipRail(task, before, after, bodyChanged);
  if (ownershipFailure) return { ok: false, reason: ownershipFailure };

  const parseResult = tryParseCandidate(after, bodyAfter);
  if (!parseResult.ok) return { ok: false, reason: parseResult.reason };

  const schemaFailure = passesSchemaRail(task, after);
  if (schemaFailure) return { ok: false, reason: schemaFailure };

  const contractFailure = passesOutputContractRail(task, after, bodyAfter);
  if (contractFailure) return { ok: false, reason: contractFailure };

  return { ok: true, content: parseResult.content };
}

/** Runs one editorial task through the model and all four rails, writing on success. */
async function runOneEditorialTask(
  ruleId: string,
  task: EditorialTask,
  modelClient: EditorialModelClient,
): Promise<EditorialResult> {
  const raw = fs.readFileSync(task.filePath, 'utf-8');
  const parsed = matter(raw);
  const before = { ...parsed.data };

  let proposal: EditorialProposal;
  try {
    proposal = await modelClient(task, { frontmatter: before, body: parsed.content });
  } catch (e) {
    return rejected(ruleId, task, (e as Error).message);
  }

  const result = checkRails(task, before, proposal, parsed.content);
  if (!result.ok) return rejected(ruleId, task, result.reason);

  fs.writeFileSync(task.filePath, result.content, 'utf-8');
  return { ruleId, artifactId: task.artifactId, filePath: task.filePath, status: 'written' };
}

/** Builds the (ruleId, task) pairs for every editorial-rule finding — mechanical findings are skipped. */
function buildEditorialTasks(
  findings: readonly ConformanceFinding[],
  ctx: ConformanceContext,
): { ruleId: string; task: EditorialTask }[] {
  const rulesById = new Map(CONFORMANCE_RULES.map(rule => [rule.id, rule]));
  return findings
    .map(finding => {
      const rule = rulesById.get(finding.ruleId);
      if (!rule || rule.class !== 'editorial' || !rule.editorialTask) return undefined;
      const task = rule.editorialTask(finding, ctx);
      return task ? { ruleId: rule.id, task } : undefined;
    })
    .filter((t): t is { ruleId: string; task: EditorialTask } => t !== undefined);
}

/**
 * Runs every editorial-rule finding through the model and its rails. Each task reads/writes a
 * distinct artifact file and calls the model independently — no shared mutable state — so they
 * run concurrently rather than serialized one-await-at-a-time.
 */
export async function runEditorialFindings(
  findings: readonly ConformanceFinding[],
  ctx: ConformanceContext,
  modelClient: EditorialModelClient = defaultEditorialModelClient,
): Promise<EditorialResult[]> {
  const tasks = buildEditorialTasks(findings, ctx);
  return Promise.all(
    tasks.map(({ ruleId, task }) => runOneEditorialTask(ruleId, task, modelClient)),
  );
}
