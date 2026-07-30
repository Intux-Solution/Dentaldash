import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";
import { notifyAppointmentCreated } from "../_shared/appointment-notifications.ts";
import { buildCors } from "../_shared/cors.ts";

// Notificacion por email de un turno creado desde la app del dentista.
//
// `public-booking` y `chat-webhook` llaman a notifyAppointmentCreated en proceso
// (ya tienen service role); esta funcion existe solo para el front, que no puede
// tener la API key de Resend ni leer `auth.users`.

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

    const { appointment_id } = await req.json();
    if (!appointment_id) return json({ error: "Falta appointment_id." }, 400);

    // El turno tiene que ser del usuario que pide la notificacion: sin este filtro
    // cualquiera podria disparar mails sobre turnos ajenos.
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", appointment_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!appointment) return json({ error: "Turno no encontrado." }, 404);

    const result = await notifyAppointmentCreated(supabase, appointment_id);
    return json({ ok: true, ...result });
  } catch (err: any) {
    console.error("notify-appointment error:", err?.message ?? err);
    return json({ error: "Error interno del servidor." }, 500);
  }
});
