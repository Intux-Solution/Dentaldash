// src/router/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Guarda de ruta privada.
 * Si no existe sesión → redirige a "/" conservando la ruta de origen en `state.from`.
 * Si hay sesión → renderiza el filho via <Outlet />.
 */
export default function ProtectedRoute() {
    const location = useLocation();
    const { session, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
                Validando sesión...
            </div>
        );
    }

    if (!session) {
        return (
            <Navigate
                to="/"
                state={{ from: location }}
                replace
            />
        );
    }

    return <Outlet />;
}
