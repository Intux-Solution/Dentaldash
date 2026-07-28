
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.0"
import OpenAI from "https://esm.sh/openai"
import { notifyAppointmentCreated } from "../_shared/appointment-notifications.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sanitizeUrl = (url: string) => {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "").replace(/\/manager$/, "");
};

// Helper: Format phone number (remove 549 prefix for Argentina)
const sanitizePhone = (jid: string) => {
    let phone = jid.replace('@s.whatsapp.net', '').replace('@lid', ''); // Handle both standard and LID
    if (phone.startsWith('549')) {
        phone = phone.substring(3); // Remove '549' to match DB '381...'
    }
    return phone;
};

// ─── Timezone helpers (Argentina, UTC-3, sin DST) ───────────────────────────
// Mismo patrón que supabase/functions/public-booking/index.ts: toda la aritmética
// de fechas ocurre en dominio UTC explícito, independiente del TZ local del runtime.
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
// ─────────────────────────────────────────────────────────────────────────────

// ─── Rate Limiting ───────────────────────────────────────────────────────────
// Map<jid, { count, windowStart }>  (module-level, persiste dentro del mismo isolate)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;          // máx mensajes por ventana
const RATE_LIMIT_WINDOW_MS = 60_000; // ventana de 1 minuto

function isRateLimited(jid: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(jid);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(jid, { count: 1, windowStart: now });
        return false;
    }
    entry.count += 1;
    return entry.count > RATE_LIMIT_MAX;
}
// ─────────────────────────────────────────────────────────────────────────────

// Tool definitions for Function Calling
const toolsDefinition = [
    {
        name: "get_available_slots",
        description: "Consulta los turnos disponibles para una fecha específica. Verifica horarios de atención y turnos ocupados.",
        parameters: {
            type: "object",
            properties: {
                date: { type: "string", description: "La fecha a consultar (formato YYYY-MM-DD)" }
            },
            required: ["date"]
        }
    },
    {
        name: "create_appointment",
        description: "Agenda un nuevo turno. Si el paciente no existe, solicita datos para crearlo.",
        parameters: {
            type: "object",
            properties: {
                date: { type: "string", description: "Fecha del turno (YYYY-MM-DD)" },
                time: { type: "string", description: "Hora del turno (HH:mm)" },
                appointment_type: { type: "string", description: "Servicio o tratamiento agendado (ej. Limpieza, Consulta General). Usa la descripción exacta de los Servicios." },
                patient_name: { type: "string", description: "Nombre completo del paciente" },
                dni: { type: "string", description: "DNI del paciente (sin puntos)" },
                telefono: { type: "string", description: "Teléfono del paciente (si es diferente al de WhatsApp)" },
                obra_social: { type: "string", description: "Obra social del paciente (o 'Particular')" },
                email: { type: "string", description: "Email del paciente (opcional)" },
                notes: { type: "string", description: "Motivo de la consulta o notas adicionales" }
            },
            required: ["date", "time", "appointment_type", "patient_name", "dni", "obra_social", "telefono"]
        }
    }
];

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    // ── Validación de secreto de webhook (opcional, si WEBHOOK_SECRET está configurado) ──
    const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')?.trim();
    if (WEBHOOK_SECRET) {
        const providedSecret = req.headers.get('x-webhook-secret');
        if (providedSecret !== WEBHOOK_SECRET) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response("Missing Supabase Config", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let payload: any = {};

    try {
        const bodyText = await req.text();
        if (!bodyText) return new Response('Empty body', { status: 200 });
        payload = JSON.parse(bodyText);

        // --- DEBUG LOGGING (Sanitized for Privacy, solo con DEBUG_LOGS=true) ---
        if (Deno.env.get('DEBUG_LOGS') === 'true') try {
            const sanitizedPayload = JSON.parse(JSON.stringify(payload)); // Deep clone

            // Redact Evolution API typical paths
            if (sanitizedPayload?.data?.messages?.[0]?.message?.conversation) {
                sanitizedPayload.data.messages[0].message.conversation = "[REDACTED PHI]";
            }
            if (sanitizedPayload?.data?.messages?.[0]?.key?.remoteJid) {
                sanitizedPayload.data.messages[0].key.remoteJid = "[REDACTED PHONE]";
            }
            // Add similar redaction for v2.3 single message
            if (sanitizedPayload?.data?.key?.remoteJid && sanitizedPayload?.data?.message) {
                sanitizedPayload.data.key.remoteJid = "[REDACTED PHONE]";
                if (sanitizedPayload.data.message.conversation) {
                    sanitizedPayload.data.message.conversation = "[REDACTED PHI]";
                }
            }

            // Always insert the sanitized version instead of the raw payload
            await supabase.from('debug_payloads').insert({
                function_name: 'chat-webhook-incoming',
                payload: sanitizedPayload
            });
        } catch (e) { console.error("Debug Log Fail", e); }
        // ---------------------------------------------

        const instanceName = payload.data?.instance || payload.instance;
        // console.log("Webhook Payload:", JSON.stringify(payload, null, 2));

        let messageObj = payload.data?.messages?.[0] || payload.messages?.[0];

        // Fallback for when data IS the message object (as seen in v2.3 logs)
        if (!messageObj && payload.data?.key && (payload.data?.message || payload.data?.messageType)) {
            console.log("Detected v2.3 single message payload format");
            messageObj = payload.data;
        }

        const remoteJid = messageObj?.key?.remoteJid;
        const messageId = messageObj?.key?.id;
        const messageText = messageObj?.message?.conversation ||
            messageObj?.message?.extendedTextMessage?.text ||
            messageObj?.message?.imageMessage?.caption ||
            messageObj?.message?.videoMessage?.caption;

        if (!instanceName || !messageText || !remoteJid) {
            return new Response('Missing essential data', { status: 200 });
        }

        if (messageObj?.key?.fromMe) return new Response('Skip self', { status: 200 });

        if (remoteJid && isRateLimited(remoteJid)) {
            console.warn(`[rate-limit] JID ${remoteJid} superó el límite. Ignorando.`);
            return new Response('Rate limit exceeded', { status: 429 });
        }

        const EVOLUTION_URL_RAW = Deno.env.get('EVOLUTION_API_URL')?.trim();
        const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY')?.trim();
        const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')?.trim();
        const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')?.trim();
        const AGENT_PROMPT = Deno.env.get('AGENT_SYSTEM_PROMPT')?.trim();

        if (!EVOLUTION_URL_RAW || !EVOLUTION_KEY) throw new Error("Missing Evolution Secrets");
        const EVOLUTION_API_URL = sanitizeUrl(EVOLUTION_URL_RAW);

        // --- Mark Message as Read (Blue Ticks) ---
        if (messageId) {
            fetch(`${EVOLUTION_API_URL}/chat/markMessageAsRead/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: JSON.stringify({
                    readMessages: [{ remoteJid: remoteJid, fromMe: false, id: messageId }]
                })
            }).catch(err => console.error("Error marking read:", err));
        }
        // -----------------------------------------

        // Fetch context (Profile/Tenant)
        const { data: tenant } = await supabase.from('profiles').select('*').eq('whatsapp_instance', instanceName).single();
        if (!tenant) throw new Error(`Profile not found for instance: ${instanceName}`);

        const processWebhookBackground = async () => {
            try {
                // ---------------------------------------------------------
                // MESSAGE BATCHING / DEBOUNCE LOGIC
                // ---------------------------------------------------------

                // 1. Insert incoming message as 'pending'
                const { data: insertedMsg, error: insertError } = await supabase.from('chat_history').insert({
                    tenant_id: tenant.id,
                    whatsapp_instance: instanceName,
                    jid: remoteJid,
                    role: 'user',
                    content: messageText,
                    status: 'pending' // New column
                }).select().single();

                if (insertError) throw new Error("Failed to insert message: " + insertError.message);

                console.log(`Msg ${insertedMsg.id} inserted. Waiting for debounce...`);

                // 2. Wait 3 seconds (Reducido para background deployment seguro)
                await new Promise(resolve => setTimeout(resolve, 3000));

                // 3. Check for newer pending messages from same User
                const { data: newerMessages } = await supabase
                    .from('chat_history')
                    .select('id')
                    .eq('jid', remoteJid)
                    .eq('whatsapp_instance', instanceName)
                    .eq('role', 'user')
                    .eq('status', 'pending')
                    .gt('created_at', insertedMsg.created_at) // Newer than current
                    .limit(1);

                if (newerMessages && newerMessages.length > 0) {
                    console.log(`Msg ${insertedMsg.id}: Newer messages detected. Exiting trace.`);
                    return; // background exit
                }

                // 4. If no newer messages, we are the designated handler.
                // Fetch ALL pending messages to combine
                const { data: pendingBatch } = await supabase
                    .from('chat_history')
                    .select('*')
                    .eq('jid', remoteJid)
                    .eq('whatsapp_instance', instanceName)
                    .eq('role', 'user')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true });

                if (!pendingBatch || pendingBatch.length === 0) {
                    console.log(`Msg ${insertedMsg.id}: No pending batch found (maybe processed by another thread?). Exiting.`);
                    return; // background exit
                }

                // Combine text
                const finalMessageText = pendingBatch.map((m: any) => m.content).join(' ');
                console.log(`Processing batch of ${pendingBatch.length} messages: "${finalMessageText}"`);

                // Mark all as processed immediately to prevent double-processing
                const batchIds = pendingBatch.map((m: any) => m.id);
                await supabase
                    .from('chat_history')
                    .update({ status: 'processed' })
                    .eq('whatsapp_instance', instanceName)
                    .in('id', batchIds);

                // ---------------------------------------------------------
                // Core Logic (Patient ID, Context, AI)
                // ---------------------------------------------------------

                // Identify Patient
                const cleanPhone = sanitizePhone(remoteJid);
                const { data: patientData } = await supabase
                    .from('patients')
                    .select('*')
                    .eq('telefono', cleanPhone)
                    .eq('user_id', tenant.id)
                    .maybeSingle(); // Changed from single() to avoid error on not found

                // Fetch Rest of Context
                const [profileRes, schedulesRes, historyRes, profileCalendarRes, faqsRes] = await Promise.all([
                    supabase.from('profiles').select('*').eq('id', tenant.id).single(),
                    supabase.from('schedules').select('*').eq('user_id', tenant.id).eq('is_active', true).order('day_of_week', { ascending: true }),
                    supabase.from('chat_history')
                        .select('role, content')
                        .eq('jid', remoteJid)
                        .eq('whatsapp_instance', instanceName)
                        .eq('status', 'processed') // Only historical processed messages
                        .neq('id', insertedMsg.id) // Exclude current ones
                        .order('created_at', { ascending: false })
                        .limit(10),
                    supabase.from('profiles').select('google_refresh_token').eq('id', tenant.id).single(),
                    supabase.from('tenant_faqs').select('*').eq('tenant_id', tenant.id)
                ]);

                const profile = profileRes.data;
                const faqs = faqsRes.data || [];
                const googleRefreshToken = profileCalendarRes.data?.google_refresh_token;

                // Attempt to refresh Google Calendar Token if available
                let googleAccessToken: string | null = null;
                const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
                const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

                if (googleRefreshToken && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
                    try {
                        const tokenUrl = 'https://oauth2.googleapis.com/token';
                        const body = new URLSearchParams({
                            client_id: GOOGLE_CLIENT_ID,
                            client_secret: GOOGLE_CLIENT_SECRET,
                            refresh_token: googleRefreshToken,
                            grant_type: 'refresh_token',
                        });
                        const tokenRes = await fetch(tokenUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: body.toString()
                        });
                        if (tokenRes.ok) {
                            const tData = await tokenRes.json();
                            googleAccessToken = tData.access_token;
                        } else {
                            console.error("Failed to refresh Google Token:", await tokenRes.text());
                        }
                    } catch (e: any) {
                        console.error("Error fetching Google Token:", e.message);
                    }
                }
                // Filter out the ids we just processed from history fetch just in case they slipped in
                const history = (historyRes.data || [])
                    .filter((m: any) => !batchIds.includes(m.id))
                    .reverse();

                // Tool Implementations
                const getAvailableSlots = async (dateStr: string) => {
                    try {
                        const [yStr, mStr, dStr] = dateStr.split('-').map(Number);

                        // Mediodía local AR ajustado a UTC (mismo patrón que public-booking) para
                        // obtener el día de semana correcto sin depender del TZ del runtime.
                        const localNoon = new Date(Date.UTC(yStr, mStr - 1, dStr, 12, 0, 0) - AR_OFFSET_MS);
                        const dayOfWeek = toARDate(localNoon).getUTCDay(); // 0 = Sun, 1 = Mon, ...

                        // 1. Check if open this day
                        const daySchedules = schedulesRes.data?.filter((s: any) => s.day_of_week === dayOfWeek);
                        if (!daySchedules || daySchedules.length === 0) return "La clínica está cerrada este día.";

                        // 2. Fetch existing appointments (límites del día en hora argentina -> UTC)
                        const dayStart = new Date(Date.UTC(yStr, mStr - 1, dStr, 0, 0, 0) - AR_OFFSET_MS);
                        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                        const startOfDay = dayStart.toISOString();
                        const endOfDay = dayEnd.toISOString();

                        const { data: appointments } = await supabase
                            .from('appointments')
                            .select('start_time, end_time')
                            .eq('user_id', tenant.id)
                            .gte('start_time', startOfDay)
                            .lt('start_time', endOfDay)
                            .neq('status', 'cancelled');

                        // Fetch Google Google Calendar Events
                        let googleEvents: any[] = [];
                        if (googleAccessToken) {
                            try {
                                const params = new URLSearchParams({
                                    timeMin: startOfDay,
                                    timeMax: endOfDay,
                                    singleEvents: 'true',
                                    orderBy: 'startTime',
                                });
                                const eventRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
                                    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                                });
                                if (eventRes.ok) {
                                    const eventData = await eventRes.json();
                                    googleEvents = eventData.items || [];
                                }
                            } catch (e: any) {
                                console.error("Error fetching Google Events:", e.message);
                            }
                        }

                        // 3. Time buffer: filter out slots that are in the past or < 30 min from now
                        const nowTime = new Date();
                        const minTimeForAppt = new Date(nowTime.getTime() + 30 * 60000);

                        // 4. Generate slots (rangos de cada bloque horario en hora argentina -> UTC)
                        const slotsArray: string[] = [];
                        const slotDuration = 30; // minutes

                        for (const schedule of daySchedules) {
                            const [sH, sM] = schedule.start_time.split(':').map(Number);
                            const [eH, eM] = schedule.end_time.split(':').map(Number);

                            const rangeStart = new Date(Date.UTC(yStr, mStr - 1, dStr, sH, sM, 0) - AR_OFFSET_MS);
                            const rangeEnd = new Date(Date.UTC(yStr, mStr - 1, dStr, eH, eM, 0) - AR_OFFSET_MS);

                            let currentTime = new Date(rangeStart);

                            while (currentTime < rangeEnd) {
                                const slotStart = currentTime;
                                const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

                                if (slotEnd > rangeEnd) break;

                                // Excluir si el slot es antes del tiempo mínimo permitido
                                if (slotStart < minTimeForAppt) {
                                    currentTime = slotEnd;
                                    continue;
                                }

                                const isOccupied = appointments?.some((appt: any) => {
                                    const apptStart = new Date(appt.start_time);
                                    const apptEnd = new Date(appt.end_time);
                                    return (slotStart < apptEnd && slotEnd > apptStart);
                                });

                                const isOccupiedGoogle = googleEvents.some((event: any) => {
                                    if (event.transparency === 'transparent') return false; // Available block

                                    let eStart = event.start?.dateTime;
                                    let eEnd = event.end?.dateTime;

                                    // Handle all-day events
                                    if (!eStart && event.start?.date) {
                                        // Use Argentina timezone offset manually for all-day boundaries?
                                        // Standard ISO assumption should cover the bounds.
                                        eStart = `${event.start.date}T00:00:00-03:00`;
                                        eEnd = `${event.start.date}T23:59:59-03:00`;
                                    }

                                    if (!eStart || !eEnd) return false;

                                    const gStart = new Date(eStart);
                                    const gEnd = new Date(eEnd);
                                    return (slotStart < gEnd && slotEnd > gStart);
                                });

                                if (!isOccupied && !isOccupiedGoogle) {
                                    slotsArray.push(formatTimeAR(slotStart));
                                }
                                currentTime = slotEnd;
                            }
                        }

                        // Remove duplicates and sort, just in case schedules overlap
                        const slots = Array.from(new Set(slotsArray)).sort();

                        if (slots.length === 0) return "No hay turnos disponibles para esta fecha.";
                        return `Horarios disponibles para ${dateStr}: ${slots.join(', ')}`;

                    } catch (e: any) {
                        console.error("Error getting slots:", e);
                        return `Error al consultar disponibilidad: ${e.message}`;
                    }
                };

                const createAppointment = async (date: string, time: string, appointment_type: string, patientName: string, dni: string, obraSocial: string, email: string | undefined, notes: string, telefono: string | undefined) => {
                    try {
                        // Should prioritize the provided phone if available, otherwise use sanitizePhone(remoteJid)
                        // But sanitizePhone(remoteJid) is the one we use for lookup.
                        // If user provides a DIFFERENT phone, we should probably update it or use it for creation.
                        // For simplicity, let's use the JID as the primary identifier for lookup, 
                        // but if creating a NEW patient, we can use the provided phone if valid.

                        const jidPhone = sanitizePhone(remoteJid);
                        // If the user explicitly provided a phone number, use that for the record. 
                        // Otherwise use the WhatsApp one.
                        const finalPhone = telefono ? telefono.trim() : jidPhone;

                        // Lookup by JID phone first (since they are messaging from there)
                        // OR by the provided phone? 
                        // Let's stick to JID for lookup to maintain thread continuity.
                        // If they provide a different phone for contact, we store it.

                        let { data: patient } = await supabase
                            .from('patients')
                            .select('id')
                            .eq('telefono', jidPhone) // Still lookup by WA number? Or by finalPhone?
                            // If I change numbers, I might break history. Let's lookup by JID phone.
                            // If not found, create with JID phone (or provided phone).
                            .eq('user_id', tenant.id)
                            .maybeSingle();

                        if (!patient) {
                            // Check if patient exists with the PROVIDED phone (if different)
                            if (telefono && telefono !== jidPhone) {
                                const { data: existingByProvided } = await supabase
                                    .from('patients')
                                    .select('id')
                                    .eq('telefono', finalPhone)
                                    .eq('user_id', tenant.id)
                                    .maybeSingle();

                                if (existingByProvided) patient = existingByProvided;
                            }
                        }

                        if (!patient) {
                            const { data: newPatient, error: createError } = await supabase
                                .from('patients')
                                .insert({
                                    nombre: patientName,
                                    telefono: finalPhone, // Use the preferred phone
                                    dni: dni,
                                    obra_social: obraSocial,
                                    email: email || null,
                                    user_id: tenant.id,
                                    estado: 'Activo'
                                })
                                .select()
                                .single();

                            if (createError) throw new Error("Error creating patient: " + createError.message);
                            patient = newPatient;
                        }

                        // Duración real del servicio desde profile.services ({name, duration, price}); fallback 30 min
                        const services = Array.isArray(profile?.services) ? profile.services : [];
                        const matchedService = services.find((s: any) =>
                            typeof s?.name === 'string' &&
                            s.name.trim().toLowerCase() === (appointment_type || '').trim().toLowerCase()
                        );
                        const durationMin = Number(matchedService?.duration) > 0 ? Number(matchedService.duration) : 30;

                        // FIX: Force Argentina Timezone (-03:00) so that 14:00 matches 14:00 AR, not 14:00 UTC (11:00 AR)
                        const startDateTime = new Date(`${date}T${time}:00-03:00`);
                        const endDateTime = new Date(startDateTime.getTime() + durationMin * 60000);

                        // Crear vía RPC con overlap-check atómico (mismo camino que el booking público)
                        const { data: rpcResult, error: apptError } = await supabase.rpc('confirm_public_appointment_safe', {
                            p_user_id: tenant.id,
                            p_patient_id: patient.id,
                            p_title: `${appointment_type} - ${patientName}`,
                            p_start_time: startDateTime.toISOString(),
                            p_end_time: endDateTime.toISOString(),
                            p_duration: durationMin,
                            p_appointment_type: appointment_type,
                            p_notes: notes || "Agendado vía WhatsApp",
                            p_status: 'confirmed'
                        });

                        if (apptError) throw new Error("Error creating appointment: " + apptError.message);

                        if (!rpcResult?.success) {
                            return `ERROR: ${rpcResult?.error || 'El horario ya está ocupado.'} Vuelve a llamar 'get_available_slots' para esa fecha y ofrece al paciente únicamente los horarios que devuelva.`;
                        }

                        const appointmentId = rpcResult.id;

                        // --- Sync con Google Calendar (best-effort, reutiliza el token ya refrescado) ---
                        if (googleAccessToken && appointmentId) {
                            try {
                                const gcalEvent = {
                                    summary: `${appointment_type} - ${patientName}`,
                                    description: notes || "Agendado vía WhatsApp",
                                    start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
                                    end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
                                    attendees: email ? [{ email }] : [],
                                };
                                const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(gcalEvent),
                                });
                                if (gcalRes.ok) {
                                    const createdEvent = await gcalRes.json();
                                    if (createdEvent?.id) {
                                        await supabase
                                            .from('appointments')
                                            .update({ google_event_id: createdEvent.id })
                                            .eq('id', appointmentId);
                                    }
                                } else {
                                    console.error("chat-webhook: failed to create Google Calendar event", await gcalRes.text());
                                }
                            } catch (gcalErr: any) {
                                console.warn("chat-webhook: Google Calendar sync failed", gcalErr.message);
                            }
                        }
                        // ------------------------------------

                        // --- Notify Dentist (New Feature) ---
                        if (tenant.notification_phone) {
                            const notifyMsg = `🔔 *Nuevo Turno Agendado*\n\n👤 Paciente: ${patientName}\n📅 Fecha: ${date}\n⏰ Hora: ${time}\n🆔 DNI: ${dni}\n🏥 Obra Social: ${obraSocial}\n📝 Notas: ${notes || '-'}\n\n_Agendado vía WhatsApp Bot_`;

                            // Send asynchronously (don't block response to user)
                            fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                                body: JSON.stringify({ number: tenant.notification_phone, text: notifyMsg })
                            }).catch(err => console.error("Error notifying dentist:", err));
                        }
                        // ------------------------------------

                        // --- Notificacion por email (paciente + dentista) ---
                        // Complementa el aviso de WhatsApp de arriba, que solo llega al
                        // dentista y solo si tiene notification_phone cargado.
                        await notifyAppointmentCreated(supabase, appointmentId);
                        // ------------------------------------

                        // Detailed confirmation prompt for the AI
                        return `Turno RESERVADO con éxito. ID: ${appointmentId}.
INSTRUCCIÓN PARA LA IA: Responde al paciente con este formato exacto (puedes añadir emojis):
✅ *Turno Confirmado*
📅 Fecha: ${date}
⏰ Hora: ${time}
👤 Paciente: ${patientName}
🏥 Odontologo: ${tenant.business_name}

¡Te esperamos! Si necesitas reagendar, avísanos.`;

                    } catch (e: any) {

                        console.error("Error creating appointment:", e);
                        return `Error al agendar: ${e.message}`;
                    }
                };

                const dentistName = profile?.full_name || tenant.business_name || 'el Profesional';
                const contactPhone = profile?.contact_phone || null;

                // Base prompt with dynamic injection
                let basePrompt = (AGENT_PROMPT || `Eres la asistente del Od. {{nombre_odontologo}}. Atiende dudas de forma amable.`)
                    .replace(/{{nombre_odontologo}}/gi, dentistName);

                let contextInfo = `--- DATOS ESTRUCTURADOS ---\nProf: Od. ${dentistName}\n`;
                if (profile?.services) contextInfo += `Servicios: ${JSON.stringify(profile.services)}\n`;
                if (profile?.accepted_insurances) contextInfo += `Obras Sociales: ${JSON.stringify(profile.accepted_insurances)}\n`;
                if (faqs.length > 0) contextInfo += `FAQs: ${JSON.stringify(faqs.map(f => ({ q: f.question, a: f.answer })))}\n`;
                if (contactPhone) contextInfo += `Contacto Humano (dáselo si no sabes responder o lo piden): ${contactPhone}\n`;

                if (schedulesRes.data && schedulesRes.data.length > 0) {
                    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

                    // Group schedules by day
                    const groupedSchedules: Record<string, string[]> = {};
                    schedulesRes.data.forEach((s: any) => {
                        const dayName = days[s.day_of_week];
                        if (!groupedSchedules[dayName]) groupedSchedules[dayName] = [];
                        groupedSchedules[dayName].push(`${s.start_time.substring(0, 5)}-${s.end_time.substring(0, 5)}`);
                    });

                    contextInfo += `Horarios: ${JSON.stringify(groupedSchedules)}\n`;
                }

                contextInfo += `\n--- ENTORNO ---\n`;
                if (patientData) {
                    contextInfo += `Paciente DB: ${JSON.stringify(patientData)}\n(Llámalo por su nombre y USA ESTOS DATOS en 'create_appointment' si necesitas agendar, NO le pidas sus datos de nuevo)\n`;
                } else {
                    contextInfo += `Paciente DB: null\n`;
                }

                const now = new Date();
                const arTimeParams = { timeZone: 'America/Argentina/Buenos_Aires' };

                // Compact Calendar Injection as JSON to save tokens
                const calContext = [];
                for (let i = 0; i < 14; i++) {
                    const d = new Date(now);
                    d.setDate(d.getDate() + i);
                    calContext.push({
                        f: d.toISOString().split('T')[0],
                        d: d.toLocaleDateString('es-AR', { ...arTimeParams, weekday: 'short' })
                    });
                }

                const options: Intl.DateTimeFormatOptions = { ...arTimeParams, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
                const currentDateTimeString = now.toLocaleDateString('es-AR', options);

                const systemPrompt = `${basePrompt}

--- REGLAS ESTRICTAS DEL SISTEMA ---
1. IDENTIDAD: Eres estrictamente la asistente del Od. ${dentistName}. NO eres una clínica.
2. DISPONIBILIDAD (¡CRÍTICO!): 
   - NUNCA inventes, asumas, ni adivines un turno disponible.
   - NUNCA ofrezcas un día u horario sin haber OBLIGATORIAMENTE llamado a la función 'get_available_slots' para ese día exacto.
   - Si el usuario pide "el lunes", averigua qué fecha es, usa 'get_available_slots' y SOLO ofrece las horas que esa función te devuelva. Si la función dice que no hay turnos, asúmelo como verdad irrefutable y dile al paciente que no hay lugar.
3. AGENDAMIENTO (¡CRÍTICO!): 
   - NUNCA agendes un turno (usando 'create_appointment') sin recibir antes un "SÍ" EXPLÍCITO del paciente para la fecha y hora exacta propuesta.
   - Flujo correcto: 
     a) Muestras opciones de horario -> Paciente elige.
     b) Preguntas el motivo o SERVICIO (ej. Limpieza, Ortodoncia) usando la lista "Servicios".
     c) Verificas los datos faltantes (DNI, Obra Social). SI YA TIENES los datos en "Paciente DB", NO los pides de nuevo. Usa sus respuestas anteriores si las hizo en el chat.
     d) Si el paciente menciona una Obra Social que NO ESTÁ en tu lista de "Obras Sociales", avísale que su atención será catalogada como "Particular". Si no especifica, asume "Particular".
     e) Recién entonces usas 'create_appointment', asegurándote de enviar el "appointment_type" (servicio).
4. DATOS NECESARIOS: Para agendar necesitas Nombre, DNI, Teléfono y Obra Social. Pídelos SOLO SI NO ESTÁN en "Paciente DB". NO vuelvas a pedir el nombre y datos si ya te figura en "Paciente DB".
5. TONO: Profesional, amable y de CONCISIÓN EXTREMA. Usa bullet points si aplica.
6. FECHA ACTUAL: ${currentDateTimeString}
7. CALENDARIO (14 días): ${JSON.stringify(calContext)}

${contextInfo}`;


                let aiResponse = "";

                if (OPENAI_KEY) {
                    try {
                        const openai = new OpenAI({ apiKey: OPENAI_KEY });

                        const messages: any[] = [
                            { role: "system", content: systemPrompt },
                            ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
                            { role: "user", content: finalMessageText } // Use the BATCHED message
                        ];

                        const runner = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: messages,
                            tools: toolsDefinition.map(t => ({ type: "function", function: t })),
                            tool_choice: "auto"
                        });

                        const responseMessage = runner.choices[0].message;

                        if (responseMessage.tool_calls) {
                            messages.push(responseMessage);
                            for (const toolCall of responseMessage.tool_calls) {
                                const fnName = toolCall.function.name;
                                const fnArgs = JSON.parse(toolCall.function.arguments);
                                let fnResult = "";

                                console.log(`Executing tool ${fnName} with args:`, fnArgs);

                                if (fnName === "get_available_slots") {
                                    fnResult = await getAvailableSlots(fnArgs.date);
                                } else if (fnName === "create_appointment") {
                                    fnResult = await createAppointment(fnArgs.date, fnArgs.time, fnArgs.appointment_type || "Consulta General", fnArgs.patient_name, fnArgs.dni, fnArgs.obra_social, fnArgs.email, fnArgs.notes, fnArgs.telefono);
                                } else {
                                    fnResult = "Función no reconocida.";
                                }

                                messages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    content: fnResult
                                });
                            }

                            const secondResponse = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: messages
                            });
                            aiResponse = secondResponse.choices[0].message?.content || "";
                        } else {
                            aiResponse = responseMessage.content || "";
                        }
                    } catch (err: any) {
                        console.error("OpenAI Logic Error:", err);
                    }
                }

                if (!aiResponse && GEMINI_KEY) {
                    // Context: Gemini Fallback
                    try {
                        const genAI = new GoogleGenerativeAI(GEMINI_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        const historyText = history.map((m: any) => `${m.role === 'user' ? 'Paciente' : 'Asistente'}: ${m.content}`).join('\n');
                        const result = await model.generateContent(`${systemPrompt}\n\nHistorial:\n${historyText}\n\nPaciente: ${finalMessageText}`);
                        aiResponse = result.response.text();
                    } catch (err: any) {
                        console.error("Gemini failed:", err.message);
                    }
                }

                if (!aiResponse) throw new Error("AI Generation failed");

                // Send message
                const sendUrl = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;
                const sendRes = await fetch(sendUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                    body: JSON.stringify({ number: remoteJid, text: aiResponse, delay: 1200 })
                });

                if (!sendRes.ok) throw new Error(`Evolution send failed: ${sendRes.status}`);

                // Persist AI Response with processed status
                await supabase.from('chat_history').insert({
                    tenant_id: tenant.id,
                    whatsapp_instance: instanceName,
                    jid: remoteJid,
                    role: 'assistant',
                    content: aiResponse,
                    status: 'processed'
                });

            } catch (bgError: any) {
                console.error("Background Webhook Error:", bgError);
            }
        };

        // Execute as Fire-and-Forget using waitUntil if EdgeRuntime is present (Supabase edge env)
        if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
            const EdgeRuntime = (globalThis as any).EdgeRuntime;
            if (EdgeRuntime.waitUntil) {
                EdgeRuntime.waitUntil(processWebhookBackground());
            } else {
                processWebhookBackground().catch(console.error);
            }
        } else {
            // Local Deno or fallback
            processWebhookBackground().catch(console.error);
        }

        // --- Fast Return to Evolution API ---
        return new Response('Webhook received and queued', { status: 200 });

    } catch (error: any) {
        console.error('Webhook Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
