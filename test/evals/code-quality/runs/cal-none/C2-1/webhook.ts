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

const EVENT_TYPES: ReadonlySet<unknown> = new Set(['payment.succeeded', 'payment.failed']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses and validates a raw webhook body from an external payment partner.
 * The body is untrusted: every field is checked, and the returned event is
 * rebuilt from scratch so no extra properties from the payload leak through.
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
  if (!EVENT_TYPES.has(type)) {
    throw new WebhookError('Webhook "type" must be "payment.succeeded" or "payment.failed"');
  }
  // Safe integers only: larger values lose precision and can't represent an exact amount.
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
    // Object.fromEntries defines own data properties, so a "__proto__" key stays
    // an ordinary key instead of replacing the prototype.
    metadata: Object.fromEntries(entries) as Record<string, string>,
  };
}
