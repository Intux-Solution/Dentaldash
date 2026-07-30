import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

import { buildCors } from "../_shared/cors.ts";

const MP_API = "https://api.mercadopago.com";
// Sin timeout, una llamada colgada a MercadoPago agota el wall time de la Edge
// Function y el usuario recibe un 546 del gateway en vez de un error nuestro.
const MP_TIMEOUT_MS = 15_000;

interface MpResult {
  ok: boolean;
  httpStatus?: number;
  body?: string;
  detail?: string;
  /** El request nunca llego a MercadoPago (DNS, timeout, TLS). */
  networkError?: boolean;
}

// Unico punto de salida hacia MercadoPago. Nunca lanza: un fallo de red devuelve
// networkError en vez de reventar en el catch global, donde seria indistinguible
// de un error de Supabase y saldria como 500 "Error interno del servidor.".
async function mpFetch(url: string, init: RequestInit): Promise<MpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.text();
    if (res.ok) return { ok: true, httpStatus: res.status, body };
    return { ok: false, httpStatus: res.status, body, detail: body };
  } catch (err: any) {
    return { ok: false, networkError: true, detail: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

interface PreapprovalState {
  /** true = pudimos determinar el estado (incluye el 404). */
  ok: boolean;
  status?: string | null;
  /** El preapproval no existe en MercadoPago. */
  missing?: boolean;
  detail?: string;
  networkError?: boolean;
}

// Estados sobre los que MercadoPago rechaza cualquier modificacion con
// 400 "You can not modify a cancelled preapproval."
const DEAD_PREAPPROVAL_STATUSES = new Set(["cancelled", "finished"]);

// Consulta el estado del preapproval. Se llama ANTES de cualquier PUT: modificar
// uno cancelado es un 400 seguro, y hasta ahora ese 400 salia como 502 opaco.
async function getPreapproval(token: string, preapprovalId: string): Promise<PreapprovalState> {
  const res = await mpFetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    try {
      const parsed = JSON.parse(res.body ?? "{}");
      return { ok: true, status: typeof parsed?.status === "string" ? parsed.status : null };
    } catch {
      return { ok: true, status: null };
    }
  }
  // Un preapproval borrado o de otra cuenta es tan inservible como uno cancelado.
  if (res.httpStatus === 404) return { ok: true, status: null, missing: true };
  return { ok: false, detail: res.detail, networkError: res.networkError };
}

function isPreapprovalDead(state: PreapprovalState): boolean {
  if (state.missing) return true;
  return typeof state.status === "string" &&
    DEAD_PREAPPROVAL_STATUSES.has(state.status.toLowerCase());
}

// Red de seguridad para la carrera: el preapproval puede cancelarse entre el GET
// y el PUT (o desde el panel de MercadoPago mientras corre este request).
function isCancelledPreapprovalError(detail: string | undefined): boolean {
  if (!detail) return false;
  return /can\s*not\s+modify\s+a\s+cancell?ed\s+preapproval/i.test(detail);
}

// Actualiza el monto de la cuota de un preapproval ya autorizado.
// La cuota del periodo en curso ya se cobro, asi que MercadoPago aplica el
// monto nuevo recien en la proxima fecha de recurrencia.
function updatePreapprovalAmount(
  token: string,
  preapprovalId: string,
  amount: number,
  currency: string,
): Promise<MpResult> {
  return mpFetch(`${MP_API}/preapproval/${preapprovalId}`, {
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
}

// Cancela un preapproval en MercadoPago. Devuelve el detalle del error si falla.
function cancelPreapproval(token: string, preapprovalId: string): Promise<MpResult> {
  return mpFetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
}

// Deja rastro en payment_events de una operacion que MercadoPago rechazo.
// Sin esto el motivo del rechazo solo vive en console.error, que no es consultable
// por SQL: el usuario ve un 502 opaco y no hay forma de saber que paso.
async function logMpFailure(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  userId: string,
  preapprovalId: string | null,
  detail: string,
): Promise<void> {
  const { error } = await supabase.from("payment_events").insert({
    event_type: eventType,
    mp_resource_id: preapprovalId,
    user_id: userId,
    payload: { detail },
    processed: false,
  });
  if (error) console.error(`No se pudo registrar ${eventType}:`, error.message);
}

// Deja rastro de un preapproval que quedo activo en MercadoPago sin poder cancelarse.
// Sin esto el doble cobro es invisible hasta que el usuario reclama.
function logOrphanPreapproval(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  preapprovalId: string,
  detail: string,
): Promise<void> {
  return logMpFailure(supabase, "preapproval_cancel_failed", userId, preapprovalId, detail);
}

// Extrae el motivo legible del cuerpo de error de MercadoPago para mostrarselo al
// usuario. El payload crudo (que puede incluir ids internos y el detalle del request)
// queda solo en payment_events, no viaja al navegador.
function mpErrorMessage(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  try {
    const parsed = JSON.parse(detail);
    const cause = Array.isArray(parsed?.cause) ? parsed.cause[0] : null;
    const message = parsed?.message ?? cause?.description ?? cause?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 200);
  } catch {
    // MercadoPago no siempre responde JSON (ej: un HTML de su gateway).
  }
  // Sin un mensaje reconocible no se devuelve el payload crudo: puede traer HTML
  // del gateway o ids internos. El detalle completo queda en payment_events.
  return "MercadoPago rechazó la operación.";
}

// Respuesta de error unificada para cualquier fallo de MercadoPago: distingue el
// corte de comunicacion (no sabemos que paso del otro lado) del rechazo explicito.
// El front arma el mensaje como "<error> — <detail>" (SubscriptionService.ts).
function mpFailureResponse(
  jsonHeaders: Record<string, string>,
  message: string,
  result: { detail?: string; networkError?: boolean },
): Response {
  const body = result.networkError
    ? { error: "No pudimos comunicarnos con MercadoPago. Intentá de nuevo en unos minutos." }
    : { error: message, detail: mpErrorMessage(result.detail) };
  return new Response(JSON.stringify(body), { status: 502, headers: jsonHeaders });
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

    // Estado del preapproval actual en MercadoPago, consultado a lo sumo una vez
    // por request (solo hay un mercadopago_sub_id por usuario).
    let cachedState: PreapprovalState | null = null;
    const readPreapprovalState = async (preapprovalId: string): Promise<PreapprovalState> => {
      if (!cachedState) cachedState = await getPreapproval(MP_ACCESS_TOKEN, preapprovalId);
      return cachedState;
    };

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
      // Si el preapproval ya no cobra, no hay monto que restaurar: se limpia el
      // cambio programado igual, para no dejar al usuario sin poder revertirlo.
      let restoreSkipped = false;
      if (existingSub.mercadopago_sub_id) {
        const state = await readPreapprovalState(existingSub.mercadopago_sub_id);
        if (!state.ok) {
          console.error("MercadoPago preapproval lookup error:", state.detail);
          return mpFailureResponse(
            jsonHeaders,
            "No pudimos verificar tu suscripción en MercadoPago. Intentá de nuevo en unos minutos.",
            state,
          );
        }

        if (isPreapprovalDead(state)) {
          restoreSkipped = true;
          await logMpFailure(
            supabase,
            "preapproval_dead_on_change",
            user.id,
            existingSub.mercadopago_sub_id,
            `cancel_scheduled_change sobre un preapproval ${state.missing ? "inexistente" : state.status}`,
          );
        } else {
          const restore = await updatePreapprovalAmount(
            MP_ACCESS_TOKEN,
            existingSub.mercadopago_sub_id,
            Number(currentPlan.price_monthly),
            currentPlan.currency ?? "ARS",
          );
          if (!restore.ok) {
            // El preapproval se cancelo entre el GET y el PUT: mismo caso que arriba.
            if (isCancelledPreapprovalError(restore.detail)) {
              restoreSkipped = true;
              await logMpFailure(
                supabase,
                "preapproval_dead_on_change",
                user.id,
                existingSub.mercadopago_sub_id,
                restore.detail ?? "",
              );
            } else {
              console.error("MercadoPago restore amount error:", restore.detail);
              await logMpFailure(
                supabase,
                "preapproval_restore_failed",
                user.id,
                existingSub.mercadopago_sub_id,
                restore.detail ?? "",
              );
              return mpFailureResponse(
                jsonHeaders,
                "No se pudo restaurar el monto en MercadoPago.",
                restore,
              );
            }
          }
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
        JSON.stringify({
          cancelled: true,
          warning: restoreSkipped
            ? "Tu suscripción ya no está activa en MercadoPago. Se canceló el cambio programado, pero vas a tener que contratar un plan de nuevo."
            : undefined,
        }),
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
        const state = await readPreapprovalState(existingSub.mercadopago_sub_id);
        if (!state.ok) {
          console.error("MercadoPago preapproval lookup error:", state.detail);
          return mpFailureResponse(
            jsonHeaders,
            "No pudimos verificar tu suscripción en MercadoPago. Intentá de nuevo en unos minutos.",
            state,
          );
        }

        // Un preapproval ya cancelado hace que el PUT devuelva 400 y dejaba al
        // usuario sin poder cancelar nunca. La cancelacion es idempotente: si ya
        // no cobra, el objetivo esta cumplido y solo falta marcar la fila.
        if (!isPreapprovalDead(state)) {
          const cancelled = await cancelPreapproval(
            MP_ACCESS_TOKEN,
            existingSub.mercadopago_sub_id,
          );
          if (!cancelled.ok && !isCancelledPreapprovalError(cancelled.detail)) {
            console.error("MercadoPago cancel subscription error:", cancelled.detail);
            await logOrphanPreapproval(
              supabase,
              user.id,
              existingSub.mercadopago_sub_id,
              cancelled.detail ?? "",
            );
            return mpFailureResponse(
              jsonHeaders,
              "No se pudo cancelar el cobro automático en MercadoPago. Intentá de nuevo en unos minutos.",
              cancelled,
            );
          }
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

    // ── Downgrade: sin cobro nuevo, efectivo al vencer el periodo pagado ─────
    // Solo aplica si hay una suscripcion activa en MercadoPago con periodo
    // vigente y el plan destino es mas barato que el actual.
    const periodEndsAt = existingSub?.current_period_end
      ? new Date(existingSub.current_period_end)
      : null;

    // Candidato a downgrade segun la DB. Falta confirmar contra MercadoPago que
    // el preapproval sigue vivo: programar una baja de monto sobre uno cancelado
    // es el 400 "You can not modify a cancelled preapproval.".
    const isDowngradeCandidate =
      existingSub?.status === "active" &&
      !!existingSub.mercadopago_sub_id &&
      !!currentPlan &&
      !!periodEndsAt &&
      periodEndsAt.getTime() > Date.now() &&
      Number(plan.price_monthly) < Number(currentPlan.price_monthly);

    // Un preapproval cancelado/inexistente ya no cobra: no hay nada que reprogramar
    // y el camino correcto es contratar uno nuevo (rama de mas abajo).
    let deadPreapproval = false;
    if (existingSub?.mercadopago_sub_id) {
      const state = await readPreapprovalState(existingSub.mercadopago_sub_id);
      if (state.ok) {
        deadPreapproval = isPreapprovalDead(state);
        if (deadPreapproval) {
          console.warn(
            "Preapproval inutilizable, se contratara uno nuevo:",
            { preapproval: existingSub.mercadopago_sub_id, status: state.status ?? "missing" },
          );
          // La DB puede seguir diciendo 'active' (webhook de cancelacion perdido).
          // No se toca el status aca: mp-webhook y el cron son la fuente de verdad,
          // y cortarle el acceso dentro del periodo pagado seria peor. Solo se audita.
          await logMpFailure(
            supabase,
            "preapproval_dead_on_change",
            user.id,
            existingSub.mercadopago_sub_id,
            `preapproval ${state.missing ? "inexistente" : state.status} al cambiar de plan`,
          );
        }
      } else if (isDowngradeCandidate) {
        // Ibamos a modificarlo y no sabemos en que estado esta: abortar sin tocar
        // la DB ni crear cobros nuevos.
        console.error("MercadoPago preapproval lookup error:", state.detail);
        return mpFailureResponse(
          jsonHeaders,
          "No pudimos verificar tu suscripción en MercadoPago. Intentá de nuevo en unos minutos.",
          state,
        );
      }
      // Si no es downgrade, un lookup fallido no bloquea: el unico uso pendiente
      // del preapproval viejo es cancelarlo, y eso ya es no fatal.
    }

    // Se chequea despues del lookup: si el preapproval murio, la fila puede seguir
    // en 'active' con este mismo plan y el usuario tiene que poder recontratarlo.
    if (existingSub?.status === "active" && existingSub.plan_id === plan_id && !deadPreapproval) {
      return new Response(
        JSON.stringify({ error: "Ya tenés este plan activo." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (isDowngradeCandidate && !deadPreapproval) {
      // Bajar el monto de las proximas cuotas. Fatal: si MP rechaza, no tocamos
      // la DB para no prometer un cambio que el cobro no va a respetar.
      const update = await updatePreapprovalAmount(
        MP_ACCESS_TOKEN,
        existingSub!.mercadopago_sub_id!,
        Number(plan.price_monthly),
        plan.currency ?? "ARS",
      );

      if (update.ok) {
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
            await logMpFailure(
              supabase,
              "preapproval_amount_rollback_failed",
              user.id,
              existingSub!.mercadopago_sub_id!,
              rollback.detail ?? "",
            );
          }
          return new Response(
            JSON.stringify({
              error: "No se pudo programar el cambio de plan. Volvé a intentarlo en unos minutos.",
              detail: rollback.ok
                ? undefined
                : "El monto quedó modificado en MercadoPago; ya avisamos al equipo.",
            }),
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

      if (isCancelledPreapprovalError(update.detail)) {
        // Carrera: se cancelo entre el GET y el PUT. Mismo desenlace que si lo
        // hubieramos visto muerto desde el principio: se contrata uno nuevo.
        console.warn("Preapproval cancelado durante el downgrade, se contratara uno nuevo.");
        deadPreapproval = true;
        await logMpFailure(
          supabase,
          "preapproval_dead_on_change",
          user.id,
          existingSub!.mercadopago_sub_id!,
          update.detail ?? "",
        );
      } else {
        console.error("MercadoPago downgrade error:", update.detail);
        await logMpFailure(
          supabase,
          "preapproval_downgrade_failed",
          user.id,
          existingSub!.mercadopago_sub_id!,
          update.detail ?? "",
        );
        return mpFailureResponse(
          jsonHeaders,
          "No se pudo programar el cambio de plan en MercadoPago.",
          update,
        );
      }
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

    const mpRes = await mpFetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(mpPayload),
    });

    if (!mpRes.ok) {
      console.error("MercadoPago error:", mpRes.detail);
      // Todavia no hay preapproval, asi que no hay mp_resource_id que registrar.
      await logMpFailure(supabase, "preapproval_create_failed", user.id, null, mpRes.detail ?? "");
      return mpFailureResponse(
        jsonHeaders,
        "No se pudo crear la suscripción en MercadoPago.",
        mpRes,
      );
    }

    let mpData: any;
    try {
      mpData = JSON.parse(mpRes.body ?? "{}");
    } catch {
      mpData = {};
    }
    const { id: mpSubId, init_point } = mpData;

    if (!mpSubId) {
      console.error("MercadoPago devolvio un preapproval sin id:", mpRes.body?.slice(0, 500));
      await logMpFailure(supabase, "preapproval_create_failed", user.id, null, mpRes.body ?? "");
      return new Response(
        JSON.stringify({
          error: "MercadoPago devolvió una respuesta inesperada. Intentá de nuevo en unos minutos.",
        }),
        { status: 502, headers: jsonHeaders }
      );
    }

    // Recien ahora cancelamos la preapproval anterior: si el POST de arriba
    // hubiera fallado, el usuario conserva la suscripcion que ya tenia.
    // Si ya sabemos que esta cancelada, el PUT seria un 400 seguro y ensuciaria
    // payment_events con un huerfano inexistente.
    if (
      existingSub?.mercadopago_sub_id &&
      existingSub.mercadopago_sub_id !== mpSubId &&
      !deadPreapproval
    ) {
      const cancelRes = await cancelPreapproval(
        MP_ACCESS_TOKEN,
        existingSub.mercadopago_sub_id,
      );
      if (!cancelRes.ok) {
        const detail = cancelRes.detail ?? "";
        console.warn("MercadoPago cancel warning (non-fatal):", detail);
        // No es fatal (el preapproval nuevo ya existe). Solo se registra si el viejo
        // pudo haber quedado cobrando: si el rechazo es "ya esta cancelado", no hay
        // doble cobro que auditar.
        if (!isCancelledPreapprovalError(detail)) {
          await logOrphanPreapproval(supabase, user.id, existingSub.mercadopago_sub_id, detail);
        }
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
