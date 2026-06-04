import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
  const APP_URL = Deno.env.get("APP_URL")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration." }),
      { status: 500, headers: corsHeaders }
    );
  }
  if (!MP_ACCESS_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Missing MP_ACCESS_TOKEN environment variable." }),
      { status: 500, headers: corsHeaders }
    );
  }
  if (!APP_URL) {
    return new Response(
      JSON.stringify({ error: "Missing APP_URL environment variable." }),
      { status: 500, headers: corsHeaders }
    );
  }

  // Verificar JWT del usuario
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header." }),
      { status: 401, headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = authHeader.replace(/^Bearer\s+/, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized / Invalid Token." }),
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { plan_id } = body;

    if (!plan_id) {
      return new Response(
        JSON.stringify({ error: "Missing plan_id in request body." }),
        { status: 400, headers: corsHeaders }
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
        { status: 404, headers: corsHeaders }
      );
    }

    // Si el usuario ya tiene suscripcion activa en MP, cancelarla antes de crear la nueva
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("status, mercadopago_sub_id")
      .eq("user_id", user.id)
      .single();

    if (existingSub?.status === "active" && existingSub?.mercadopago_sub_id) {
      const cancelRes = await fetch(
        `https://api.mercadopago.com/preapproval/${existingSub.mercadopago_sub_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        }
      );
      if (!cancelRes.ok) {
        const detail = await cancelRes.text();
        console.error("MercadoPago cancel error:", detail);
        return new Response(
          JSON.stringify({ error: "No se pudo cancelar la suscripción anterior en MercadoPago.", detail }),
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // Obtener el email del usuario desde profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    // Crear preapproval (suscripcion recurrente) en MercadoPago
    const mpPayload = {
      reason: `Suscripcion DentalDash ${plan.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.price_monthly,
        currency_id: plan.currency ?? "ARS",
      },
      back_url: `${APP_URL}/suscripcion/exito`,
      payer_email: user.email,
      external_reference: `${user.id}|${plan_id}`,
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
        JSON.stringify({ error: "Failed to create MercadoPago preapproval.", detail: mpError }),
        { status: 502, headers: corsHeaders }
      );
    }

    const mpData = await mpRes.json();
    const { id: mpSubId, init_point } = mpData;

    // Upsert de la suscripcion en estado 'pending'
    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_id,
          status: "trial", // Se cambia a 'active' cuando llega el webhook
          mercadopago_sub_id: mpSubId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError.message);
      return new Response(
        JSON.stringify({ error: "Failed to save subscription record." }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ init_point, mp_sub_id: mpSubId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
