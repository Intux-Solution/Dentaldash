import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
      return json(data);
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

          if (!isOccupied) {
            slots.push(formatTimeAR(slotStart));
          }

          current = addMinutes(current, SLOT_INTERVAL_MINUTES);
        }
      }

      return json([...new Set(slots)].sort());
    }

    // ── create_appointment ──────────────────────────────────────────────────
    if (action === "create_appointment") {
      const {
        user_id, nombre, dni, telefono, email, obra_social,
        appointment_type, date, time, duration, notes,
      } = body;

      if (!user_id || !nombre || !dni || !telefono || !appointment_type || !date || !time) {
        return jsonErr("Faltan datos obligatorios.", 400);
      }

      // Sanitize DNI
      const dniClean = String(dni).replace(/[.\-\s]/g, "");

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

      // Build start/end times from date + time strings (Argentina local)
      const [yStr, mStr, dStr] = (date as string).split("-").map(Number);
      const [tH, tM] = (time as string).split(":").map(Number);
      const durationMins = Number(duration ?? 30);

      const startTime = new Date(Date.UTC(yStr, mStr - 1, dStr, tH, tM, 0) - AR_OFFSET_MS);
      const endTime = addMinutes(startTime, durationMins);

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

      return json({ ok: true, appointment_id: result.id });
    }

    return jsonErr(`Unknown action: ${action}`, 400);
  } catch (err: any) {
    console.error("public-booking error:", err.message);
    return jsonErr(err.message ?? "Internal error", 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
