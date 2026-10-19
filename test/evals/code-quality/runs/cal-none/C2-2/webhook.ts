export type PaymentEvent = {
  id: string;
  type: 'payment.succeeded' | 'payment.failed';
  amountCents: number;
  metadata: Record<string, string>;
};

export class WebhookError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebhookError';
  }
}

const EVENT_TYPES: ReadonlySet<string> = new Set(['payment.succeeded', 'payment.failed']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses and validates a raw webhook body from a payment partner.
 * The body is untrusted: anything that is not exactly the expected shape throws a WebhookError,
 * and the returned event is rebuilt from scratch so no extra fields pass through.
 */
export function parseWebhook(body: string): PaymentEvent {
  if (typeof body !== 'string') {
    throw new WebhookError('Webhook body must be a string');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new WebhookError('Webhook body is not valid JSON', { cause: err });
  }

  if (!isPlainObject(parsed)) {
    throw new WebhookError('Webhook body must be a JSON object');
  }

  const { id, type, amountCents, metadata } = parsed;

  if (typeof id !== 'string' || id.length === 0) {
    throw new WebhookError('Webhook "id" must be a non-empty string');
  }
  if (typeof type !== 'string' || !EVENT_TYPES.has(type)) {
    throw new WebhookError('Webhook "type" is not a supported event type');
  }
  // isSafeInteger rejects floats, NaN/Infinity and integers too large to represent exactly.
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new WebhookError('Webhook "amountCents" must be a non-negative integer');
  }
  if (!isPlainObject(metadata)) {
    throw new WebhookError('Webhook "metadata" must be an object');
  }

  const entries = Object.entries(metadata);
  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      throw new WebhookError(`Webhook "metadata.${key}" must be a string`);
    }
  }

  return {
    id,
    type: type as PaymentEvent['type'],
    // Normalise -0 (valid JSON) to 0.
    amountCents: amountCents === 0 ? 0 : amountCents,
    // fromEntries defines own properties, so a "__proto__" key cannot alter the prototype.
    metadata: Object.fromEntries(entries) as Record<string, string>,
  };
}
