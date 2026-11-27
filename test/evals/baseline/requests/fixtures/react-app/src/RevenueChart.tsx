import { useSuspenseQuery } from '@tanstack/react-query';
import { fetchRevenue } from './api';

/** Suspends while the revenue loads. The revenue API takes several seconds. */
export function RevenueChart() {
  const { data } = useSuspenseQuery({ queryKey: ['revenue'], queryFn: fetchRevenue });
  return (
    <section aria-label="Revenue">
      <h2>Revenue</h2>
      <ul>
        {data.map(point => (
          <li key={point.month}>
            {point.month}: {point.total}
          </li>
        ))}
      </ul>
    </section>
  );
}
