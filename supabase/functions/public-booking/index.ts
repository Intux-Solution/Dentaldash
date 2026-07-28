import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { notifyAppointmentCreated } from "../_shared/appointment-notifications.ts";
import { getAccessTokenForUser, getBusyIntervals } from "../_shared/google-calendar.ts";

// Allowlist de origenes permitidos (CORS). Se configura via APP_URL (coma-separada).
// Origen de produccion conocido + los configurados en APP_URL (con/sin www, etc.)
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
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Validacion server-side de la reserva publica (no confiar solo en el front).
const CreateAppointmentSchema = z.object({
  user_id: z.string().uuid(),
  nombre: z.string().trim().min(2).max(120),
  dni: z.string().trim().min(7).max(15),
  telefono: z.string().trim().min(6).max(30),
  email: z.string().max(150).optional().nullable(),
  obra_social: z.string().max(120).optional().nullable(),
  appointment_type: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  duration: z.coerce.number().int().min(5).max(480).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// Rate limiting (basado en DB) para el endpoint publico sin auth.
const RL_IP_MAX_PER_HOUR = 5;
const RL_IP_MAX_PER_DAY = 8;
const RL_MAX_PENDING_PER_PATIENT = 3;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SLOT_INTERVAL_MINUTES = 30;
// Argentina is UTC-3
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

function toARDate(date: Date): Date {
  return new Date(date.getTime() + AR_OFFSET_MS);
}

function formatTimeAR(date: Date): string {
  const ar = toARDate(date);
  const h = ar.getUTCHours().toString().padStart(2, "0");
  const m = ar.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function addMinutes(date: Date, mins: number): Date {
  return new Date(date.getTime() + mins * 60 * 1000);
}

// Sincroniza un turno recien creado con el Google Calendar del dentista.
// Best-effort: cualquier fallo se loguea pero no interrumpe la reserva.
async function syncToGoogleCalendar(
  supabase: any,
  params: {
    userId: string;
    appointmentId: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    attendeeEmail?: string | null;
  },
): Promise<void> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return;

  // El dentista debe tener Google Calendar conectado
  const { data: profile } = await supabase
    .from("profiles")
    .select("google_refresh_token")
    .eq("id", params.userId)
    .single();

  const refreshToken = profile?.google_refresh_token;
  if (!refreshToken) return;

  // Refrescar el access token (mismo patron que chat-webhook)
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!tokenRes.ok) {
    console.error("public-booking: failed to refresh Google token", await tokenRes.text());
    return;
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) return;

  const event = {
    summary: params.title,
    description: params.description || "",
    start: { dateTime: params.startTime, timeZone: "America/Argentina/Buenos_Aires" },
    end: { dateTime: params.endTime, timeZone: "America/Argentina/Buenos_Aires" },
    attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : [],
  };

  const eventRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );

  if (!eventRes.ok) {
    console.error("public-booking: failed to create Google Calendar event", await eventRes.text());
    return;
  }

  const gcalEvent = await eventRes.json();
  if (gcalEvent?.id) {
    await supabase
      .from("appointments")
      .update({ google_event_id: gcalEvent.id })
      .eq("id", params.appointmentId);
  }
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  const jsonErr = (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonErr("Missing Supabase configuration.", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    // ── check_slug ──────────────────────────────────────────────────────────
    if (action === "check_slug") {
      const { slug, user_id } = body;
      if (!slug) return jsonErr("Missing slug.", 400);

      let query = supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("booking_slug", String(slug).toLowerCase().trim());

      if (user_id) {
        query = query.neq("id", user_id);
      }

      const { count, error } = await query;
      if (error) throw error;
      return json({ available: (count ?? 0) === 0 });
    }

    // ── resolve_slug ────────────────────────────────────────────────────────
    if (action === "resolve_slug") {
      const { slug } = body;
      if (!slug) return jsonErr("Missing slug.", 400);

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("booking_slug", slug.toLowerCase().trim())
        .single();

      if (error || !data) return jsonErr("Dentista no encontrado.", 404);
      return json({ user_id: data.id });
    }

    // ── get_profile ─────────────────────────────────────────────────────────
    if (action === "get_profile") {
      const { user_id } = body;
      if (!user_id) return jsonErr("Missing user_id.", 400);

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, business_name, avatar_url, services, accepted_insurances, booking_slug")
        .eq("id", user_id)
        .single();

      if (error || !data) return jsonErr("Perfil no encontrado.", 404);

      // `profiles.avatar_url` guarda un nombre de archivo del bucket `avatars`
      // (público) o, en cuentas creadas con Google OAuth, una URL absoluta.
      const rawAvatar = (data.avatar_url ?? "").trim();
      const avatar_url = !rawAvatar
        ? null
        : /^https?:\/\//i.test(rawAvatar)
          ? rawAvatar
          : supabase.storage.from("avatars").getPublicUrl(rawAvatar).data.publicUrl;

      return json({ ...data, avatar_url });
    }

    // ── get_working_days ────────────────────────────────────────────────────
    if (action === "get_working_days") {
      const { user_id } = body;
      if (!user_id) return jsonErr("Missing user_id.", 400);

      const { data, error } = await supabase
        .from("schedules")
        .select("day_of_week")
        .eq("user_id", user_id)
        .eq("is_active", true);

      if (error) throw error;
      const days = [...new Set((data ?? []).map((r: any) => r.day_of_week))].sort();
      return json(days);
    }

    // ── get_slots ───────────────────────────────────────────────────────────
    if (action === "get_slots") {
      const { user_id, date, duration } = body;
      if (!user_id || !date || !duration) return jsonErr("Missing user_id, date or duration.", 400);

      const durationMins = Number(duration);
      const [yStr, mStr, dStr] = (date as string).split("-").map(Number);

      // Build local Argentina midnight for that date, then adjust to UTC
      // We use noon to avoid DST edge cases
      const localNoon = new Date(Date.UTC(yStr, mStr - 1, dStr, 12, 0, 0) - AR_OFFSET_MS);
      const dayOfWeek = toARDate(localNoon).getUTCDay();

      // Get active schedules for this day
      const { data: schedules, error: schedErr } = await supabase
        .from("schedules")
        .select("start_time, end_time")
        .eq("user_id", user_id)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true);

      if (schedErr) throw schedErr;
      if (!schedules || schedules.length === 0) return json([]);

      // Day bounds (Argentina local midnight -> UTC)
      const localMidnight = new Date(Date.UTC(yStr, mStr - 1, dStr, 0, 0, 0) - AR_OFFSET_MS);
      const dayStart = localMidnight;
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      // Existing appointments
      const { data: existing, error: apptErr } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("user_id", user_id)
        .neq("status", "cancelled")
        .gte("start_time", dayStart.toISOString())
        .lt("start_time", dayEnd.toISOString());

      if (apptErr) throw apptErr;

      // Restar también lo ocupado en el Google Calendar del dentista (mismo patrón
      // que chat-webhook, reusando el módulo compartido en vez de reimplementar el
      // refresh de token). Best-effort: si falla, no bloquea la respuesta.
      let googleBusy: { start: string; end: string }[] = [];
      const tokenResult = await getAccessTokenForUser(supabase, user_id);
      if ("token" in tokenResult) {
        const busyResult = await getBusyIntervals(tokenResult.token, dayStart.toISOString(), dayEnd.toISOString());
        if ("busy" in busyResult) {
          googleBusy = busyResult.busy;
        } else {
          console.warn("public-booking get_slots: no se pudo leer Google Calendar", busyResult.detail);
        }
      }

      const nowTime = new Date();
      const minTime = addMinutes(nowTime, 30);
      const slots: string[] = [];

      for (const sched of schedules as any[]) {
        const [sH, sM] = sched.start_time.split(":").map(Number);
        const [eH, eM] = sched.end_time.split(":").map(Number);

        // rangeStart and rangeEnd in UTC (local Argentina time)
        const rangeStart = new Date(Date.UTC(yStr, mStr - 1, dStr, sH, sM, 0) - AR_OFFSET_MS);
        const rangeEnd = new Date(Date.UTC(yStr, mStr - 1, dStr, eH, eM, 0) - AR_OFFSET_MS);

        let current = new Date(rangeStart);

        while (current < rangeEnd) {
          const slotStart = new Date(current);
          const slotEnd = addMinutes(slotStart, durationMins);

          // Slot must fit within schedule block
          if (slotEnd > rangeEnd) break;

          // Skip past slots (with 30 min buffer)
          if (slotStart < minTime) {
            current = addMinutes(current, SLOT_INTERVAL_MINUTES);
            continue;
          }

          // Check overlap with existing appointments
          const isOccupied = (existing ?? []).some((app: any) => {
            const aStart = new Date(app.start_time);
            const aEnd = new Date(app.end_time);
            return slotStart < aEnd && slotEnd > aStart;
          });

          const isOccupiedGoogle = googleBusy.some((b) => {
            const bStart = new Date(b.start);
            const bEnd = new Date(b.end);
            return slotStart < bEnd && slotEnd > bStart;
          });

          if (!isOccupied && !isOccupiedGoogle) {
            slots.push(formatTimeAR(slotStart));
          }

          current = addMinutes(current, SLOT_INTERVAL_MINUTES);
        }
      }

      return json([...new Set(slots)].sort());
    }

    // ── create_appointment ──────────────────────────────────────────────────
    if (action === "create_appointment") {
      // Validacion server-side robusta
      const parsed = CreateAppointmentSchema.safeParse(body);
      if (!parsed.success) {
        return jsonErr("Datos de reserva inválidos.", 400);
      }
      const {
        user_id, nombre, dni, telefono, email, obra_social,
        appointment_type, date, time, duration, notes,
      } = parsed.data;

      // Sanitize DNI
      const dniClean = String(dni).replace(/[.\-\s]/g, "");

      // ── Rate limiting por IP (basado en DB, resiste multiples isolates) ──
      const fwd = req.headers.get("x-forwarded-for") ?? "";
      const ip = fwd.split(",")[0].trim() || "unknown";
      const ipHash = await sha256Hex(ip);
      const nowMs = Date.now();
      const oneHourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

      const { count: hourCount } = await supabase
        .from("public_booking_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", oneHourAgo);
      if ((hourCount ?? 0) >= RL_IP_MAX_PER_HOUR) {
        return jsonErr("Demasiadas reservas desde esta conexión. Esperá un rato e intentá de nuevo.", 429);
      }

      const { count: dayCount } = await supabase
        .from("public_booking_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", oneDayAgo);
      if ((dayCount ?? 0) >= RL_IP_MAX_PER_DAY) {
        return jsonErr("Alcanzaste el límite de reservas por hoy.", 429);
      }

      // Registrar el intento (cuenta para el rate limit aunque la reserva luego falle)
      await supabase.from("public_booking_attempts").insert({
        ip_hash: ipHash, user_id, dni: dniClean,
      });

      // Find or create patient
      let patientId: string;
      const { data: existingPatient } = await supabase
        .from("patients")
        .select("id")
        .eq("dni", dniClean)
        .eq("user_id", user_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const { data: newPatient, error: patErr } = await supabase
          .from("patients")
          .insert({
            user_id,
            nombre,
            dni: dniClean,
            telefono,
            email: email || null,
            obra_social: obra_social || null,
            estado: "Activo",
          })
          .select("id")
          .single();

        if (patErr) throw patErr;
        patientId = newPatient.id;
      }

      // Limite de turnos pendientes futuros por paciente (anti-spam)
      const { count: pendingCount } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("patient_id", patientId)
        .eq("status", "pending")
        .gte("start_time", new Date().toISOString());
      if ((pendingCount ?? 0) >= RL_MAX_PENDING_PER_PATIENT) {
        return jsonErr("Ya tenés turnos pendientes con este consultorio. Contactalos para gestionarlos.", 429);
      }

      // Build start/end times from date + time strings (Argentina local)
      const [yStr, mStr, dStr] = (date as string).split("-").map(Number);
      const [tH, tM] = (time as string).split(":").map(Number);
      const durationMins = Number(duration ?? 30);

      const startTime = new Date(Date.UTC(yStr, mStr - 1, dStr, tH, tM, 0) - AR_OFFSET_MS);
      const endTime = addMinutes(startTime, durationMins);

      // Defensa en profundidad: revalidar que el horario caiga dentro de un bloque de
      // `schedules` activo. El front ya filtra esto vía get_slots, pero nada impide
      // invocar create_appointment directo con un horario arbitrario — el RPC solo
      // chequea overlap contra otros turnos, no horario laboral.
      const localNoonForDay = new Date(Date.UTC(yStr, mStr - 1, dStr, 12, 0, 0) - AR_OFFSET_MS);
      const dayOfWeek = toARDate(localNoonForDay).getUTCDay();

      const { data: daySchedules, error: schedErr2 } = await supabase
        .from("schedules")
        .select("start_time, end_time")
        .eq("user_id", user_id)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true);

      if (schedErr2) throw schedErr2;

      const fitsSchedule = (daySchedules ?? []).some((sched: any) => {
        const [sH, sM] = sched.start_time.split(":").map(Number);
        const [eH, eM] = sched.end_time.split(":").map(Number);
        const rangeStart = new Date(Date.UTC(yStr, mStr - 1, dStr, sH, sM, 0) - AR_OFFSET_MS);
        const rangeEnd = new Date(Date.UTC(yStr, mStr - 1, dStr, eH, eM, 0) - AR_OFFSET_MS);
        return startTime >= rangeStart && endTime <= rangeEnd;
      });

      if (!fitsSchedule) {
        return jsonErr("El horario solicitado está fuera del horario de atención.", 400);
      }

      // Call the public RPC
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "confirm_public_appointment_safe",
        {
          p_user_id: user_id,
          p_patient_id: patientId,
          p_title: `${appointment_type} - ${nombre}`,
          p_start_time: startTime.toISOString(),
          p_end_time: endTime.toISOString(),
          p_duration: durationMins,
          p_appointment_type: appointment_type,
          p_notes: notes || null,
          p_status: "pending",
        }
      );

      if (rpcErr) throw rpcErr;

      const result = rpcResult as any;
      if (!result?.success) {
        return jsonErr(result?.error ?? "El horario ya está ocupado.", 409);
      }

      // Sincronizar con el Google Calendar del dentista (best-effort)
      try {
        await syncToGoogleCalendar(supabase, {
          userId: user_id,
          appointmentId: result.id,
          title: `${appointment_type} - ${nombre}`,
          description: notes || null,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attendeeEmail: email || null,
        });
      } catch (e) {
        console.warn("public-booking: Google Calendar sync failed", e);
      }

      // Avisar por email al paciente y al dentista. Hasta ahora una reserva desde el
      // link publico no notificaba a nadie. No bloquea la respuesta ni puede fallarla.
      await notifyAppointmentCreated(supabase, result.id);

      return json({ ok: true, appointment_id: result.id });
    }

    return jsonErr(`Unknown action: ${action}`, 400);
  } catch (err: any) {
    console.error("public-booking error:", err?.message ?? err);
    return jsonErr("Error interno del servidor.", 500);
  }
});
