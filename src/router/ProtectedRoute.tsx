// src/router/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// Rutas a las que siempre se permite acceso independientemente del estado de suscripción
const SUBSCRIPTION_EXEMPT = ['/suscripcion', '/suscripcion/exito', '/suscripcion/error', '/pricing'];

export default function ProtectedRoute() {
    const location = useLocation();
    const { session, isLoading: authLoading } = useAuth();
    const { isAdmin, isExpired, isLoading: subLoading, subscription, loadError } = useSubscription();

    if (authLoading || subLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
                Validando sesión...
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
