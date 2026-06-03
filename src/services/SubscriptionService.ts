import { supabase } from '../config/supabaseClient';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'free';
  mercadopago_sub_id: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  subscription_plans: SubscriptionPlan | null;
}

export interface FeaturePermission {
  feature_key: string;
  enabled: boolean;
}

export async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    throw error;
  }
  return data as Subscription;
}

export async function fetchFeaturePermissions(userId: string): Promise<FeaturePermission[]> {
  const { data, error } = await supabase
    .from('feature_permissions')
    .select('feature_key, enabled')
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

export async function fetchPublicPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

export async function createCheckout(planId: string): Promise<{ init_point: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa.');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ plan_id: planId }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error al crear el checkout.');
  return json;
}
