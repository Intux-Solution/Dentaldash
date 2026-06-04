import { supabase } from '../config/supabaseClient';

async function callAdminApi(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa.');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...params }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Error en admin-api: ${action}`);
  return json;
}

export const AdminService = {
  listUsers: () => callAdminApi('list_users'),
  listPlans: () => callAdminApi('list_plans'),
  listPaymentEvents: (limit = 100) => callAdminApi('list_payment_events', { limit }),

  updateUserPlan: (targetUserId: string, planId: string) =>
    callAdminApi('update_user_plan', { target_user_id: targetUserId, plan_id: planId }),

  updateUserPermission: (targetUserId: string, featureKey: string, enabled: boolean) =>
    callAdminApi('update_user_permission', { target_user_id: targetUserId, feature_key: featureKey, enabled }),

  updatePlanPrice: (planId: string, priceMonthly?: number, priceYearly?: number) =>
    callAdminApi('update_plan_price', { plan_id: planId, price_monthly: priceMonthly, price_yearly: priceYearly }),

  createPlan: (data: { name: string; description?: string; price_monthly: number; price_yearly?: number; features?: string[]; feature_keys?: string[]; sort_order?: number }) =>
    callAdminApi('create_plan', data),

  updatePlan: (planId: string, data: { name?: string; description?: string | null; price_monthly?: number; price_yearly?: number | null; features?: string[]; feature_keys?: string[]; sort_order?: number }) =>
    callAdminApi('update_plan', { plan_id: planId, ...data }),

  deletePlan: (planId: string) =>
    callAdminApi('delete_plan', { plan_id: planId }),

  togglePlan: (planId: string, isActive: boolean) =>
    callAdminApi('toggle_plan', { plan_id: planId, is_active: isActive }),

  cancelSubscription: (targetUserId: string) =>
    callAdminApi('cancel_subscription', { target_user_id: targetUserId }),

  grantFreeAccess: (targetUserId: string) =>
    callAdminApi('grant_free_access', { target_user_id: targetUserId }),
};
