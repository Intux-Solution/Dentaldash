
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.0"
import OpenAI from "https://esm.sh/openai"

const RAW_EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const AGENT_SYSTEM_PROMPT_ENV = Deno.env.get('AGENT_SYSTEM_PROMPT')

const sanitizeUrl = (url: string) => {
    let clean = url.replace(/\/$/, "");
    clean = clean.replace(/\/manager$/, "");
    return clean;
};

const EVOLUTION_API_URL = sanitizeUrl(RAW_EVOLUTION_URL || "");

serve(async (req) => {
    try {
        const payload = await req.json()
        console.log('Webhook received:', JSON.stringify(payload, null, 2))

        const instanceName = payload.data?.instance
        const remoteJid = payload.data?.messages?.[0]?.key?.remoteJid
        const messageText = payload.data?.messages?.[0]?.message?.conversation ||
            payload.data?.messages?.[0]?.message?.extendedTextMessage?.text

        if (!instanceName || !messageText || !remoteJid) {
            return new Response('Missing data', { status: 200 })
        }

        if (payload.data?.messages?.[0]?.key?.fromMe) {
            return new Response('Self message skip', { status: 200 })
        }

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 1. Get Tenant & Context
        const { data: tenant } = await supabase.from('tenants').select('*').eq('whatsapp_instance', instanceName).single()
        if (!tenant) return new Response('Tenant not found', { status: 200 })

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', tenant.user_id).single()
        const { data: schedules } = await supabase.from('schedules').select('*').eq('is_active', true)
        const { data: faqs } = await supabase.from('tenant_faqs').select('question, answer').eq('tenant_id', tenant.id)

        let context = `Clínica: ${tenant.business_name}\n`;
        if (profile?.services) context += `Servicios: ${JSON.stringify(profile.services)}\n`;
        if (profile?.accepted_insurances) context += `Obras Sociales: ${JSON.stringify(profile.accepted_insurances)}\n`;
        if (schedules) {
            context += "Horarios:\n" + schedules.map(s => `- ${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][s.day_of_week]}: ${s.start_time}-${s.end_time}`).join('\n');
        }
        if (faqs) {
            context += "\nFAQs:\n" + faqs.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n');
        }

        const systemPrompt = (AGENT_SYSTEM_PROMPT_ENV || `Eres la secretaria de "${tenant.business_name}". Responde dudas de forma amable.`) + `\n\nContexto:\n${context}`;

        let aiResponse = "";

        // Try Gemini First if key exists
        if (GEMINI_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
                const result = await model.generateContent([
                    { text: systemPrompt },
                    { text: messageText }
                ])
                aiResponse = result.response.text()
            } catch (err) {
                console.error("Gemini failed, falling back to OpenAI:", err.message)
            }
        }

        // Fallback to OpenAI
        if (!aiResponse && OPENAI_API_KEY) {
            const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: messageText }
                ]
            })
            aiResponse = completion.choices[0].message?.content || ""
        }

        if (!aiResponse) {
            throw new Error("No AI service available or response failed")
        }

        // 2. Send Response
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY! },
            body: JSON.stringify({ number: remoteJid, text: aiResponse, delay: 1000 })
        })

        return new Response('Success', { status: 200 })

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
