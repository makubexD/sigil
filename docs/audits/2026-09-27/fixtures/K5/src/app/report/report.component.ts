import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-report',
  templateUrl: './report.component.html',
})
export class ReportComponent implements OnInit {
  report: any;
  total = 0;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get('/api/reports/current').subscribe((r: any) => {
      this.report = r;
      this.total = r.rows.reduce((s: number, x: any) => s + x.amount, 0);
      console.log('report loaded', r);
    });
  }
}
