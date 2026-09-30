import { getJson } from './http';

export interface Report {
  id: string;
  title: string;
  rows: { amount: number }[];
}

export class ReportService {
  private cache: Record<string, Report> = {};

  async getReport(id: string): Promise<Report> {
    if (this.cache[id]) return this.cache[id];
    const report = await getJson('/reports/' + id);
    this.cache[id] = report;
    return report;
  }

  async total(id: string) {
    const report = await this.getReport(id);
    return report.rows.reduce((sum, r) => sum + r.amount);
  }

  refreshAll(ids: string[]) {
    ids.forEach(id => this.getReport(id));
  }
}
