// src/router/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
    session: unknown | null;
}

/**
 * Guarda de ruta privada.
 * Si no existe sesión → redirige a "/" conservando la ruta de origen en `state.from`.
 * Si hay sesión → renderiza el filho via <Outlet />.
 */
export default function ProtectedRoute({ session }: ProtectedRouteProps) {
    const location = useLocation();

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
