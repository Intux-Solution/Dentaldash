import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

export default function AdminRoute() {
  const location = useLocation();
  const { session, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-teal-600 font-medium font-sans">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mr-2" />
        Verificando permisos...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
