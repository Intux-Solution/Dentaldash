import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';

const DashboardView = React.lazy(() => import('../components/DashboardView'));
const PacientesView = React.lazy(() => import('../components/PacientesView'));
const TurnosView = React.lazy(() => import('../components/TurnosView'));
const SettingsView = React.lazy(() => import('../components/SettingsView'));
const OdontogramView = React.lazy(() => import('../components/OdontogramView'));
const SubscriptionView = React.lazy(() => import('../components/SubscriptionView'));
const AdminView = React.lazy(() => import('../components/AdminView'));
const CheckoutResultView = React.lazy(() => import('../components/CheckoutResultView'));
const PricingView = React.lazy(() => import('../components/PricingView'));
const HelpView = React.lazy(() => import('../components/help/HelpView'));

export default function AppRoutes() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Cargando...</div>}>
            <Routes>
                {/* ── Rutas privadas protegidas ────────────────────────────────── */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<DashboardView />} />
                    <Route path="/turnos" element={<TurnosView />} />
                    <Route path="/pacientes" element={<PacientesView />} />
                    <Route path="/configuracion" element={<SettingsView />} />
                    <Route path="/pacientes/:id/odontograma" element={<OdontogramView />} />
                    <Route path="/suscripcion" element={<SubscriptionView />} />
                    <Route path="/suscripcion/exito" element={<CheckoutResultView success={true} />} />
                    <Route path="/suscripcion/error" element={<CheckoutResultView success={false} />} />
                    <Route path="/pricing" element={<PricingView />} />
                    <Route path="/ayuda" element={<HelpView />} />
                </Route>

                {/* ── Ruta de administración (solo admin) ─────────────────────── */}
                <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminView />} />
                </Route>

                {/* ── Rutas de utilidad / fallback ────────────────────────────── */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
