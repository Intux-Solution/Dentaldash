
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.0"
import OpenAI from "https://esm.sh/openai"

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
    let phone = jid.replace('@s.whatsapp.net', '');
    if (phone.startsWith('549')) {
        phone = phone.substring(3); // Remove '549' to match DB '381...'
    }
    return phone;
};

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
                patient_name: { type: "string", description: "Nombre completo del paciente" },
                dni: { type: "string", description: "DNI del paciente (sin puntos)" },
                obra_social: { type: "string", description: "Obra social del paciente (o 'Particular')" },
                email: { type: "string", description: "Email del paciente (opcional)" },
                notes: { type: "string", description: "Motivo de la consulta o notas adicionales" }
            },
            required: ["date", "time", "patient_name", "dni", "obra_social"]
        }
    }
];

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

        const instanceName = payload.data?.instance || payload.instance;
        console.log("Webhook Payload:", JSON.stringify(payload, null, 2));

        let messageObj = payload.data?.messages?.[0] || payload.messages?.[0];

        // Fallback for when data IS the message object (as seen in v2.3 logs)
        if (!messageObj && payload.data?.key && (payload.data?.message || payload.data?.messageType)) {
            console.log("Detected v2.3 single message payload format");
            messageObj = payload.data;
        }

        const remoteJid = messageObj?.key?.remoteJid;
        const messageText = messageObj?.message?.conversation ||
            messageObj?.message?.extendedTextMessage?.text ||
            messageObj?.message?.imageMessage?.caption ||
            messageObj?.message?.videoMessage?.caption;

        if (!instanceName || !messageText || !remoteJid) {
            return new Response('Missing essential data', { status: 200 });
        }

        if (messageObj?.key?.fromMe) return new Response('Skip self', { status: 200 });

        const EVOLUTION_URL_RAW = Deno.env.get('EVOLUTION_API_URL')?.trim();
        const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY')?.trim();
        const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')?.trim();
        const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')?.trim();
        const AGENT_PROMPT = Deno.env.get('AGENT_SYSTEM_PROMPT')?.trim();

        if (!EVOLUTION_URL_RAW || !EVOLUTION_KEY) throw new Error("Missing Evolution Secrets");
        const EVOLUTION_API_URL = sanitizeUrl(EVOLUTION_URL_RAW);

        // Fetch context
        const [tenantRes, schedulesRes] = await Promise.all([
            supabase.from('tenants').select('*').eq('whatsapp_instance', instanceName).single(),
            supabase.from('schedules').select('*').eq('is_active', true).order('day_of_week', { ascending: true })
        ]);

        const tenant = tenantRes.data;
        if (!tenant) throw new Error(`Tenant not found for instance: ${instanceName}`);

        // Identify Patient
        const cleanPhone = sanitizePhone(remoteJid);
        const { data: patientData } = await supabase
            .from('patients')
            .select('*')
            .eq('telefono', cleanPhone)
            .eq('organization_id', tenant.user_id)
            .single();

        const [profileRes, faqsRes, historyRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', tenant.user_id).single(),
            supabase.from('tenant_faqs').select('question, answer').eq('tenant_id', tenant.id),
            supabase.from('chat_history')
                .select('role, content')
                .eq('jid', remoteJid)
                .eq('whatsapp_instance', instanceName)
                .order('created_at', { ascending: false })
                .limit(10)
        ]);

        const profile = profileRes.data;
        const history = (historyRes.data || []).reverse();

        // Save incoming message
        await supabase.from('chat_history').insert({
            tenant_id: tenant.id,
            whatsapp_instance: instanceName,
            jid: remoteJid,
            role: 'user',
            content: messageText
        });

        // ---------------------------------------------------------
        // Tool Implementations
        // ---------------------------------------------------------

        const getAvailableSlots = async (dateStr: string) => {
            try {
                const date = new Date(dateStr);
                const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon, ...

                // 1. Check if open this day
                const schedule = schedulesRes.data?.find((s: any) => s.day_of_week === dayOfWeek);
                if (!schedule) return "La clínica está cerrada este día.";

                // 2. Fetch existing appointments
                // Filter appointments that overlap with this day
                // To be safe, checking precise range
                const startOfDay = new Date(`${dateStr}T00:00:00`).toISOString();
                const endOfDay = new Date(`${dateStr}T23:59:59`).toISOString();

                const { data: appointments } = await supabase
                    .from('appointments')
                    .select('start_time, end_time')
                    .eq('organization_id', tenant.user_id) // Assuming tenant.user_id maps to organization_id or similar
                    .gte('start_time', startOfDay)
                    .lte('start_time', endOfDay);

                // 3. Generate slots
                const slots = [];
                let currentTime = new Date(`${dateStr}T${schedule.start_time}`);
                const endTime = new Date(`${dateStr}T${schedule.end_time}`);
                const slotDuration = 30; // minutes

                while (currentTime < endTime) {
                    const slotStart = currentTime;
                    const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

                    if (slotEnd > endTime) break;

                    // Check collision
                    const isOccupied = appointments?.some((appt: any) => {
                        const apptStart = new Date(appt.start_time);
                        const apptEnd = new Date(appt.end_time);
                        // Simple overlap check
                        return (slotStart < apptEnd && slotEnd > apptStart);
                    });

                    if (!isOccupied) {
                        const timeString = slotStart.toTimeString().substring(0, 5);
                        slots.push(timeString);
                    }

                    currentTime = slotEnd;
                }

                if (slots.length === 0) return "No hay turnos disponibles para esta fecha.";
                return `Horarios disponibles para ${dateStr}: ${slots.join(', ')}`;

            } catch (e: any) {
                console.error("Error getting slots:", e);
                return "Error al consultar disponibilidad.";
            }
        };

        const createAppointment = async (date: string, time: string, patientName: string, dni: string, obraSocial: string, email: string | undefined, notes: string) => {
            try {
                const phone = sanitizePhone(remoteJid);

                // 1. Find or create patient
                let { data: patient } = await supabase
                    .from('patients')
                    .select('id')
                    .eq('telefono', phone)
                    .eq('organization_id', tenant.user_id)
                    .single();

                if (!patient) {
                    const { data: newPatient, error: createError } = await supabase
                        .from('patients')
                        .insert({
                            nombre: patientName,
                            telefono: phone,
                            dni: dni,
                            obra_social: obraSocial,
                            email: email || null,
                            organization_id: tenant.user_id,
                            estado: 'Activo'
                        })
                        .select()
                        .single();

                    if (createError) throw new Error("Error creating patient: " + createError.message);
                    patient = newPatient;
                }

                if (!patient) throw new Error("Could not resolve patient.");

                // 2. Create Appointment
                const startDateTime = new Date(`${date}T${time}:00`);
                const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); // 30 min duration

                const { data: appointment, error: apptError } = await supabase
                    .from('appointments')
                    .insert({
                        title: `Turno WhatsApp - ${patientName}`,
                        patient_id: patient.id,
                        organization_id: tenant.user_id,
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        duration: 30,
                        status: 'confirmed',
                        notes: notes || "Agendado vía WhatsApp",
                        appointment_type: 'Consulta General'
                    })
                    .select()
                    .single();

                if (apptError) throw new Error("Error creating appointment: " + apptError.message);

                return `Turno agendado con éxito para el ${date} a las ${time}. ID: ${appointment.id}`;

            } catch (e: any) {
                console.error("Error creating appointment:", e);
                return `Error al agendar: ${e.message}`;
            }
        };


        // ---------------------------------------------------------
        // AI Execution Logic with Function Calling
        // ---------------------------------------------------------

        // Context construction
        let contextInfo = `Clínica: ${tenant.business_name}\n`;
        if (patientData) {
            contextInfo += `\nESTE ES EL PACIENTE IDENTIFICADO: ${patientData.nombre}. SALÚDALO POR SU NOMBRE.\n`;
        } else {
            contextInfo += `\nPaciente NO identificado. Si quiere agendar, DEBES pedirle Nombre, DNI y Obra Social.\n`;
        }

        if (profile?.services) contextInfo += `Servicios: ${JSON.stringify(profile.services)}\n`;
        if (profile?.accepted_insurances) contextInfo += `Obras Sociales: ${JSON.stringify(profile.accepted_insurances)}\n`;
        // schedules info is now strictly for the AI to know general hours, but it should use the tool for specifics
        if (schedulesRes.data) {
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            contextInfo += "Horarios de Atención General:\n" + schedulesRes.data.map((s: any) => `- ${days[s.day_of_week]}: ${s.start_time}-${s.end_time}`).join('\n');
        }

        const systemPrompt = (AGENT_PROMPT || `Eres la secretaria de "${tenant.business_name}". Atiende dudas de forma amable.`) +
            `\n\nContexto actual de la clínica:\n${contextInfo}\n\nIMPORTANTE: Para agendar turnos, SIEMPRE usa las herramientas (functions) provistas. Si el usuario quiere un turno, primero verifica disponibilidad con 'get_available_slots'. Luego usa 'create_appointment', pero asegúrate de tener todos los datos requeridos (Nombre, DNI, Obra Social).`;

        let aiResponse = "";

        // For now, defaulting to OpenAI because handling function calling multi-turn loop is simpler/more standard with their SDK 
        // or constructing manual loops. I will implement a basic flow.

        if (OPENAI_KEY) {
            try {
                const openai = new OpenAI({ apiKey: OPENAI_KEY });

                const messages: any[] = [
                    { role: "system", content: systemPrompt },
                    ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
                    { role: "user", content: messageText }
                ];

                // First Call
                const runner = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: messages,
                    tools: toolsDefinition.map(t => ({ type: "function", function: t })),
                    tool_choice: "auto"
                });

                const responseMessage = runner.choices[0].message;

                // Check for Tool Calls
                if (responseMessage.tool_calls) {
                    // Append assistant's function call intent to history not to break conversation flow? 
                    // Actually standard is: user -> assistant(tool_calls) -> tool -> assistant(response)
                    messages.push(responseMessage);

                    for (const toolCall of responseMessage.tool_calls) {
                        const fnName = toolCall.function.name;
                        const fnArgs = JSON.parse(toolCall.function.arguments);
                        let fnResult = "";

                        console.log(`Executing tool ${fnName} with args:`, fnArgs);

                        if (fnName === "get_available_slots") {
                            fnResult = await getAvailableSlots(fnArgs.date);
                        } else if (fnName === "create_appointment") {
                            fnResult = await createAppointment(fnArgs.date, fnArgs.time, fnArgs.patient_name, fnArgs.dni, fnArgs.obra_social, fnArgs.email, fnArgs.notes);
                        } else {
                            fnResult = "Función no reconocida.";
                        }

                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: fnResult
                        });
                    }

                    // Second Call (Get final answer)
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

        // Fallback or Gemini implementation (Simplified: Gemini support for function calling requires different structure,
        // for stability I'll rely on OpenAI if available for this complex task, or just basic text for Gemini if OpenAI fails, 
        // but user likely has OpenAI or we can fail gracefully).
        // If no AI response yet (e.g. OpenAI failed or not present), try Gemini (No tools for now on Gemini fallback to keep it simple or implement if needed)

        if (!aiResponse && GEMINI_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                // Note: Not implementing tools for Gemini in this step to avoid complexity explosion, defaulting to text.
                const historyText = history.map((m: any) => `${m.role === 'user' ? 'Paciente' : 'Asistente'}: ${m.content}`).join('\n');
                const result = await model.generateContent(`${systemPrompt}\n\nHistorial:\n${historyText}\n\nPaciente: ${messageText}`);
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

        // Persist AI Response
        await supabase.from('chat_history').insert({
            tenant_id: tenant.id,
            whatsapp_instance: instanceName,
            jid: remoteJid,
            role: 'assistant',
            content: aiResponse
        });

        return new Response('Success', { status: 200 });

    } catch (error: any) {
        console.error('Webhook Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});

