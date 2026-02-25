import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import ProtectedRoute from './ProtectedRoute';

const DashboardView = React.lazy(() => import('../components/DashboardView'));
const PacientesView = React.lazy(() => import('../components/PacientesView'));
const TurnosView = React.lazy(() => import('../components/TurnosView'));
const SettingsView = React.lazy(() => import('../components/SettingsView'));
const OdontogramView = React.lazy(() => import('../components/OdontogramView'));

interface AppRoutesProps {
    session: Session | null;
}

export default function AppRoutes({ session }: AppRoutesProps) {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
            <Routes>
                {/* ── Rutas privadas protegidas ────────────────────────────────── */}
                <Route element={<ProtectedRoute session={session} />}>
                    <Route path="/" element={<DashboardView />} />
                    <Route path="/turnos" element={<TurnosView />} />
                    <Route path="/pacientes" element={<PacientesView />} />
                    <Route path="/configuracion" element={<SettingsView />} />
                    <Route path="/pacientes/:id/odontograma" element={<OdontogramView />} />
                </Route>

                {/* ── Rutas de utilidad / fallback ────────────────────────────── */}
                <Route path="/update-password" element={<Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
