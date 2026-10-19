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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWebhook(body: string): PaymentEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (error) {
    throw new WebhookError('Webhook body is not valid JSON', { cause: error });
  }
  if (!isObject(raw)) throw new WebhookError('Webhook body must be a JSON object');
  const { id, type, amountCents, metadata } = raw;
  if (typeof id !== 'string' || id === '') throw new WebhookError('id must be a non-empty string');
  if (type !== 'payment.succeeded' && type !== 'payment.failed')
    throw new WebhookError('type must be payment.succeeded or payment.failed');
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0)
    throw new WebhookError('amountCents must be a non-negative integer');
  if (!isObject(metadata)) throw new WebhookError('metadata must be an object');
  const entries = Object.entries(metadata);
  for (const [key, value] of entries)
    if (typeof value !== 'string') throw new WebhookError(`metadata.${key} must be a string`);
  // Build the event from the checked fields only; nothing else the partner sent is carried over.
  return { id, type, amountCents, metadata: Object.fromEntries(entries) as Record<string, string> };
}
