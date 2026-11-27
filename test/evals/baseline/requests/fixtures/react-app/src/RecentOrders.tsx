import { useSuspenseQuery } from '@tanstack/react-query';
import { fetchRecentOrders } from './api';

/** Suspends while the orders load. */
export function RecentOrders() {
  const { data } = useSuspenseQuery({ queryKey: ['orders', 'recent'], queryFn: fetchRecentOrders });
  return (
    <section aria-label="Recent orders">
      <h2>Recent orders</h2>
      <ul>
        {data.map(order => (
          <li key={order.id}>
            Order {order.id}: {order.total}
          </li>
        ))}
      </ul>
    </section>
  );
}
