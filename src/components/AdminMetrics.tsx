import { useMemo } from 'react';
import StatsCard from './StatsCard';

interface AdminMetricsProps {
  users: any[];
}

export default function AdminMetrics({ users }: AdminMetricsProps) {
  const metrics = useMemo(() => {
    let active = 0;
    let trial = 0;
    let pastDue = 0;
    let mrr = 0;

    for (const u of users) {
      const sub = u.subscriptions?.[0];
      if (!sub) continue;
      if (sub.status === 'active') {
        active++;
        mrr += Number(sub.subscription_plans?.price_monthly ?? 0);
      } else if (sub.status === 'trial') {
        trial++;
      } else if (sub.status === 'past_due') {
        pastDue++;
      }
    }

    return { total: users.length, active, trial, pastDue, mrr };
  }, [users]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      <StatsCard title="Total usuarios" value={metrics.total} color="text-gray-900" />
      <StatsCard title="Activas" value={metrics.active} color="text-green-600" />
      <StatsCard title="En trial" value={metrics.trial} color="text-blue-600" />
      <StatsCard title="Pago fallido" value={metrics.pastDue} color="text-amber-600" />
      <StatsCard
        title="MRR estimado"
        value={`$${metrics.mrr.toLocaleString('es-AR')}`}
        color="text-teal-600"
      />
    </div>
  );
}
