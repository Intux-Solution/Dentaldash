import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionBanner() {
  const { subscription, isTrial, isExpired, daysLeft, inGracePeriod, daysUntilCutoff } =
    useSubscription();
  const navigate = useNavigate();

  if (!subscription) return null;

  const plural = (n: number) => (n === 1 ? 'día' : 'días');

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

  // El pago falló, o la renovación no entró y ya venció el período. En ambos
  // casos el acceso sigue mientras corre la gracia: avisar cuántos días quedan
  // es lo que evita que el bloqueo llegue de sorpresa.
  if (subscription.status === 'past_due' || (inGracePeriod && !isExpired)) {
    const failedPayment = subscription.status === 'past_due';
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={15} />
          <span>
            {failedPayment
              ? 'Tu pago falló. Actualizá tu método de pago para seguir usando el sistema.'
              : 'No pudimos confirmar la renovación de tu plan.'}
            {daysUntilCutoff !== null && (
              <>
                {' '}
                <strong>
                  Te {daysUntilCutoff === 1 ? 'queda' : 'quedan'} {daysUntilCutoff}{' '}
                  {plural(daysUntilCutoff)} de acceso.
                </strong>
              </>
            )}
          </span>
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
            {/* `isExpired` ya no significa solo "se acabó el trial": también
                cubre el período pagado vencido, así que el texto tiene que
                distinguirlos o le miente al usuario que sí pagó. */}
            {subscription.status === 'cancelled'
              ? 'Tu suscripción fue cancelada.'
              : isTrial
                ? 'Tu período de prueba venció.'
                : 'Tu suscripción venció por falta de pago.'}{' '}
            Activá un plan para continuar.
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
