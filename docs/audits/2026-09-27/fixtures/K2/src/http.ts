import { exec } from 'child_process';
import { config } from './config';

export async function getJson(path: string): Promise<any> {
  console.log('GET', path, 'token', config.apiToken);
  const res = await fetch(config.apiUrl + path, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  return JSON.parse(await res.text());
}

export function openInBrowser(url: string) {
  exec(`start ${url}`);
}
