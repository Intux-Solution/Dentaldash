import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALL_FEATURES = [
  "appointments",
  "odontogram",
  "clinical_records",
  "consent_forms",
  "patients_unlimited",
  "insurance_management",
  "services_config",
  "export_data",
  "whatsapp_bot",
  "google_calendar",
  "faqs_config",
];

const PLAN_FEATURES: Record<string, string[]> = {
  Trial: ["appointments", "odontogram", "clinical_records", "consent_forms"],
  Basico: [
    "appointments", "odontogram", "clinical_records", "consent_forms",
    "patients_unlimited", "insurance_management", "services_config", "export_data",
  ],
  Pro: [...ALL_FEATURES],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verificar JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header." }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const token = authHeader.replace(/^Bearer\s+/, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Verificar que el usuario es admin
    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!adminRow) {
      return new Response(
        JSON.stringify({ error: "Forbidden. Admin access required." }),
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action in request body." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ── list_users ──────────────────────────────────────────────────────────
    if (action === "list_users") {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          role,
          subscriptions (
            status,
            trial_ends_at,
            current_period_end,
            cancelled_at,
            plan_id,
            subscription_plans ( name, price_monthly )
          )
        `)
        .order("full_name");

      if (error) throw error;
      return json(data);
    }

    // ── update_user_plan ────────────────────────────────────────────────────
    if (action === "update_user_plan") {
      const { target_user_id, plan_id } = body;
      if (!target_user_id || !plan_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id or plan_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", plan_id)
        .single();

      const { error } = await supabase
        .from("subscriptions")
        .upsert(
          { user_id: target_user_id, plan_id, status: "active", updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      // Actualizar feature_permissions segun el nuevo plan
      if (plan?.name) {
        const enabledFeatures = PLAN_FEATURES[plan.name] ?? [];
        const perms = ALL_FEATURES.map((key) => ({
          user_id: target_user_id,
          feature_key: key,
          enabled: enabledFeatures.includes(key),
          updated_at: new Date().toISOString(),
        }));
        await supabase
          .from("feature_permissions")
          .upsert(perms, { onConflict: "user_id,feature_key" });
      }

      return json({ ok: true });
    }

    // ── update_user_permission ──────────────────────────────────────────────
    if (action === "update_user_permission") {
      const { target_user_id, feature_key, enabled } = body;
      if (!target_user_id || !feature_key || typeof enabled !== "boolean") {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id, feature_key or enabled." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await supabase
        .from("feature_permissions")
        .upsert(
          { user_id: target_user_id, feature_key, enabled, updated_at: new Date().toISOString() },
          { onConflict: "user_id,feature_key" }
        );

      if (error) throw error;
      return json({ ok: true });
    }

    // ── update_plan_price ───────────────────────────────────────────────────
    if (action === "update_plan_price") {
      const { plan_id, price_monthly, price_yearly } = body;
      if (!plan_id) {
        return new Response(
          JSON.stringify({ error: "Missing plan_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (price_monthly !== undefined) updates.price_monthly = price_monthly;
      if (price_yearly !== undefined) updates.price_yearly = price_yearly;

      const { error } = await supabase
        .from("subscription_plans")
        .update(updates)
        .eq("id", plan_id);

      if (error) throw error;
      return json({ ok: true });
    }

    // ── create_plan ─────────────────────────────────────────────────────────
    if (action === "create_plan") {
      const { name, description, price_monthly, price_yearly, features, sort_order } = body;
      if (!name || price_monthly === undefined) {
        return new Response(
          JSON.stringify({ error: "Missing name or price_monthly." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { data, error } = await supabase
        .from("subscription_plans")
        .insert({
          name,
          description,
          price_monthly,
          price_yearly: price_yearly ?? null,
          features: features ?? [],
          sort_order: sort_order ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return json(data);
    }

    // ── toggle_plan ─────────────────────────────────────────────────────────
    if (action === "toggle_plan") {
      const { plan_id, is_active } = body;
      if (!plan_id || typeof is_active !== "boolean") {
        return new Response(
          JSON.stringify({ error: "Missing plan_id or is_active." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await supabase
        .from("subscription_plans")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", plan_id);

      if (error) throw error;
      return json({ ok: true });
    }

    // ── cancel_subscription ─────────────────────────────────────────────────
    if (action === "cancel_subscription") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: now, updated_at: now })
        .eq("user_id", target_user_id);

      if (error) throw error;
      return json({ ok: true });
    }

    // ── grant_free_access ───────────────────────────────────────────────────
    if (action === "grant_free_access") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const now = new Date().toISOString();

      // Upsert suscripcion con status 'free' y sin fecha de vencimiento
      const { error: subError } = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: target_user_id,
            status: "free",
            cancelled_at: null,
            trial_ends_at: null,
            current_period_end: null,
            updated_at: now,
          },
          { onConflict: "user_id" }
        );

      if (subError) throw subError;

      // Habilitar todas las features
      const perms = ALL_FEATURES.map((key) => ({
        user_id: target_user_id,
        feature_key: key,
        enabled: true,
        updated_at: now,
      }));
      const { error: permError } = await supabase
        .from("feature_permissions")
        .upsert(perms, { onConflict: "user_id,feature_key" });

      if (permError) throw permError;
      return json({ ok: true });
    }

    // ── list_payment_events ─────────────────────────────────────────────────
    if (action === "list_payment_events") {
      const limit = Number(body.limit ?? 100);
      const { data, error } = await supabase
        .from("payment_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return json(data);
    }

    // ── list_plans ──────────────────────────────────────────────────────────
    if (action === "list_plans") {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      return json(data);
    }

    // ── update_plan ─────────────────────────────────────────────────────────
    if (action === "update_plan") {
      const { plan_id, name, description, price_monthly, price_yearly, features, sort_order } = body;
      if (!plan_id) {
        return new Response(
          JSON.stringify({ error: "Missing plan_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (price_monthly !== undefined) updates.price_monthly = price_monthly;
      if (price_yearly !== undefined) updates.price_yearly = price_yearly;
      if (features !== undefined) updates.features = features;
      if (sort_order !== undefined) updates.sort_order = sort_order;

      const { error } = await supabase
        .from("subscription_plans")
        .update(updates)
        .eq("id", plan_id);

      if (error) throw error;
      return json({ ok: true });
    }

    // ── delete_plan ─────────────────────────────────────────────────────────
    if (action === "delete_plan") {
      const { plan_id } = body;
      if (!plan_id) {
        return new Response(
          JSON.stringify({ error: "Missing plan_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { count } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan_id)
        .in("status", ["active", "trial", "past_due"]);

      if (count && count > 0) {
        return new Response(
          JSON.stringify({ error: `No se puede eliminar: ${count} suscripción(es) activa(s) usan este plan. Desactivalo primero.` }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", plan_id);

      if (error) throw error;
      return json({ ok: true });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
