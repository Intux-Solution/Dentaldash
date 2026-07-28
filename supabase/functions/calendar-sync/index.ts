import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getAccessTokenForUser,
  getBusyIntervals,
  updateCalendarEvent,
} from "../_shared/google-calendar.ts";

// Sincronizacion de Google Calendar para la app autenticada.
//
// Existe porque hacerlo desde el browser fallaba en silencio: dependia del
// `provider_token` de la sesion (efimero) y devolvia null ante cualquier error, con lo
// cual el turno quedaba sin `google_event_id` y las reuniones de Google no bloqueaban
// horarios. Aca se usa el `google_refresh_token` guardado en `profiles`, igual que
// `public-booking` y `chat-webhook`, que si funcionan.
//
// Acciones:
//   push_appointment  { appointment_id, description?, attendee_email? }
//   delete_event      { google_event_id }
//   busy              { time_min, time_max }

const ALLOWED_ORIGINS = [
  "https://dashboard.dentaldash.cloud",
  ...(Deno.env.get("APP_URL") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")),
].filter(Boolean);

function buildCors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: jsonHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Missing Supabase configuration." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = authHeader.replace(/^Bearer\s+/, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized / Invalid Token." }, 401);

    const body = await req.json();
    const action: string = body?.action ?? "push_appointment";

    const tokenResult = await getAccessTokenForUser(supabase, user.id);
    if ("error" in tokenResult) {
      // `not_connected` no es un fallo: el usuario simplemente no uso la integracion.
      // Se responde 200 para que el front lo distinga de un error real y no alarme.
      const status = tokenResult.error === "not_connected" || tokenResult.error === "not_configured"
        ? 200
        : 502;
      if (status === 502) {
        console.error("calendar-sync: no se pudo obtener access token", tokenResult.detail);
      }
      return json({ synced: false, reason: tokenResult.error }, status);
    }

    const accessToken = tokenResult.token;

    // ── Franjas ocupadas (para el calculo de horarios disponibles) ────────────
    if (action === "busy") {
      const { time_min, time_max } = body;
      if (!time_min || !time_max) {
        return json({ error: "Faltan time_min / time_max." }, 400);
      }

      const result = await getBusyIntervals(accessToken, time_min, time_max);
      if ("error" in result) {
        console.error("calendar-sync busy error:", result.detail);
        return json({ synced: false, reason: result.error }, 502);
      }
      return json({ synced: true, busy: result.busy });
    }

    // ── Borrar un evento ──────────────────────────────────────────────────────
    if (action === "delete_event") {
      const { google_event_id } = body;
      if (!google_event_id) return json({ error: "Falta google_event_id." }, 400);

      const result = await deleteCalendarEvent(accessToken, google_event_id);
      if ("error" in result) {
        console.error("calendar-sync delete error:", result.detail);
        return json({ synced: false, reason: result.error }, 502);
      }
      return json({ synced: true });
    }

    // ── Crear o actualizar el evento de un turno ──────────────────────────────
    if (action === "push_appointment") {
      const { appointment_id, description, attendee_email } = body;
      if (!appointment_id) return json({ error: "Falta appointment_id." }, 400);

      // El turno se lee de la DB filtrando por user_id: el cliente no puede empujar
      // a Google un evento sobre un turno que no le pertenece.
      const { data: appointment, error: apptError } = await supabase
        .from("appointments")
        .select("id, title, start_time, end_time, notes, google_event_id")
        .eq("id", appointment_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (apptError) {
        console.error("calendar-sync: error leyendo el turno", apptError.message);
        return json({ error: "No se pudo leer el turno." }, 500);
      }
      if (!appointment) return json({ error: "Turno no encontrado." }, 404);

      const event = {
        title: appointment.title,
        description: description ?? appointment.notes ?? "",
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        attendeeEmail: attendee_email ?? null,
      };

      if (appointment.google_event_id) {
        const updated = await updateCalendarEvent(
          accessToken,
          appointment.google_event_id,
          event,
        );
        if ("error" in updated) {
          console.error("calendar-sync update error:", updated.detail);
          return json({ synced: false, reason: updated.error }, 502);
        }
        return json({ synced: true, google_event_id: appointment.google_event_id });
      }

      const created = await createCalendarEvent(accessToken, event);
      if ("error" in created) {
        console.error("calendar-sync create error:", created.detail);
        return json({ synced: false, reason: created.error }, 502);
      }

      const { error: persistError } = await supabase
        .from("appointments")
        .update({ google_event_id: created.id })
        .eq("id", appointment.id)
        .eq("user_id", user.id);

      if (persistError) {
        console.error("calendar-sync: evento creado sin persistir el id", persistError.message);
      }

      return json({ synced: true, google_event_id: created.id });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (err: any) {
    console.error("calendar-sync error:", err?.message ?? err);
    return json({ error: "Error interno del servidor." }, 500);
  }
});
