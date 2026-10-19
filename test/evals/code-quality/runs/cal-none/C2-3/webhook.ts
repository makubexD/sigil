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
 * Parses and validates a raw webhook body posted by the payment partner.
 *
 * The body is untrusted, so every field is checked and a fresh object holding only the
 * known fields is returned. Error messages never echo body content.
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

  const id = Object.hasOwn(parsed, 'id') ? parsed.id : undefined;
  if (typeof id !== 'string' || id.length === 0) {
    throw new WebhookError('Webhook "id" must be a non-empty string');
  }

  const type = Object.hasOwn(parsed, 'type') ? parsed.type : undefined;
  if (typeof type !== 'string' || !EVENT_TYPES.has(type)) {
    throw new WebhookError('Webhook "type" is not a supported event type');
  }

  const amountCents = Object.hasOwn(parsed, 'amountCents') ? parsed.amountCents : undefined;
  // Safe integers only: larger values cannot be represented exactly in cents.
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new WebhookError('Webhook "amountCents" must be a non-negative integer');
  }

  const rawMetadata = Object.hasOwn(parsed, 'metadata') ? parsed.metadata : undefined;
  if (!isPlainObject(rawMetadata)) {
    throw new WebhookError('Webhook "metadata" must be an object');
  }
  // Null prototype: keys such as "__proto__" or "constructor" stay plain data and
  // lookups of absent keys never resolve to inherited Object.prototype members.
  const metadata: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (typeof value !== 'string') {
      throw new WebhookError('Webhook "metadata" values must all be strings');
    }
    metadata[key] = value;
  }

  return {
    id,
    type: type as PaymentEvent['type'],
    // `+ 0` normalises -0 (valid JSON) to 0.
    amountCents: amountCents + 0,
    metadata,
  };
}
