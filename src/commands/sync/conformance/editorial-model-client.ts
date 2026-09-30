/**
 * The model call `sigil sync --apply --editorial` uses to propose an edit for one EditorialTask.
 * Split out of fix-editorial.ts to stay under the file-length cap and keep each piece testable —
 * `fix-editorial.ts` injects `EditorialModelClient` so tests use a fake client (ts-testing rule:
 * mock only at the I/O boundary) rather than making real network calls.
 *
 * Uses a raw `fetch` call to the Anthropic Messages API rather than adding an SDK dependency —
 * `ts-dependencies.rule.md`'s own guidance ("prefer Node built-ins... global fetch (Node 18+)")
 * applies directly here, and it avoids adding a dependency (optional or not) for one HTTP call.
 * Reads `ANTHROPIC_API_KEY`; the CLI is never blocked on a package being installed.
 *
 * @module
 */
import { SigilError } from '../../../errors';
import type { EditorialTask } from './types';

export interface EditorialProposal {
  readonly frontmatterPatch?: Record<string, unknown>;
  readonly body?: string;
}

export type EditorialModelClient = (
  task: EditorialTask,
  current: { readonly frontmatter: Record<string, unknown>; readonly body: string },
) => Promise<EditorialProposal>;

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-opus-5';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_TOKENS = 4096;
const JSON_INDENT = 2;
const ERROR_HINT_MAX_CHARS = 500;

const RESPONSE_FORMAT_INSTRUCTION =
  'Respond with ONLY a JSON object of the shape ' +
  '{ "frontmatterPatch"?: { <owned frontmatter keys>: <new value> }, ' +
  '"body"?: "<full new body text, only if body is an owned field>" }. ' +
  'Omit a key you are not changing. No prose, no markdown code fence — raw JSON only.';

function ownershipInstruction(task: EditorialTask): string {
  return (
    `This task may only change these fields: ${task.ownedFields.join(', ')}. Every other field ` +
    'must stay exactly as given — do not touch id, kind, name, language, uses, extends, ' +
    'platforms, or deprecated under any circumstances.'
  );
}

function buildPrompt(
  task: EditorialTask,
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return [
    task.instruction,
    '',
    ownershipInstruction(task),
    '',
    'Current frontmatter (JSON):',
    JSON.stringify(frontmatter, null, JSON_INDENT),
    '',
    'Current body (Markdown):',
    body,
    '',
    RESPONSE_FORMAT_INSTRUCTION,
  ].join('\n');
}

function buildAnthropicRequest(prompt: string, apiKey: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_RESPONSE_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

async function postToAnthropic(
  task: EditorialTask,
  prompt: string,
  apiKey: string,
): Promise<Response> {
  try {
    return await fetch(ANTHROPIC_API_URL, buildAnthropicRequest(prompt, apiKey));
  } catch (e) {
    throw new SigilError(`Anthropic API request failed for ${task.artifactId}`, { cause: e });
  }
}

async function extractResponseText(task: EditorialTask, res: Response): Promise<string> {
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '(no body)');
    throw new SigilError(`Anthropic API returned ${res.status} for ${task.artifactId}`, {
      hint: bodyText,
    });
  }
  const payload = (await res.json()) as { content?: { type: string; text?: string }[] };
  return payload.content?.find(block => block.type === 'text')?.text ?? '';
}

async function parseAnthropicResponse(
  task: EditorialTask,
  res: Response,
): Promise<EditorialProposal> {
  const text = await extractResponseText(task, res);
  try {
    return JSON.parse(text) as EditorialProposal;
  } catch (e) {
    throw new SigilError(`Anthropic response for ${task.artifactId} was not valid JSON`, {
      cause: e,
      hint: text.slice(0, ERROR_HINT_MAX_CHARS),
    });
  }
}

/** Default model client — one call to the Anthropic Messages API. */
export const defaultEditorialModelClient: EditorialModelClient = async (task, current) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new SigilError('sync --apply --editorial requires ANTHROPIC_API_KEY', {
      hint: 'Set ANTHROPIC_API_KEY, or run --apply without --editorial to apply only mechanical fixes.',
    });
  }
  const prompt = buildPrompt(task, current.frontmatter, current.body);
  const res = await postToAnthropic(task, prompt, apiKey);
  return parseAnthropicResponse(task, res);
};
