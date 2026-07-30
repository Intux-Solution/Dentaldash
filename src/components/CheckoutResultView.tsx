import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

interface Props {
  success: boolean;
}

export default function CheckoutResultView({ success }: Props) {
  const navigate = useNavigate();
  const { refresh } = useSubscription();

  useEffect(() => {
    if (success) refresh();
  }, [success]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
        {success ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Pago recibido!</h1>
            <p className="text-gray-500 mb-6">
              Tu suscripción se está activando. Esto puede tardar unos segundos.
              Serás notificado cuando esté lista.
            </p>
          </>
        ) : (
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
          <button
            onClick={() => navigate('/')}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Ir al dashboard
          </button>
          {!success && (
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
