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
      const [profilesRes, subsRes, plansRes, authUsersRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role").order("full_name"),
        supabase.from("subscriptions").select("user_id, status, plan_id, trial_ends_at, current_period_end, cancelled_at, mercadopago_sub_id"),
        supabase.from("subscription_plans").select("id, name, price_monthly"),
        supabase.auth.admin.listUsers({ perPage: 1000 }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      if (plansRes.error) throw plansRes.error;

      const emailMap: Record<string, string> = {};
      const createdAtMap: Record<string, string | null> = {};
      ((authUsersRes.data as any)?.users ?? []).forEach((u: any) => {
        emailMap[u.id] = u.email ?? "";
        createdAtMap[u.id] = u.created_at ?? null;
      });

      const plansById: Record<string, any> = {};
      (plansRes.data ?? []).forEach((p: any) => { plansById[p.id] = p; });

      const subsByUserId: Record<string, any> = {};
      (subsRes.data ?? []).forEach((s: any) => { subsByUserId[s.user_id] = s; });

      const result = (profilesRes.data ?? []).map((p: any) => ({
        ...p,
        email: emailMap[p.id] ?? "",
        created_at: createdAtMap[p.id] ?? null,
        subscriptions: subsByUserId[p.id]
          ? [{
              ...subsByUserId[p.id],
              subscription_plans: subsByUserId[p.id].plan_id
                ? (plansById[subsByUserId[p.id].plan_id] ?? null)
                : null,
            }]
          : [],
      }));

      return json(result);
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
        .select("name, feature_keys")
        .eq("id", plan_id)
        .single();

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { error } = await supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: target_user_id,
            plan_id,
            status: "active",
            trial_ends_at: now.toISOString(),          // finaliza el trial
            current_period_start: now.toISOString(),   // comienza el periodo del plan
            current_period_end: periodEnd.toISOString(),
            cancelled_at: null,
            updated_at: now.toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      // Actualizar feature_permissions segun el nuevo plan (lee feature_keys de la DB)
      if (plan) {
        const enabledFeatures: string[] = (plan as any).feature_keys ?? [];
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
      const { name, description, price_monthly, price_yearly, features, feature_keys, sort_order } = body;
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
          feature_keys: feature_keys ?? [],
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

      const userIds = [...new Set(((data ?? []) as any[]).map((e: any) => e.user_id).filter(Boolean))];
      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        ((profiles ?? []) as any[]).forEach((p: any) => { profileMap[p.id] = p.full_name ?? ""; });
      }

      const result = ((data ?? []) as any[]).map((e: any) => ({
        ...e,
        user_name: profileMap[e.user_id] ?? "—",
      }));

      return json(result);
    }

    // ── backfill_payment_status ─────────────────────────────────────────────
    // Consulta a MercadoPago el estado real de cada preapproval y rellena
    // payment_events.mp_status en los eventos que aun no lo tienen.
    if (action === "backfill_payment_status") {
      const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
      if (!MP_ACCESS_TOKEN) {
        return new Response(
          JSON.stringify({ error: "MP_ACCESS_TOKEN no configurado." }),
          { status: 500, headers: corsHeaders }
        );
      }

      const { data: pending, error: pendingError } = await supabase
        .from("payment_events")
        .select("mp_resource_id, event_type")
        .is("mp_status", null)
        .not("mp_resource_id", "is", null);

      if (pendingError) throw pendingError;

      // Deduplicar por mp_resource_id para no repetir llamadas a MP
      const resourceMap = new Map<string, string>();
      ((pending ?? []) as any[]).forEach((e: any) => {
        if (!resourceMap.has(e.mp_resource_id)) {
          resourceMap.set(e.mp_resource_id, e.event_type);
        }
      });

      let updated = 0;
      for (const [resourceId, eventType] of resourceMap) {
        try {
          // Resolver el preapproval segun el tipo de evento
          let preapprovalId: string | null = null;
          if (eventType === "subscription_preapproval") {
            preapprovalId = resourceId;
          } else if (eventType === "subscription_authorized_payment") {
            const apRes = await fetch(
              `https://api.mercadopago.com/authorized_payments/${resourceId}`,
              { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
            );
            if (apRes.ok) {
              const ap = await apRes.json();
              preapprovalId = ap?.preapproval_id ?? null;
            }
          }

          if (!preapprovalId) continue;

          const mpRes = await fetch(
            `https://api.mercadopago.com/preapproval/${preapprovalId}`,
            { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
          );
          if (!mpRes.ok) continue;

          const mpSub = await mpRes.json();
          const mpStatus: string | null = mpSub?.status ?? null;
          if (!mpStatus) continue;

          const { error: updErr } = await supabase
            .from("payment_events")
            .update({ mp_status: mpStatus })
            .eq("mp_resource_id", resourceId)
            .is("mp_status", null);

          if (!updErr) updated++;
        } catch (_e) {
          // Ignorar errores individuales y seguir con el resto
          continue;
        }
      }

      return json({ ok: true, updated });
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
      const { plan_id, name, description, price_monthly, price_yearly, features, feature_keys, sort_order } = body;
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
      if (feature_keys !== undefined) updates.feature_keys = feature_keys;
      if (sort_order !== undefined) updates.sort_order = sort_order;

      const { error } = await supabase
        .from("subscription_plans")
        .update(updates)
        .eq("id", plan_id);

      if (error) throw error;

      // Si cambiaron los feature_keys, propagar a los usuarios que tienen este plan
      // (asi, editar los permisos de un plan SI impacta a los usuarios existentes).
      if (feature_keys !== undefined) {
        const enabledFeatures: string[] = (feature_keys as string[]) ?? [];
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("plan_id", plan_id);

        const userIds = [...new Set(((subs ?? []) as any[]).map((s: any) => s.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const now = new Date().toISOString();
          const perms = userIds.flatMap((uid: string) =>
            ALL_FEATURES.map((key) => ({
              user_id: uid,
              feature_key: key,
              enabled: enabledFeatures.includes(key),
              updated_at: now,
            }))
          );
          const { error: permError } = await supabase
            .from("feature_permissions")
            .upsert(perms, { onConflict: "user_id,feature_key" });
          if (permError) throw permError;
        }
      }

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

    // ── get_user_permissions ────────────────────────────────────────────────
    if (action === "get_user_permissions") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { data, error } = await supabase
        .from("feature_permissions")
        .select("feature_key, enabled")
        .eq("user_id", target_user_id);

      if (error) throw error;
      return json(data ?? []);
    }

    // ── add_admin ───────────────────────────────────────────────────────────
    if (action === "add_admin") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error: insertError } = await supabase
        .from("admin_users")
        .insert({ user_id: target_user_id });

      if (insertError && !insertError.message.includes("duplicate")) throw insertError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", target_user_id);

      if (profileError) throw profileError;
      return json({ ok: true });
    }

    // ── remove_admin ────────────────────────────────────────────────────────
    if (action === "remove_admin") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (target_user_id === user.id) {
        return new Response(
          JSON.stringify({ error: "No podés quitarte el rol admin a vos mismo." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error: deleteError } = await supabase
        .from("admin_users")
        .delete()
        .eq("user_id", target_user_id);

      if (deleteError) throw deleteError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "dentist" })
        .eq("id", target_user_id);

      if (profileError) throw profileError;
      return json({ ok: true });
    }

    // ── delete_user ─────────────────────────────────────────────────────────
    if (action === "delete_user") {
      const { target_user_id } = body;
      if (!target_user_id) {
        return new Response(
          JSON.stringify({ error: "Missing target_user_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (target_user_id === user.id) {
        return new Response(
          JSON.stringify({ error: "No podés eliminar tu propia cuenta." }),
          { status: 400, headers: corsHeaders }
        );
      }

      // 1) Recolectar paths de Storage antes de borrar las filas (best-effort)
      const isStoragePath = (v: unknown): v is string =>
        typeof v === "string" &&
        v.length > 5 &&
        !v.startsWith("http://") &&
        !v.startsWith("https://") &&
        !v.includes(" ");

      const clinicalPaths: string[] = [];
      const avatarPaths: string[] = [];

      const { data: patientFiles } = await supabase
        .from("patients")
        .select("historia_clinica_url, consentimiento_url")
        .eq("user_id", target_user_id);

      ((patientFiles ?? []) as any[]).forEach((p: any) => {
        if (isStoragePath(p.historia_clinica_url)) clinicalPaths.push(p.historia_clinica_url);
        if (isStoragePath(p.consentimiento_url)) clinicalPaths.push(p.consentimiento_url);
      });

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", target_user_id)
        .single();

      if (isStoragePath((profileRow as any)?.avatar_url)) {
        avatarPaths.push((profileRow as any).avatar_url);
      }

      if (clinicalPaths.length > 0) {
        try { await supabase.storage.from("clinical-records").remove(clinicalPaths); }
        catch (e) { console.warn("delete_user: storage clinical-records cleanup failed", e); }
      }
      if (avatarPaths.length > 0) {
        try { await supabase.storage.from("avatars").remove(avatarPaths); }
        catch (e) { console.warn("delete_user: storage avatars cleanup failed", e); }
      }

      // 2) Borrar filas en orden hijos -> padres (best-effort, acumulando errores no fatales)
      const byUser: { table: string; col: string }[] = [
        { table: "treatment_history", col: "user_id" },
        { table: "odontograms", col: "user_id" },
        { table: "appointments", col: "user_id" },
        { table: "patients", col: "user_id" },
        { table: "schedules", col: "user_id" },
        { table: "feature_permissions", col: "user_id" },
        { table: "payment_events", col: "user_id" },
        { table: "chat_history", col: "tenant_id" },
        { table: "tenant_faqs", col: "tenant_id" },
        { table: "subscriptions", col: "user_id" },
        { table: "admin_users", col: "user_id" },
        { table: "profiles", col: "id" },
      ];

      const cleanupErrors: string[] = [];
      for (const { table, col } of byUser) {
        const { error } = await supabase.from(table).delete().eq(col, target_user_id);
        if (error) {
          console.warn(`delete_user: failed to clean ${table}: ${error.message}`);
          cleanupErrors.push(`${table}: ${error.message}`);
        }
      }

      // 3) Borrar la cuenta de auth (si esto falla, es un error real)
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(target_user_id);
      if (authDeleteError) {
        return new Response(
          JSON.stringify({ error: `No se pudo eliminar la cuenta de acceso: ${authDeleteError.message}` }),
          { status: 500, headers: corsHeaders }
        );
      }

      return json({ ok: true, cleanup_warnings: cleanupErrors });
    }

    // ── list_support_messages ───────────────────────────────────────────────
    if (action === "list_support_messages") {
      const limit = Number(body.limit ?? 100);
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const userIds = [...new Set(((data ?? []) as any[]).map((m: any) => m.user_id).filter(Boolean))];
      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        ((profiles ?? []) as any[]).forEach((p: any) => { profileMap[p.id] = p.full_name ?? ""; });
      }

      const result = ((data ?? []) as any[]).map((m: any) => ({
        ...m,
        user_name: profileMap[m.user_id] || "—",
      }));

      return json(result);
    }

    // ── mark_message_read ───────────────────────────────────────────────────
    if (action === "mark_message_read") {
      const { message_id } = body;
      if (!message_id) {
        return new Response(
          JSON.stringify({ error: "Missing message_id." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await supabase
        .from("support_messages")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", message_id);

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
