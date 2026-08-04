import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Loader } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

interface Props {
  success: boolean;
}

// El webhook de MercadoPago tarda unos segundos en activar la suscripción, así
// que una sola lectura casi siempre llega temprano. Reintentamos de forma
// acotada y cortamos apenas el plan queda activo.
//
// La ventana sale de los tiempos medidos en payment_events: el preapproval pasa
// a 'authorized' (que es lo que activa la suscripción) ~18s después de crearse
// el checkout, prácticamente a la vez que MP redirige acá. 8 lecturas ≈ 24s dan
// margen sobre esa latencia; pasado eso se ofrece verificar a mano.
const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 8;

export default function CheckoutResultView({ success }: Props) {
  const navigate = useNavigate();
  const { refresh, isActive, isRefreshing } = useSubscription();
  const intervalRef = useRef<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pollRound, setPollRound] = useState(0);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!success) return;
    setExhausted(false);
    refresh();
    let attempts = 1;
    intervalRef.current = window.setInterval(() => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        stopPolling();
        setExhausted(true);
        return;
      }
      refresh();
    }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [success, refresh, stopPolling, pollRound]);

  useEffect(() => {
    if (isActive) stopPolling();
  }, [isActive, stopPolling]);

  // MercadoPago usa un único `back_url` para el preapproval (la API no acepta
  // uno por resultado, a diferencia de Checkout Pro), así que aterrizar en esta
  // ruta NO prueba que el cobro haya salido. La única fuente de verdad es el
  // status de la suscripción, que el webhook actualiza: hasta confirmarlo no se
  // afirma ningún pago.
  const phase: 'active' | 'checking' | 'unconfirmed' | 'failed' = !success
    ? 'failed'
    : isActive
      ? 'active'
      : exhausted
        ? 'unconfirmed'
        : 'checking';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
        {phase === 'active' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Suscripción activa!</h1>
            <p className="text-gray-500 mb-6">
              Tu plan ya está habilitado. Podés empezar a usar todas las funciones.
            </p>
          </>
        )}

        {phase === 'checking' && (
          <>
            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <Loader size={32} className="text-teal-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirmando tu pago</h1>
            <p className="text-gray-500 mb-6">
              Estamos verificando el resultado con MercadoPago. Suele tardar unos segundos.
              {isRefreshing && (
                <span className="block mt-2 text-sm text-gray-400">Consultando estado...</span>
              )}
            </p>
          </>
        )}

        {phase === 'unconfirmed' && (
          <>
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={32} className="text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Todavía sin confirmar</h1>
            <p className="text-gray-500 mb-6">
              No pudimos confirmar el pago por ahora. Si lo completaste, puede demorar unos
              minutos en acreditarse; si fue rechazado, no se te cobró nada y podés intentar
              con otro medio de pago.
            </p>
          </>
        )}

        {phase === 'failed' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago no completado</h1>
            <p className="text-gray-500 mb-6">
              Hubo un problema procesando tu pago. Podés intentarlo nuevamente o contactarnos.
            </p>
          </>
        )}

        <div className="flex flex-col gap-2">
          {phase === 'unconfirmed' && (
            <button
              onClick={() => setPollRound((r) => r + 1)}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Volver a verificar
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            className={
              phase === 'unconfirmed' || phase === 'failed'
                ? 'w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors'
                : 'w-full bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors'
            }
          >
            Ir al dashboard
          </button>

          {phase === 'unconfirmed' && (
            <button
              onClick={() => navigate('/suscripcion')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Ver mi suscripción
            </button>
          )}

          {phase === 'failed' && (
            <button
              onClick={() => navigate('/pricing')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Ver planes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
