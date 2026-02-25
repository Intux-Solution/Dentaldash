import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { Session } from '@supabase/supabase-js';

const DashboardView = React.lazy(() => import('../components/DashboardView'));
const PacientesView = React.lazy(() => import('../components/PacientesView'));
const TurnosView = React.lazy(() => import('../components/TurnosView'));
const SettingsView = React.lazy(() => import('../components/SettingsView'));
const OdontogramView = React.lazy(() => import('../components/OdontogramView'));

import ProtectedRoute from './ProtectedRoute';

const GlobalLoader = () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
        <Loader className="h-10 w-10 animate-spin text-teal-600" />
    </div>
);

interface AppRoutesProps {
    session: Session | null;
}

export default function AppRoutes({ session }: AppRoutesProps) {
    return (
        <Suspense fallback={<GlobalLoader />}>
            <Routes>
                {/* ── Rutas privadas protegidas ────────────────────────────────── */}
                <Route element={<ProtectedRoute session={session} />}>
                    <Route path="/" element={<DashboardView />} />
                    <Route path="/turnos" element={<TurnosView />} />
                    <Route path="/pacientes" element={<PacientesView />} />
                    <Route path="/configuracion" element={<SettingsView session={session} />} />
                    <Route path="/pacientes/:id/odontograma" element={<OdontogramView />} />
                </Route>

                {/* ── Rutas de utilidad / fallback ────────────────────────────── */}
                <Route path="/update-password" element={<Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
