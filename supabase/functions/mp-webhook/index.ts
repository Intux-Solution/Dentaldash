import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

// Feature keys que se habilitan segun el plan
const PLAN_FEATURES: Record<string, string[]> = {
  Trial: [
    "appointments",
    "odontogram",
    "clinical_records",
    "consent_forms",
  ],
  Basico: [
    "appointments",
    "odontogram",
    "clinical_records",
    "consent_forms",
    "patients_unlimited",
    "insurance_management",
    "services_config",
    "export_data",
  ],
  Pro: [
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
  ],
};

// Todas las feature keys posibles
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
  // Este endpoint es publico (no requiere JWT) — MercadoPago no envia tokens
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
  const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MP_ACCESS_TOKEN) {
    console.error("Missing required environment variables.");
    return new Response("Internal configuration error.", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Validacion de firma del webhook (x-signature) si hay secret configurado
    if (MP_WEBHOOK_SECRET) {
      const xSignature = req.headers.get("x-signature");
      const xRequestId = req.headers.get("x-request-id");
      if (!xSignature) {
        console.warn("Missing x-signature header, rejecting request.");
        return new Response("Unauthorized", { status: 401 });
      }

      // Extraer ts y v1 del header x-signature
      const parts = Object.fromEntries(
        xSignature.split(",").map((p) => p.trim().split("=") as [string, string])
      );
      const ts = parts["ts"];
      const v1 = parts["v1"];

      if (!ts || !v1) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Construir el mensaje a verificar segun la doc de MercadoPago
      const url = new URL(req.url);
      const dataId = url.searchParams.get("data.id") ?? "";
      const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;

      const encoder = new TextEncoder();
      const keyData = encoder.encode(MP_WEBHOOK_SECRET);
      const msgData = encoder.encode(manifest);

      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      const hashHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (hashHex !== v1) {
        console.warn("Webhook signature mismatch.");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = await req.json();
    const { type, data } = payload;

    // Registrar evento crudo para auditoria
    await supabase.from("payment_events").insert({
      event_type: type ?? "unknown",
      mp_resource_id: data?.id ?? null,
      payload,
      processed: false,
    });

    // Solo procesar eventos de suscripcion (preapproval)
    if (type !== "subscription_preapproval") {
      return new Response("OK", { status: 200 });
    }

    const subId = data?.id;
    if (!subId) {
      return new Response("OK", { status: 200 });
    }

    // Consultar estado real en MercadoPago
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error("Failed to fetch preapproval from MP:", await mpRes.text());
      return new Response("OK", { status: 200 });
    }

    const mpSub = await mpRes.json();
    const {
      status: mpStatus,
      external_reference,
      payer_id,
      summarized,
    } = mpSub;

    // external_reference tiene formato "userId|planId"
    const [userId, planId] = (external_reference ?? "|").split("|");

    if (!userId || !planId) {
      console.error("Could not extract userId/planId from external_reference:", external_reference);
      return new Response("OK", { status: 200 });
    }

    // Mapear estado de MP a estado interno
    let internalStatus: string;
    switch (mpStatus) {
      case "authorized":
      case "charged":
        internalStatus = "active";
        break;
      case "cancelled":
      case "paused":
        internalStatus = "cancelled";
        break;
      case "payment_failed":
        internalStatus = "past_due";
        break;
      default:
        internalStatus = "trial";
    }

    // Calcular fechas del periodo actual
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Actualizar la suscripcion
    const updateData: Record<string, unknown> = {
      status: internalStatus,
      mercadopago_payer_id: String(payer_id ?? ""),
      updated_at: now.toISOString(),
    };

    if (internalStatus === "active") {
      updateData.current_period_start = now.toISOString();
      updateData.current_period_end = periodEnd.toISOString();
      updateData.cancelled_at = null;
    } else if (internalStatus === "cancelled") {
      updateData.cancelled_at = now.toISOString();
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("mercadopago_sub_id", subId);

    if (updateError) {
      console.error("Error updating subscription:", updateError.message);
    }

    // Si se activo, actualizar feature_permissions segun el plan
    if (internalStatus === "active") {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", planId)
        .single();

      const enabledFeatures = PLAN_FEATURES[plan?.name ?? ""] ?? [];

      const permissionsUpsert = ALL_FEATURES.map((key) => ({
        user_id: userId,
        feature_key: key,
        enabled: enabledFeatures.includes(key),
        updated_at: now.toISOString(),
      }));

      const { error: permError } = await supabase
        .from("feature_permissions")
        .upsert(permissionsUpsert, { onConflict: "user_id,feature_key" });

      if (permError) {
        console.error("Error upserting feature_permissions:", permError.message);
      }
    }

    // Marcar el evento como procesado
    await supabase
      .from("payment_events")
      .update({ processed: true, user_id: userId })
      .eq("mp_resource_id", subId)
      .eq("processed", false);

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("mp-webhook error:", err.message);
    return new Response("Internal Server Error", { status: 500 });
  }
});
