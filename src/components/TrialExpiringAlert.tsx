import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface TrialExpiringAlertProps {
  users: any[];
}

export default function TrialExpiringAlert({ users }: TrialExpiringAlertProps) {
  const expiring = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    return users
      .filter((u) => {
        const sub = u.subscriptions?.[0];
        if (sub?.status !== 'trial' || !sub.trial_ends_at) return false;
        const diff = new Date(sub.trial_ends_at).getTime() - now;
        return diff > 0 && diff <= sevenDays;
      })
      .map((u) => {
        const sub = u.subscriptions[0];
        const daysLeft = Math.ceil(
          (new Date(sub.trial_ends_at).getTime() - now) / (1000 * 60 * 60 * 24)
        );
        return { name: u.full_name ?? u.email ?? u.id, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [users]);

  if (expiring.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
      <div>
        <p className="text-sm font-semibold text-amber-800 mb-1">
          {expiring.length} trial{expiring.length > 1 ? 's' : ''} por vencer
        </p>
        <ul className="space-y-0.5">
          {expiring.map((u, i) => (
            <li key={i} className="text-sm text-amber-700">
              {u.name} — vence en {u.daysLeft} día{u.daysLeft !== 1 ? 's' : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
