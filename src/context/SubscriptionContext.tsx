import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchSubscription,
  fetchFeaturePermissions,
  Subscription,
  FeaturePermission,
} from '../services/SubscriptionService';

interface SubscriptionContextType {
  subscription: Subscription | null;
  permissions: FeaturePermission[];
  isLoading: boolean;
  isRefreshing: boolean;
  loadError: boolean;
  isActive: boolean;
  isTrial: boolean;
  isFree: boolean;
  isExpired: boolean;
  daysLeft: number | null;
  canUse: (featureKey: string) => boolean;
  isAdmin: boolean;
  refresh: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout de ${ms}ms al cargar la suscripción`)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  permissions: [],
  isLoading: true,
  isRefreshing: false,
  loadError: false,
  isActive: false,
  isTrial: false,
  isFree: false,
  isExpired: false,
  daysLeft: null,
  canUse: () => false,
  isAdmin: false,
  refresh: () => {},
});

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, profile } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [permissions, setPermissions] = useState<FeaturePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Sin esto, una request que queda colgada (sin resolver ni rechazar) deja el
  // `finally` sin ejecutar y el gate bloqueado indefinidamente. Al vencer, `load`
  // cae en su catch y marca `loadError`, que ProtectedRoute ya trata como "no
  // expulsar al usuario": la app renderiza en vez de quedar en el spinner.
  const LOAD_TIMEOUT_MS = 8000;

  // `silent` distingue la carga inicial de un refetch en segundo plano.
  // Un refetch NO debe tocar `isLoading`: ProtectedRoute lo usa como gate y
  // desmontaría la ruta activa, lo que reinicia sus efectos de montaje y puede
  // encadenar un loop refetch -> desmontar -> montar -> refetch (pasaba al
  // volver de MercadoPago a /suscripcion/exito).
  const load = useCallback(async (userId: string, { silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      // Carga inicial (o cambio de usuario): descartar lo anterior para que el
      // guard no evalúe con la suscripción de otra sesión.
      setSubscription(null);
      setPermissions([]);
    }
    setLoadError(false);
    try {
      const [sub, perms] = await withTimeout(
        Promise.all([fetchSubscription(userId), fetchFeaturePermissions(userId)]),
        LOAD_TIMEOUT_MS
      );
      setSubscription(sub);
      setPermissions(perms);
    } catch (err) {
      console.error('SubscriptionContext load error:', err);
      // Falla transitoria (red, 5xx): no confundir con "no tiene suscripción".
      // ProtectedRoute usa este flag para no expulsar a un usuario con plan
      // activo por un error de carga puntual.
      setLoadError(true);
    } finally {
      if (silent) setIsRefreshing(false);
      else setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      load(session.user.id);
    } else {
      setSubscription(null);
      setPermissions([]);
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadError(false);
    }
  }, [session?.user?.id, load]);

  const userId = session?.user?.id;
  const refresh = useCallback(() => {
    if (userId) load(userId, { silent: true });
  }, [userId, load]);

  const isAdmin = profile?.role === 'admin';
  const status = subscription?.status ?? null;
  const isActive = status === 'active';
  const isFree = status === 'free';
  const isTrial = status === 'trial';

  const daysLeft: number | null = (() => {
    if (!isTrial || !subscription?.trial_ends_at) return null;
    const diff = new Date(subscription.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const isExpired = isTrial && daysLeft !== null && daysLeft <= 0;

  const canUse = useCallback(
    (featureKey: string): boolean => {
      if (isAdmin || isFree) return true;
      const perm = permissions.find((p) => p.feature_key === featureKey);
      return perm?.enabled ?? false;
    },
    [isAdmin, isFree, permissions]
  );

  const value = useMemo(
    () => ({
      subscription,
      permissions,
      isLoading,
      isRefreshing,
      loadError,
      isActive,
      isTrial,
      isFree,
      isExpired,
      daysLeft,
      canUse,
      isAdmin,
      refresh,
    }),
    [
      subscription,
      permissions,
      isLoading,
      isRefreshing,
      loadError,
      isActive,
      isTrial,
      isFree,
      isExpired,
      daysLeft,
      canUse,
      isAdmin,
      refresh,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
