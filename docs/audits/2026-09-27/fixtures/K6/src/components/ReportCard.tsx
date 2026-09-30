import { useEffect, useState } from 'react';
import { formatAmount } from '../lib/format';

export function ReportCard(props: any) {
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    fetch('/api/reports/' + props.id)
      .then(r => r.json())
      .then(setReport);
  });

  return (
    <div>
      <h2>{report.title}</h2>
      <div dangerouslySetInnerHTML={{ __html: report.notes }} />
      {report.rows.map((row: any) => (
        <p>{formatAmount(row.amount)}</p>
      ))}
    </div>
  );
}
