/** What the payment provider posts to us. */
export interface Webhook {
  event: string;
  amount: number;
}

export function isRefund(webhook: Webhook): boolean {
  return webhook.event === 'refund';
}
