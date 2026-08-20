import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";
import { buildPermissionRows } from "../_shared/feature-keys.ts";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { mapMpStatus } from "../_shared/mp-status.ts";

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

    // MercadoPago especifica que un data.id alfanumerico se toma en minusculas
    // para armar el manifest. Hoy los ids de preapproval ya vienen asi, pero si
    // eso cambiara sin el toLowerCase TODOS los webhooks empezarian a devolver
    // 401 y ninguna suscripcion volveria a activarse.
    const dataId = (url.searchParams.get("data.id") ?? "").toLowerCase();
    const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;

    const hashHex = await hmacSha256Hex(secret, manifest);

    // Comparacion en tiempo constante: mismo rigor que el secreto de chat-webhook.
    return timingSafeEqual(hashHex, v1.trim().toLowerCase());
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

    // 1) Validar firma SIEMPRE, antes de tocar la base. Fail-closed: si el secreto
    //    no está configurado, no hay forma de autenticar al llamante, así que se
    //    rechaza todo tráfico (503) en vez de aceptarlo sin validar.
    if (!MP_WEBHOOK_SECRET) {
      console.error("mp-webhook: MP_WEBHOOK_SECRET no configurado. Rechazando por seguridad.");
      return new Response("Service misconfigured", { status: 503 });
    }
    const validSig = await verifySignature(req, url, MP_WEBHOOK_SECRET);
    if (!validSig) {
      console.warn("Webhook signature invalid or missing. Rejecting request.", { topic, resourceId });
      return new Response("Invalid signature", { status: 401 });
    }

    // 2) Registrar el evento crudo para auditoria (ya autenticado): antes cualquiera
    //    podía spamear payment_events sin firma válida.
    //
    //    Se guarda el id de la fila para cerrarla al final. Cerrarla por
    //    `mp_resource_id` marcaba tambien las filas de fallo que escribe
    //    `create-checkout` con ese mismo id, con un `mp_status` ajeno: justo la
    //    bitacora que uno mira cuando algo salio mal quedaba adulterada.
    const { data: eventRow, error: eventInsertError } = await supabase
      .from("payment_events")
      .insert({
        event_type: topic,
        mp_resource_id: resourceId,
        payload,
        processed: false,
      })
      .select("id")
      .single();

    if (eventInsertError) {
      console.error("mp-webhook: no se pudo registrar el evento:", eventInsertError.message);
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
          const detail = await apRes.text();
          console.error("Failed to fetch authorized_payment:", apRes.status, detail);
          // Este es el evento de la cuota mensual: perderlo significa que
          // `current_period_end` no avanza y el cliente termina bloqueado por
          // vencimiento pese a haber pagado. Solo el 404 es definitivo.
          if (apRes.status !== 404) {
            return new Response("Retry", { status: 500 });
          }
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
      const detail = await mpRes.text();
      console.error("Failed to fetch preapproval from MP:", mpRes.status, detail);

      // Un 404 es definitivo: ese preapproval no existe y reintentar no lo va a
      // hacer aparecer. Cualquier otra cosa (429, 5xx, mantenimiento) es
      // transitoria, y contestar 200 ahi descartaba el evento para siempre por
      // una caida de un minuto de la API de MercadoPago. Todavia no reclamamos
      // la clave de idempotencia, asi que el reintento entra limpio.
      if (mpRes.status === 404) {
        return new Response("OK (preapproval inexistente)", { status: 200 });
      }
      return new Response("Retry", { status: 500 });
    }

    const mpSub = await mpRes.json();
    const { status: mpStatus, external_reference, payer_id, next_payment_date } = mpSub;

    // external_reference tiene formato "userId|planId"
    const [userId, planId] = (external_reference ?? "|").split("|");
    if (!userId || !planId) {
      console.error("Could not extract userId/planId from external_reference:", external_reference);
      return new Response("OK", { status: 200 });
    }

    // Idempotencia: si ya procesamos este evento exacto, no reprocesar.
    // MercadoPago reenvia webhooks; la PK de processed_mp_events rechaza el duplicado.
    //
    // La clave incluye topic y resourceId, no solo el estado del preapproval: en una
    // suscripcion recurrente mpStatus queda en "authorized" mes tras mes, asi que una
    // clave `${preapprovalId}:${mpStatus}` descartaba TODAS las cuotas posteriores a la
    // primera como duplicadas y current_period_end nunca avanzaba. Con el id del pago
    // (distinto en cada cuota) cada cobro se procesa una sola vez y todos se procesan.
    //
    // La clave se reclama ANTES de procesar (asi dos entregas simultaneas del
    // mismo evento no se pisan), pero si el procesamiento falla se libera mas
    // abajo para que el reintento de MercadoPago pueda volver a tomarla.
    const eventKey = `${preapprovalId}:${topic}:${resourceId ?? ""}:${mpStatus}`;
    const { error: idemError } = await supabase
      .from("processed_mp_events")
      .insert({ event_key: eventKey });
    if (idemError) {
      if (idemError.code === "23505") {
        return new Response("OK (already processed)", { status: 200 });
      }
      // Si fallo por otra causa, lo logueamos pero seguimos (no bloqueante).
      console.error("Error registrando idempotencia:", idemError.message);
    }

    /** Libera la clave para que MercadoPago pueda reintentar este mismo evento. */
    const releaseIdempotencyKey = async () => {
      const { error } = await supabase
        .from("processed_mp_events")
        .delete()
        .eq("event_key", eventKey);
      if (error) {
        console.error(
          "CRITICAL: no se pudo liberar la clave de idempotencia; el evento no se va a reprocesar.",
          { eventKey, detail: error.message },
        );
      }
    };

    // Mapear estado de MP a estado interno. `null` = MercadoPago informo algo que
    // no sabemos interpretar (tipicamente "pending"): se actualizan los datos del
    // pagador pero NO se toca el estado de la suscripcion.
    const internalStatus = mapMpStatus(mpStatus);

    // Estado actual de la suscripcion: hace falta para no pisar un downgrade
    // programado y para extender el periodo sin regalar ni recortar dias.
    const { data: currentSub } = await supabase
      .from("subscriptions")
      .select("current_period_end, pending_plan_id")
      .eq("mercadopago_sub_id", preapprovalId)
      .maybeSingle();

    const hasPendingChange = !!currentSub?.pending_plan_id;

    const now = new Date();

    const previousEnd = currentSub?.current_period_end
      ? new Date(currentSub.current_period_end)
      : null;
    const hasLivePeriod = !!previousEnd && previousEnd > now;

    // La proxima renovacion la define MercadoPago, no una cuenta local: un downgrade
    // hace PUT /preapproval para bajar el monto y eso dispara un webhook
    // 'subscription_preapproval' sin cobro alguno. Calculando now+1mes ahi, el
    // vencimiento se corria un mes gratis en cada cambio de plan (y quedaba
    // desincronizado de pending_plan_effective_at). next_payment_date no se mueve
    // con el PUT y avanza solo cuando hay cobro real, asi que es la fuente de verdad.
    const mpNextPayment = next_payment_date ? new Date(next_payment_date) : null;
    const nextPaymentValid = !!mpNextPayment && !isNaN(mpNextPayment.getTime());

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (nextPaymentValid) {
      periodEnd = mpNextPayment!;
      // El periodo vigente arranca donde terminaba el anterior; si no habia, hoy.
      periodStart = hasLivePeriod && previousEnd! <= periodEnd ? previousEnd! : now;
    } else if (topic === "subscription_authorized_payment" || !hasLivePeriod) {
      // Fallback: MP no informo la fecha. Solo se recalcula si hubo cobro o si no
      // hay periodo vigente que preservar (alta / reactivacion tras el vencimiento).
      periodStart = hasLivePeriod ? previousEnd! : now;
      periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    // Si no hay fecha de MP, no hubo cobro y el periodo sigue vigente: no se toca.

    const updateData: Record<string, unknown> = {
      mercadopago_payer_id: String(payer_id ?? ""),
      updated_at: now.toISOString(),
    };

    // `status` solo se escribe cuando MercadoPago informo algo que sabemos
    // interpretar. Con `null` (ej: "pending") la fila conserva el estado que ya
    // tenia: un checkout recien creado no puede degradar una suscripcion activa.
    if (internalStatus !== null) {
      updateData.status = internalStatus;
    }

    if (internalStatus === "active") {
      // Con un downgrade programado NO se toca plan_id: el preapproval es el mismo
      // (solo se le bajo el monto), asi que external_reference sigue apuntando al plan
      // caro y fijarlo aca revertiria el downgrade en cada cobro. El plan lo cambia
      // apply_pending_plan_changes() cuando vence el periodo pagado.
      if (!hasPendingChange) {
        updateData.plan_id = planId;                    // garantiza el plan elegido
      }
      if (periodStart && periodEnd) {
        updateData.current_period_start = periodStart.toISOString();
        updateData.current_period_end = periodEnd.toISOString();
      }
      updateData.trial_ends_at = now.toISOString();     // finaliza el trial al activar el plan
      updateData.cancelled_at = null;
    } else if (internalStatus === "cancelled") {
      updateData.cancelled_at = now.toISOString();
    }

    // `.select()` es lo que hace que PostgREST devuelva las filas afectadas. Sin
    // el, un UPDATE que no matchea NADA es indistinguible de uno exitoso:
    // `updateError` viene en null y la funcion contestaba 200 tan campante.
    //
    // Ese caso es real y tiene plata adentro: el filtro es por
    // `mercadopago_sub_id`, y hasta que `create-checkout` no persiste ese id el
    // webhook no encuentra a nadie. El cobro entraba y la suscripcion no se
    // activaba nunca, sin forma de reprocesar porque la clave ya estaba tomada.
    const { data: updatedRows, error: updateError } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("mercadopago_sub_id", preapprovalId)
      .select("id");

    if (updateError || !updatedRows?.length) {
      console.error(
        "mp-webhook: no se pudo aplicar el evento; se libera la clave y se pide reintento.",
        {
          preapprovalId,
          eventKey,
          detail: updateError?.message ?? "el UPDATE no afecto ninguna fila",
        },
      );
      await releaseIdempotencyKey();
      // 5xx a proposito: es lo unico que hace que MercadoPago reintente. Para
      // cuando llegue el reintento, `create-checkout` ya persistio el id.
      return new Response("Retry", { status: 500 });
    }

    // Si quedo activa, sincronizar feature_permissions segun el plan.
    //
    // Con un downgrade programado las permissions son las del plan caro y deben
    // quedarse asi hasta el vencimiento. El cobro es ademas el momento natural para
    // aplicar un cambio ya vencido, sin esperar al cron diario.
    if (internalStatus === "active" && hasPendingChange) {
      const { error: applyError } = await supabase.rpc("apply_pending_plan_changes");
      if (applyError) {
        console.error("Error aplicando cambios de plan pendientes:", applyError.message);
      }
    } else if (internalStatus === "active") {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name, feature_keys")
        .eq("id", planId)
        .single();

      const enabledFeatures: string[] = (plan as any)?.feature_keys ?? [];

      const { error: permError } = await supabase
        .from("feature_permissions")
        .upsert(
          buildPermissionRows(userId, enabledFeatures, now.toISOString()),
          { onConflict: "user_id,feature_key" }
        );

      if (permError) {
        console.error("Error upserting feature_permissions:", permError.message);
      }
    }

    // Marcar como procesado SOLO la fila que inserto este request, y guardar el
    // estado REAL de MercadoPago. Filtrar por `mp_resource_id` alcanzaba tambien
    // a los fallos que registra `create-checkout` bajo ese mismo id.
    if (eventRow?.id) {
      const { error: closeError } = await supabase
        .from("payment_events")
        .update({ processed: true, user_id: userId, mp_status: mpStatus })
        .eq("id", eventRow.id);
      if (closeError) {
        console.error("mp-webhook: no se pudo cerrar el evento:", closeError.message);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("mp-webhook error:", err.message);
    return new Response("Internal Server Error", { status: 500 });
  }
});
