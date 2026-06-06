import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

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

// Valida la firma x-signature de MercadoPago. Devuelve true/false.
// No lanza: si algo falla, devuelve false para que el caller decida.
async function verifySignature(
  req: Request,
  url: URL,
  secret: string,
): Promise<boolean> {
  try {
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    if (!xSignature) return false;

    const parts = Object.fromEntries(
      xSignature.split(",").map((p) => p.trim().split("=") as [string, string]),
    );
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) return false;

    const dataId = url.searchParams.get("data.id") ?? "";
    const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(manifest),
    );
    const hashHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex === v1;
  } catch (_err) {
    return false;
  }
}

serve(async (req) => {
  // Endpoint publico (MercadoPago no envia JWT)
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
    const url = new URL(req.url);
    const rawBody = await req.text();
    let payload: Record<string, any> = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (_e) {
      payload = {};
    }

    const topic: string = payload.type ?? url.searchParams.get("type") ?? "unknown";
    const resourceId: string | null =
      payload?.data?.id ?? url.searchParams.get("data.id") ?? null;

    // 1) Registrar SIEMPRE el evento crudo para auditoria (antes de cualquier validacion)
    await supabase.from("payment_events").insert({
      event_type: topic,
      mp_resource_id: resourceId,
      payload,
      processed: false,
    });

    // 2) Validacion de firma (no bloqueante): se loguea el resultado pero NO se rechaza,
    //    porque mas abajo el webhook consulta el estado REAL en MercadoPago antes de
    //    actuar (un payload falsificado no puede activar nada sin un recurso valido en MP).
    if (MP_WEBHOOK_SECRET) {
      const validSig = await verifySignature(req, url, MP_WEBHOOK_SECRET);
      if (!validSig) {
        console.warn("Webhook signature invalid or missing (processing anyway).");
      }
    }

    // 3) Resolver el preapproval (suscripcion) afectado segun el topic
    let preapprovalId: string | null = null;

    if (topic === "subscription_preapproval") {
      // data.id es el id del preapproval
      preapprovalId = resourceId;
    } else if (topic === "subscription_authorized_payment") {
      // data.id es el id del authorized_payment (cuota cobrada): obtener su preapproval_id
      if (resourceId) {
        const apRes = await fetch(
          `https://api.mercadopago.com/authorized_payments/${resourceId}`,
          { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
        );
        if (apRes.ok) {
          const ap = await apRes.json();
          preapprovalId = ap?.preapproval_id ?? null;
        } else {
          console.error("Failed to fetch authorized_payment:", await apRes.text());
        }
      }
    } else {
      // Otros topics (incluido subscription_preapproval_plan): nada que procesar
      return new Response("OK", { status: 200 });
    }

    if (!preapprovalId) {
      return new Response("OK", { status: 200 });
    }

    // 4) Consultar el estado REAL del preapproval en MercadoPago
    const mpRes = await fetch(
      `https://api.mercadopago.com/preapproval/${preapprovalId}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
    );

    if (!mpRes.ok) {
      console.error("Failed to fetch preapproval from MP:", await mpRes.text());
      return new Response("OK", { status: 200 });
    }

    const mpSub = await mpRes.json();
    const { status: mpStatus, external_reference, payer_id } = mpSub;

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

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const updateData: Record<string, unknown> = {
      status: internalStatus,
      mercadopago_payer_id: String(payer_id ?? ""),
      updated_at: now.toISOString(),
    };

    if (internalStatus === "active") {
      updateData.plan_id = planId;                      // garantiza el plan elegido
      updateData.current_period_start = now.toISOString();
      updateData.current_period_end = periodEnd.toISOString();
      updateData.trial_ends_at = now.toISOString();     // finaliza el trial al activar el plan
      updateData.cancelled_at = null;
    } else if (internalStatus === "cancelled") {
      updateData.cancelled_at = now.toISOString();
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("mercadopago_sub_id", preapprovalId);

    if (updateError) {
      console.error("Error updating subscription:", updateError.message);
    }

    // Si quedo activa, sincronizar feature_permissions segun el plan
    if (internalStatus === "active") {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name, feature_keys")
        .eq("id", planId)
        .single();

      const enabledFeatures: string[] = (plan as any)?.feature_keys ?? [];

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

    // Marcar el evento como procesado y guardar el estado REAL de MercadoPago
    await supabase
      .from("payment_events")
      .update({ processed: true, user_id: userId, mp_status: mpStatus })
      .eq("mp_resource_id", resourceId)
      .eq("processed", false);

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("mp-webhook error:", err.message);
    return new Response("Internal Server Error", { status: 500 });
  }
});
