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
  /** Downgrade programado: plan al que se migra al vencer el periodo pagado. */
  pending_plan_id: string | null;
  pending_plan_effective_at: string | null;
  subscription_plans: SubscriptionPlan | null;
  pending_plan: Pick<SubscriptionPlan, 'id' | 'name' | 'price_monthly'> | null;
}

export interface CheckoutResult {
  /** Alta o upgrade: URL de MercadoPago a la que hay que redirigir. */
  init_point?: string;
  mp_sub_id?: string;
  /** Downgrade: el cambio quedo programado, sin cobro ni redirect. */
  scheduled?: boolean;
  effective_at?: string;
  plan_name?: string;
}

export interface FeaturePermission {
  feature_key: string;
  enabled: boolean;
}

export async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    // Hay dos FK a subscription_plans (plan_id y pending_plan_id): PostgREST
    // exige nombrar la constraint en cada embed para desambiguar.
    .select(
      '*, subscription_plans:subscription_plans!subscriptions_plan_id_fkey(*), pending_plan:subscription_plans!subscriptions_pending_plan_id_fkey(id, name, price_monthly)'
    )
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    throw error;
  }
  return data as unknown as Subscription;
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

async function callCreateCheckout(
  body: Record<string, unknown>,
  fallbackError: string
): Promise<any> {
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
      body: JSON.stringify(body),
    }
  );

  // Un 502/546 del gateway de Supabase no devuelve JSON: sin esta guarda el
  // usuario ve un "SyntaxError: Unexpected token" en vez del mensaje de error.
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail = json?.detail ? ` — ${json.detail}` : '';
    throw new Error((json?.error ?? fallbackError) + detail);
  }
  return json ?? {};
}

/**
 * Alta / upgrade → devuelve `init_point` para redirigir a MercadoPago.
 * Downgrade → devuelve `scheduled: true` y la fecha efectiva, sin cobro.
 */
export async function createCheckout(planId: string): Promise<CheckoutResult> {
  return callCreateCheckout({ plan_id: planId }, 'Error al crear el checkout.');
}

/**
 * Revierte un downgrade programado y restaura el monto original en MercadoPago.
 * Devuelve un `warning` cuando el preapproval ya no estaba activo en MercadoPago:
 * el cambio se cancela igual, pero no hay cobro recurrente que restaurar.
 */
export async function cancelScheduledPlanChange(): Promise<{ warning?: string }> {
  return callCreateCheckout(
    { action: 'cancel_scheduled_change' },
    'Error al cancelar el cambio programado.'
  );
}

/**
 * Cancela la suscripción. Va por la Edge Function y no por un UPDATE directo porque
 * hay que cancelar también el preapproval en MercadoPago (el token de MP no puede
 * vivir en el front); sin eso MP le sigue cobrando al usuario. La función además
 * limpia cualquier downgrade programado.
 */
export async function cancelMySubscription(): Promise<void> {
  await callCreateCheckout(
    { action: 'cancel_subscription' },
    'Error al cancelar la suscripción.'
  );
}
