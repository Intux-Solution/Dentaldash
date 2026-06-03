import React, { useEffect, useState } from 'react';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { fetchPublicPlans, createCheckout, SubscriptionPlan } from '../services/SubscriptionService';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function PricingView() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPublicPlans()
      .then(setPlans)
      .catch(() => toast.error('Error al cargar los planes'))
      .finally(() => setLoading(false));
  }, []);

  const handleContrat = async (plan: SubscriptionPlan) => {
    if (!session) {
      navigate('/login', { state: { redirect: '/pricing' } });
      return;
    }
    if (plan.price_monthly === 0) {
      navigate('/');
      return;
    }
    try {
      setCheckoutLoading(plan.id);
      const { init_point } = await createCheckout(plan.id);
      window.location.href = init_point;
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar el pago');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const proIndex = plans.findIndex((p) => p.name === 'Pro');

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
      {/* Nav mínimo */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors">
          <ArrowLeft size={15} />
          Volver al inicio
        </Link>
      </div>
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
          Planes y precios
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Gestioná tu consultorio sin límites
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          DentalDash centraliza pacientes, turnos, odontogramas y más. Elegí el plan que se adapta a tu consultorio.
        </p>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-teal-600" size={32} />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.filter((p) => p.name !== 'Trial').concat(plans.filter((p) => p.name === 'Trial')).map((plan, idx) => {
            const isPro = plan.name === 'Pro';
            const isBusy = checkoutLoading === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 border flex flex-col gap-5 transition-shadow ${
                  isPro
                    ? 'border-teal-500 shadow-xl bg-white ring-2 ring-teal-500'
                    : 'border-gray-200 bg-white shadow-sm hover:shadow-md'
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    Más popular
                  </span>
                )}

                <div>
                  <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                  <p className="text-gray-500 text-sm mt-1">{plan.description}</p>
                </div>

                <div>
                  {plan.price_monthly === 0 ? (
                    <p className="text-3xl font-bold text-gray-900">Gratis</p>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-gray-900">
                        ${plan.price_monthly.toLocaleString('es-AR')}
                        <span className="text-base font-normal text-gray-400"> ARS/mes</span>
                      </p>
                      {plan.price_yearly && (
                        <p className="text-xs text-teal-600 mt-1">
                          o ${plan.price_yearly.toLocaleString('es-AR')} ARS/año (ahorrás 2 meses)
                        </p>
                      )}
                    </>
                  )}
                </div>

                <ul className="space-y-2 flex-1">
                  {(plan.features as string[]).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check size={15} className="text-teal-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleContrat(plan)}
                  disabled={isBusy}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                    isPro
                      ? 'bg-teal-600 hover:bg-teal-700 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  } disabled:opacity-60`}
                >
                  {isBusy && <Loader2 size={15} className="animate-spin" />}
                  {plan.price_monthly === 0
                    ? 'Comenzar prueba gratis'
                    : 'Contratar plan'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="text-center pb-12 text-xs text-gray-400">
        Los pagos se procesan de forma segura a través de MercadoPago. Podés cancelar en cualquier momento.
      </div>
    </div>
  );
}
