import React, { useState } from 'react';
import { useSubscription } from '../context/SubscriptionContext';
import { CheckCircle, Clock, XCircle, AlertTriangle, CreditCard, ArrowUpCircle, Loader2, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cancelMySubscription, cancelScheduledPlanChange } from '../services/SubscriptionService';
import toast from 'react-hot-toast';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

const STATUS_CONFIG = {
  active: { label: 'Activa', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
  free: { label: 'Acceso gratuito', color: 'text-teal-600', bg: 'bg-teal-50', icon: CheckCircle },
  trial: { label: 'Período de prueba', color: 'text-blue-600', bg: 'bg-blue-50', icon: Clock },
  past_due: { label: 'Pago fallido', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle },
  cancelled: { label: 'Cancelada', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
};

export default function SubscriptionView() {
  const { subscription, isLoading, daysLeft, refresh } = useSubscription();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [revertingChange, setRevertingChange] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <p className="text-gray-500 mb-4">No tenés ninguna suscripción registrada.</p>
        <button
          onClick={() => navigate('/pricing')}
          className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          Ver planes disponibles
        </button>
      </div>
    );
  }

  const config = STATUS_CONFIG[subscription.status] ?? STATUS_CONFIG.trial;
  const StatusIcon = config.icon;

  const canUpgrade = subscription.status === 'active' || subscription.status === 'trial' || subscription.status === 'past_due';
  const canCancel = subscription.status === 'active' || subscription.status === 'trial' || subscription.status === 'past_due';

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de que querés cancelar tu suscripción? Perderás acceso cuando venza el período actual.')) return;
    setCancelling(true);
    try {
      await cancelMySubscription();
      toast.success('Suscripción cancelada correctamente');
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cancelar la suscripción');
    } finally {
      setCancelling(false);
    }
  };

  const handleRevertChange = async () => {
    setRevertingChange(true);
    try {
      await cancelScheduledPlanChange();
      toast.success('Cambio de plan cancelado. Seguís con tu plan actual.');
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cancelar el cambio de plan');
    } finally {
      setRevertingChange(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi Suscripción</h1>

      {/* Estado actual */}
      <div className={`rounded-xl p-5 ${config.bg} flex items-start gap-4`}>
        <StatusIcon size={22} className={`${config.color} mt-0.5 shrink-0`} />
        <div className="flex-1">
          <p className={`font-semibold ${config.color}`}>{config.label}</p>
          {subscription.subscription_plans && (
            <p className="text-gray-700 text-sm mt-1">
              Plan: <strong>{subscription.subscription_plans.name}</strong>
              {' · '}${subscription.subscription_plans.price_monthly.toLocaleString('es-AR')} ARS/mes
            </p>
          )}
          {subscription.status === 'trial' && daysLeft !== null && (
            <p className="text-sm text-gray-600 mt-1">
              {daysLeft > 0
                ? `${daysLeft} ${daysLeft === 1 ? 'día restante' : 'días restantes'} en el período de prueba`
                : 'El período de prueba ha vencido'}
            </p>
          )}
          {subscription.current_period_end && subscription.status === 'active' && (
            <p className="text-sm text-gray-600 mt-1">
              Próxima renovación: {formatDate(subscription.current_period_end)}
            </p>
          )}
          {subscription.cancelled_at && (
            <p className="text-sm text-gray-600 mt-1">
              Cancelada el: {formatDate(subscription.cancelled_at)}
            </p>
          )}
        </div>
      </div>

      {/* Downgrade programado: el plan actual sigue vigente hasta la fecha efectiva */}
      {subscription.pending_plan_id && subscription.pending_plan_effective_at && (
        <div className="rounded-xl p-5 bg-blue-50 flex items-start gap-4">
          <CalendarClock size={22} className="text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-blue-700">Cambio de plan programado</p>
            <p className="text-sm text-gray-700 mt-1">
              El {formatDate(subscription.pending_plan_effective_at)} pasás al plan{' '}
              <strong>{subscription.pending_plan?.name ?? 'seleccionado'}</strong>
              {subscription.pending_plan &&
                ` · $${subscription.pending_plan.price_monthly.toLocaleString('es-AR')} ARS/mes`}
              .
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Hasta esa fecha seguís usando{' '}
              {subscription.subscription_plans?.name ?? 'tu plan actual'} con todas sus funciones. No
              hay ningún cobro adicional.
            </p>
            <button
              onClick={handleRevertChange}
              disabled={revertingChange}
              className="mt-3 inline-flex items-center gap-2 bg-white border border-blue-200 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {revertingChange && <Loader2 size={15} className="animate-spin" />}
              Cancelar cambio programado
            </button>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-3">
        {canUpgrade && (
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowUpCircle size={16} />
            Cambiar plan
          </button>
        )}

        {(subscription.status !== 'active' && subscription.status !== 'free' && !canUpgrade) && (
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <CreditCard size={16} />
            {subscription.status === 'cancelled' ? 'Reactivar suscripción' : 'Activar plan'}
          </button>
        )}

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            Cancelar suscripción
          </button>
        )}
      </div>
    </div>
  );
}
