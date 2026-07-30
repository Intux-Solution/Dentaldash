import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionBanner() {
  const { subscription, isTrial, isExpired, daysLeft } = useSubscription();
  const navigate = useNavigate();

  if (!subscription) return null;

  if (isTrial && !isExpired && daysLeft !== null) {
    return (
      <div className="bg-teal-50 border-b border-teal-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-teal-700">
          <Clock size={15} />
          <span>
            Estás en tu período de prueba.{' '}
            <strong>{daysLeft} {daysLeft === 1 ? 'día restante' : 'días restantes'}.</strong>
          </span>
        </div>
        <button
          onClick={() => navigate('/suscripcion')}
          className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors"
        >
          Activar suscripción
        </button>
      </div>
    );
  }

  if (subscription.status === 'past_due') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={15} />
          <span>Tu pago falló. Actualiza tu método de pago para continuar usando el sistema.</span>
        </div>
        <button
          onClick={() => navigate('/suscripcion')}
          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors"
        >
          Actualizar pago
        </button>
      </div>
    );
  }

  if (subscription.status === 'cancelled' || isExpired) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-red-700">
          <XCircle size={15} />
          <span>
            {isExpired
              ? 'Tu período de prueba venció.'
              : 'Tu suscripción fue cancelada.'}{' '}
            Activa un plan para continuar.
          </span>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded-lg font-medium transition-colors"
        >
          Ver planes
        </button>
      </div>
    );
  }

  return null;
}
