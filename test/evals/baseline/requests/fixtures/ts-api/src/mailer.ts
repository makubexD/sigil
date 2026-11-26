export interface MailerConfig {
  host: string;
  apiKey: string;
}

/** Sender address for a tenant. */
export function fromAddress(tenant: string): string {
  return `support@${tenant}.example.test`;
}
