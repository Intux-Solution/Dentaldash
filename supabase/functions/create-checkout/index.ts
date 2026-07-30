import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

import { buildCors } from "../_shared/cors.ts";

// Actualiza el monto de la cuota de un preapproval ya autorizado.
// La cuota del periodo en curso ya se cobro, asi que MercadoPago aplica el
// monto nuevo recien en la proxima fecha de recurrencia.
async function updatePreapprovalAmount(
  token: string,
  preapprovalId: string,
  amount: number,
  currency: string,
): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      auto_recurring: {
        transaction_amount: amount,
        currency_id: currency,
      },
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, detail: await res.text() };
}

// Cancela un preapproval en MercadoPago. Devuelve el detalle del error si falla.
async function cancelPreapproval(
  token: string,
  preapprovalId: string,
): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, detail: await res.text() };
}

// Deja rastro de un preapproval que quedo activo en MercadoPago sin poder cancelarse.
// Sin esto el doble cobro es invisible hasta que el usuario reclama.
async function logOrphanPreapproval(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  preapprovalId: string,
  detail: string,
): Promise<void> {
  const { error } = await supabase.from("payment_events").insert({
    event_type: "preapproval_cancel_failed",
    mp_resource_id: preapprovalId,
    user_id: userId,
    payload: { detail },
    processed: false,
  });
  if (error) console.error("No se pudo registrar el preapproval huerfano:", error.message);
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
  const APP_URL = Deno.env.get("APP_URL")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: jsonHeaders }
    );
  }
  if (!MP_ACCESS_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Missing MP_ACCESS_TOKEN environment variable." }),
      { status: 500, headers: jsonHeaders }
    );
  }
  if (!APP_URL) {
    return new Response(
      JSON.stringify({ error: "Missing APP_URL environment variable." }),
      { status: 500, headers: jsonHeaders }
    );
  }

  // Verificar JWT del usuario
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header." }),
      { status: 401, headers: jsonHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = authHeader.replace(/^Bearer\s+/, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized / Invalid Token." }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const body = await req.json();
    const { plan_id, action } = body;

    // Suscripcion actual del usuario (puede no existir)
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("status, plan_id, mercadopago_sub_id, current_period_end, pending_plan_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Plan vigente (el que el usuario esta usando hoy)
    let currentPlan: { id: string; name: string; price_monthly: number; currency: string | null } | null = null;
    if (existingSub?.plan_id) {
      const { data } = await supabase
        .from("subscription_plans")
        .select("id, name, price_monthly, currency")
        .eq("id", existingSub.plan_id)
        .maybeSingle();
      currentPlan = data as typeof currentPlan;
    }

    // ── Accion: revertir un downgrade programado ─────────────────────────────
    if (action === "cancel_scheduled_change") {
      if (!existingSub?.pending_plan_id) {
        return new Response(
          JSON.stringify({ error: "No hay ningún cambio de plan programado." }),
          { status: 400, headers: jsonHeaders }
        );
      }
      if (!currentPlan) {
        return new Response(
          JSON.stringify({ error: "No se pudo determinar el plan actual." }),
          { status: 409, headers: jsonHeaders }
        );
      }

      // Restaurar el monto original en MercadoPago antes de tocar la DB.
      if (existingSub.mercadopago_sub_id) {
        const restore = await updatePreapprovalAmount(
          MP_ACCESS_TOKEN,
          existingSub.mercadopago_sub_id,
          Number(currentPlan.price_monthly),
          currentPlan.currency ?? "ARS",
        );
        if (!restore.ok) {
          console.error("MercadoPago restore amount error:", restore.detail);
          return new Response(
            JSON.stringify({ error: "No se pudo restaurar el monto en MercadoPago." }),
            { status: 502, headers: jsonHeaders }
          );
        }
      }

      const { error: clearError } = await supabase
        .from("subscriptions")
        .update({
          pending_plan_id: null,
          pending_plan_effective_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (clearError) {
        console.error("Supabase clear pending error:", clearError.message);
        return new Response(
          JSON.stringify({ error: "Failed to clear scheduled plan change." }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ cancelled: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Accion: cancelar la suscripcion ──────────────────────────────────────
    if (action === "cancel_subscription") {
      if (!existingSub) {
        return new Response(
          JSON.stringify({ error: "No tenés ninguna suscripción activa." }),
          { status: 404, headers: jsonHeaders }
        );
      }

      // El preapproval se cancela PRIMERO: marcar la fila como cancelada sin frenar
      // el cobro en MercadoPago le sigue debitando al usuario un servicio que ya no
      // ve. Si MP rechaza, se aborta la cancelacion entera y se avisa.
      if (existingSub.mercadopago_sub_id) {
        const cancelled = await cancelPreapproval(
          MP_ACCESS_TOKEN,
          existingSub.mercadopago_sub_id,
        );
        if (!cancelled.ok) {
          console.error("MercadoPago cancel subscription error:", cancelled.detail);
          await logOrphanPreapproval(
            supabase,
            user.id,
            existingSub.mercadopago_sub_id,
            cancelled.detail ?? "",
          );
          return new Response(
            JSON.stringify({
              error: "No se pudo cancelar el cobro automático en MercadoPago. Intentá de nuevo en unos minutos.",
            }),
            { status: 502, headers: jsonHeaders }
          );
        }
      }

      const cancelIso = new Date().toISOString();
      const { error: cancelError } = await supabase
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: cancelIso,
          // Un downgrade programado deja de tener sentido: si quedara, el cron
          // mutaria el plan_id de una suscripcion ya cancelada.
          pending_plan_id: null,
          pending_plan_effective_at: null,
          updated_at: cancelIso,
        })
        .eq("user_id", user.id);

      if (cancelError) {
        console.error("Supabase cancel subscription error:", cancelError.message);
        return new Response(
          JSON.stringify({ error: "Failed to cancel subscription." }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ cancelled: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    if (!plan_id) {
      return new Response(
        JSON.stringify({ error: "Missing plan_id in request body." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Verificar que el plan existe y esta activo
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found or inactive." }),
        { status: 404, headers: jsonHeaders }
      );
    }

    if (existingSub?.status === "active" && existingSub.plan_id === plan_id) {
      return new Response(
        JSON.stringify({ error: "Ya tenés este plan activo." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── Downgrade: sin cobro nuevo, efectivo al vencer el periodo pagado ─────
    // Solo aplica si hay una suscripcion activa en MercadoPago con periodo
    // vigente y el plan destino es mas barato que el actual.
    const periodEndsAt = existingSub?.current_period_end
      ? new Date(existingSub.current_period_end)
      : null;

    const isDowngrade =
      existingSub?.status === "active" &&
      !!existingSub.mercadopago_sub_id &&
      !!currentPlan &&
      !!periodEndsAt &&
      periodEndsAt.getTime() > Date.now() &&
      Number(plan.price_monthly) < Number(currentPlan.price_monthly);

    if (isDowngrade) {
      // Bajar el monto de las proximas cuotas. Fatal: si MP rechaza, no tocamos
      // la DB para no prometer un cambio que el cobro no va a respetar.
      const update = await updatePreapprovalAmount(
        MP_ACCESS_TOKEN,
        existingSub!.mercadopago_sub_id!,
        Number(plan.price_monthly),
        plan.currency ?? "ARS",
      );
      if (!update.ok) {
        console.error("MercadoPago downgrade error:", update.detail);
        return new Response(
          JSON.stringify({ error: "No se pudo programar el cambio de plan en MercadoPago." }),
          { status: 502, headers: jsonHeaders }
        );
      }

      // plan_id, status y feature_permissions quedan intactos: el usuario sigue
      // usando el plan actual hasta pending_plan_effective_at.
      const { error: scheduleError } = await supabase
        .from("subscriptions")
        .update({
          pending_plan_id: plan_id,
          pending_plan_effective_at: existingSub!.current_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (scheduleError) {
        console.error("Supabase schedule downgrade error:", scheduleError.message);
        // El monto ya bajo en MercadoPago. Sin registro en la DB el usuario pagaria
        // el precio del plan barato conservando el plan caro para siempre, asi que
        // hay que devolver el monto a su valor original.
        const rollback = await updatePreapprovalAmount(
          MP_ACCESS_TOKEN,
          existingSub!.mercadopago_sub_id!,
          Number(currentPlan!.price_monthly),
          currentPlan!.currency ?? "ARS",
        );
        if (!rollback.ok) {
          console.error(
            "CRITICAL: monto bajado en MercadoPago sin registro en DB y rollback fallido.",
            { preapproval: existingSub!.mercadopago_sub_id, detail: rollback.detail },
          );
        }
        return new Response(
          JSON.stringify({ error: "Failed to schedule plan change." }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          scheduled: true,
          effective_at: existingSub!.current_period_end,
          plan_name: plan.name,
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Alta / upgrade / reactivacion: checkout con cobro inmediato ──────────
    // Crear preapproval (suscripcion recurrente) en MercadoPago.
    // payer_email es el email del usuario: en test debe ser una cuenta
    // de comprador de prueba de MP; en produccion es el email real del usuario.
    // status="pending" es obligatorio para suscripciones sin plan asociado:
    // genera el init_point para que el usuario elija el medio de pago.
    // transaction_amount debe ser numero (Postgres devuelve numeric como string).
    const mpPayload = {
      reason: `Suscripcion DentalDash ${plan.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(plan.price_monthly),
        currency_id: plan.currency ?? "ARS",
      },
      back_url: `${APP_URL}/suscripcion/exito`,
      payer_email: user.email,
      external_reference: `${user.id}|${plan_id}`,
      status: "pending",
    };

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(mpPayload),
    });

    if (!mpRes.ok) {
      const mpError = await mpRes.text();
      console.error("MercadoPago error:", mpError);
      return new Response(
        JSON.stringify({ error: "No se pudo crear la suscripción en MercadoPago." }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const mpData = await mpRes.json();
    const { id: mpSubId, init_point } = mpData;

    // Recien ahora cancelamos la preapproval anterior: si el POST de arriba
    // hubiera fallado, el usuario conserva la suscripcion que ya tenia.
    if (existingSub?.mercadopago_sub_id && existingSub.mercadopago_sub_id !== mpSubId) {
      try {
        const cancelRes = await cancelPreapproval(
          MP_ACCESS_TOKEN,
          existingSub.mercadopago_sub_id,
        );
        if (!cancelRes.ok) {
          const detail = cancelRes.detail ?? "";
          console.warn("MercadoPago cancel warning (non-fatal):", detail);
          // No es fatal (el preapproval nuevo ya existe), pero deja al usuario con dos
          // suscripciones activas cobrando en paralelo. Queda auditable para revisarlo.
          await logOrphanPreapproval(supabase, user.id, existingSub.mercadopago_sub_id, detail);
        }
      } catch (cancelErr) {
        console.warn("MercadoPago cancel exception (non-fatal):", cancelErr);
        await logOrphanPreapproval(
          supabase,
          user.id,
          existingSub.mercadopago_sub_id,
          String(cancelErr),
        );
      }
    }

    // Guardar el preapproval nuevo. Si ya habia suscripcion, NO se toca plan_id
    // ni status: el plan recien cambia cuando mp-webhook recibe 'authorized'.
    // Asi, abandonar el checkout deja al usuario como estaba.
    // Un upgrade tambien anula cualquier downgrade que estuviera programado.
    const nowIso = new Date().toISOString();
    const { error: upsertError } = existingSub
      ? await supabase
          .from("subscriptions")
          .update({
            mercadopago_sub_id: mpSubId,
            pending_plan_id: null,
            pending_plan_effective_at: null,
            updated_at: nowIso,
          })
          .eq("user_id", user.id)
      : await supabase
          .from("subscriptions")
          .insert({
            user_id: user.id,
            plan_id,
            status: "trial", // Se cambia a 'active' cuando llega el webhook
            mercadopago_sub_id: mpSubId,
            updated_at: nowIso,
          });

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError.message);
      return new Response(
        JSON.stringify({ error: "Failed to save subscription record." }),
        { status: 500, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ init_point, mp_sub_id: mpSubId }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err: any) {
    console.error("create-checkout error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor." }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
