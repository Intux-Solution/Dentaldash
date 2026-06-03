import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  isActive: boolean;
  isTrial: boolean;
  isFree: boolean;
  isExpired: boolean;
  daysLeft: number | null;
  canUse: (featureKey: string) => boolean;
  isAdmin: boolean;
  refresh: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  permissions: [],
  isLoading: true,
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

  const load = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const [sub, perms] = await Promise.all([
        fetchSubscription(userId),
        fetchFeaturePermissions(userId),
      ]);
      setSubscription(sub);
      setPermissions(perms);
    } catch (err) {
      console.error('SubscriptionContext load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      load(session.user.id);
    } else {
      setSubscription(null);
      setPermissions([]);
      setIsLoading(false);
    }
  }, [session?.user?.id, load]);

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

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        permissions,
        isLoading,
        isActive,
        isTrial,
        isFree,
        isExpired,
        daysLeft,
        canUse,
        isAdmin,
        refresh: () => session?.user?.id && load(session.user.id),
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
