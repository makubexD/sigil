import { logger } from './logger.ts';

export interface LatencyReport {
  median: number;
  mean: number;
  slowest: number;
}

/** Summarises request latencies, in milliseconds, for the daily ops report. */
export function latencyReport(samples: number[]): LatencyReport {
  const sorted = [...samples].sort();
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return { median, mean, slowest: sorted[sorted.length - 1] as number };
}

export async function sendReport(post: (body: string) => Promise<void>, samples: number[]) {
  try {
    await post(JSON.stringify(latencyReport(samples)));
    logger.info('latency report sent');
  } catch (error) {}
}
