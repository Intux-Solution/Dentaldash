
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

// Tool definitions for Function Calling
const tools = [
    {
        name: "check_appointment_availability",
        description: "Consulta los turnos disponibles para una fecha específica",
        parameters: {
            type: "object",
            properties: {
                date: { type: "string", description: "La fecha a consultar (formato YYYY-MM-DD)" }
            },
            required: ["date"]
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

        // Context construction
        let contextInfo = `Clínica: ${tenant.business_name}\n`;
        if (profile?.services) contextInfo += `Servicios: ${JSON.stringify(profile.services)}\n`;
        if (profile?.accepted_insurances) contextInfo += `Obras Sociales: ${JSON.stringify(profile.accepted_insurances)}\n`;
        if (schedulesRes.data) {
            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            contextInfo += "Horarios:\n" + schedulesRes.data.map((s: any) => `- ${days[s.day_of_week]}: ${s.start_time}-${s.end_time}`).join('\n');
        }
        if (faqsRes.data) {
            contextInfo += "\nPreguntas Frecuentes:\n" + faqsRes.data.map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join('\n');
        }

        const systemPrompt = (AGENT_PROMPT || `Eres la secretaria de "${tenant.business_name}". Atiende dudas de forma amable.`) +
            `\n\nContexto actual de la clínica:\n${contextInfo}`;

        let aiResponse = "";

        if (GEMINI_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const historyText = history.map((m: any) => `${m.role === 'user' ? 'Paciente' : 'Asistente'}: ${m.content}`).join('\n');
                const result = await model.generateContent(`${systemPrompt}\n\nHistorial:\n${historyText}\n\nPaciente: ${messageText}`);
                aiResponse = result.response.text();
            } catch (err: any) {
                console.error("Gemini failed:", err.message);
            }
        }

        if (!aiResponse && OPENAI_KEY) {
            try {
                const openai = new OpenAI({ apiKey: OPENAI_KEY });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...history.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
                        { role: "user", content: messageText }
                    ]
                });
                aiResponse = completion.choices[0].message?.content || "";
            } catch (err: any) {
                console.error("OpenAI failed:", err.message);
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
