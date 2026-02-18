import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
    try {
        const payload = await req.json()
        console.log('Webhook received:', payload)

        // Payload structure from Evolution API (typical):
        // { event: 'MESSAGES_UPSERT', data: { instance: '...', messages: [...] } }
        const instanceName = payload.data?.instance
        const remoteJid = payload.data?.messages?.[0]?.key?.remoteJid
        const messageText = payload.data?.messages?.[0]?.message?.conversation || payload.data?.messages?.[0]?.message?.extendedTextMessage?.text

        if (!instanceName || !messageText || !remoteJid) {
            return new Response('Missing data', { status: 200 }) // Return 200 to acknowledge
        }

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 1. Get Tenant details
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('whatsapp_instance', instanceName)
            .single()

        if (tenantError || !tenant) {
            console.error('Tenant not found for instance:', instanceName)
            return new Response('Tenant not found', { status: 200 })
        }

        // 2. Generate embedding for the question
        const configuration = new Configuration({ apiKey: OPENAI_API_KEY })
        const openai = new OpenAIApi(configuration)

        const embeddingResponse = await openai.createEmbedding({
            model: "text-embedding-3-small",
            input: messageText,
        })
        const [{ embedding }] = embeddingResponse.data.data

        // 3. GET FAQs (Priority)
        const { data: faqs } = await supabase
            .from('tenant_faqs')
            .select('question, answer')
            .eq('tenant_id', tenant.id);

        let faqContext = "";
        if (faqs && faqs.length > 0) {
            faqContext = "Preguntas Frecuentes (Prioridad):\n" +
                faqs.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n');
        }

        // 4. RAG: Search similar documents (Secondary Context)
        const { data: documents } = await supabase.rpc('match_tenant_documents', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 5,
            filter_tenant_id: tenant.id
        })

        const docContext = documents?.length > 0
            ? "Contexto adicional de documentos:\n" + documents.map(d => d.content).join('\n---\n')
            : "";

        const finalContext = `${faqContext}\n\n${docContext}`.trim();

        // 5. LLM: Generate response with GLOBAL SYSTEM PROMPT
        const globalSystemPrompt = `Eres la secretaria virtual de la clínica dental "${tenant.business_name}". 
Tu objetivo es resolver dudas de pacientes de forma profesional, amable y eficiente. 

REGLAS:
1. Usa el contexto proporcionado (FAQs y Documentos) para responder.
2. Si no sabes la respuesta, ofrece que un humano se contactará con ellos.
3. Sé concisa y utiliza un tono cálido.
4. No menciones que eres una IA a menos que te lo pregunten directamente.
5. Si el paciente quiere agendar, indícale que puedes ayudarle a coordinar o que el doctor se comunicará.`;

        const completion = await openai.createChatCompletion({
            model: "gpt-4o",
            messages: [
                { role: 'system', content: globalSystemPrompt + `\n\nContexto actual:\n${finalContext}` },
                { role: 'user', content: messageText }
            ]
        })

        const aiResponse = completion.data.choices[0].message?.content

        // 5. Send message back via Evolution API
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({
                number: remoteJid,
                text: aiResponse,
                delay: 1200,
                linkPreview: true
            })
        })

        return new Response('Success', { status: 200 })

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
