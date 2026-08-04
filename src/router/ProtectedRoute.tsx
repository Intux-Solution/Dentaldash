// src/router/ProtectedRoute.tsx
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { supabase } from '../config/supabaseClient';

// Rutas a las que siempre se permite acceso independientemente del estado de suscripción.
// `/ayuda` entra acá a propósito: bloquear la documentación justo cuando al usuario
// se le venció el trial es exactamente el peor momento para dejarlo sin respuestas.
const SUBSCRIPTION_EXEMPT = ['/suscripcion', '/suscripcion/exito', '/suscripcion/error', '/pricing', '/ayuda'];

// A partir de acá el spinner ofrece una salida manual. No recarga solo: un reload
// automático cortaría la request en curso y, en redes lentas, se encadenaría.
// Va por encima del LOAD_TIMEOUT_MS de SubscriptionContext (8s) para darle lugar
// a que se destrabe solo antes de pedirle algo al usuario.
const SLOW_LOAD_MS = 12000;

export default function ProtectedRoute() {
    const location = useLocation();
    const { session, isLoading: authLoading } = useAuth();
    const { isAdmin, isExpired, isLoading: subLoading, subscription, loadError } = useSubscription();
    const [slowLoad, setSlowLoad] = useState(false);

    // Solo la carga inicial real bloquea. Si ya hay datos de suscripción (o un
    // error de carga), un `subLoading` residual no debe desmontar la ruta: eso
    // reinicia los efectos de montaje del hijo y puede encadenar un loop.
    const isInitialSubLoad = subLoading && subscription === null && !loadError;
    const isGateLoading = authLoading || isInitialSubLoad;

    useEffect(() => {
        if (!isGateLoading) {
            setSlowLoad(false);
            return;
        }
        const timer = setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
        return () => clearTimeout(timer);
    }, [isGateLoading]);

    if (isGateLoading) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-6 font-sans">
                <div className="flex items-center text-teal-600 font-medium">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
                    Validando sesión...
                </div>

                {slowLoad && (
                    <div className="text-center">
                        <p className="text-sm text-gray-500 mb-4">
                            Está tardando más de lo normal. Revisá tu conexión.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                                Reintentar
                            </button>
                            <button
                                onClick={async () => {
                                    // La sesión corrupta en localStorage es la causa más
                                    // común de un gate que no resuelve: limpiarla y volver
                                    // al login es la única salida que no depende de él.
                                    try {
                                        await supabase.auth.signOut();
                                    } finally {
                                        window.location.href = '/';
                                    }
                                }}
                                className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
                            >
                                Cerrar sesión
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    // El admin siempre tiene acceso
    if (isAdmin) return <Outlet />;

    // Si la suscripción está vencida o cancelada, redirigir a pricing
    // excepto en las rutas de suscripción para no crear un loop
    const isExempt = SUBSCRIPTION_EXEMPT.some((path) => location.pathname.startsWith(path));
    const isBlocked =
        !isExempt &&
        !loadError &&
        (subscription === null || isExpired || subscription?.status === 'cancelled');

    if (isBlocked) {
        return <Navigate to="/suscripcion" replace />;
    }

    return <Outlet />;
}
