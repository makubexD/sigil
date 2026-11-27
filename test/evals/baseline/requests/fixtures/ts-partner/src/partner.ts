import https from 'node:https';

export const PARTNER_HOST = process.env.PARTNER_HOST ?? 'api.partner.example';

/** GETs a path from the partner API and resolves with the response body. */
export function fetchPartner(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get({ host: PARTNER_HOST, path, timeout: 10_000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    });
    request.on('timeout', () => request.destroy(new Error('partner API timed out')));
    request.on('error', reject);
  });
}
