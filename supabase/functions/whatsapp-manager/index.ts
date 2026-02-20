
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sanitizeUrl = (url: string) => {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "").replace(/\/manager$/, "");
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const EVOLUTION_URL_RAW = Deno.env.get('EVOLUTION_API_URL')?.trim();
    const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY')?.trim();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const { action, tenant_id } = await req.json();
        if (!action || !tenant_id) throw new Error('Missing action or tenant_id');

        const instanceName = `instance_${tenant_id.split('-')[0]}`
        const baseUrl = sanitizeUrl(EVOLUTION_URL_RAW || "");
        const webhookUrl = `${SUPABASE_URL}/functions/v1/chat-webhook`;

        if (!baseUrl || !EVOLUTION_KEY) throw new Error("Missing Evolution API configuration");

        const setWebhook = async (name: string) => {
            // Try v2 standard endpoint
            const urlV2 = `${baseUrl}/webhook/instance/${name}`;
            const resV2 = await fetch(urlV2, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: JSON.stringify({ url: webhookUrl, enabled: true, events: ["MESSAGES_UPSERT"] })
            });

            if (resV2.ok) return resV2;

            // Fallback for some Evolution API distributions
            const urlFallback = `${baseUrl}/webhook/set/${name}`;
            return await fetch(urlFallback, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: JSON.stringify({ url: webhookUrl, enabled: true, events: ["MESSAGES_UPSERT"] })
            });
        };

        if (action === 'create') {
            const apiUrl = `${baseUrl}/instance/create`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: JSON.stringify({
                    instanceName: instanceName,
                    token: instanceName,
                    qrcode: true,
                    integration: "WHATSAPP-BAILEYS"
                })
            });

            const data = await response.json();
            if (response.ok) {
                await setWebhook(instanceName);
                await supabase.from('tenants').update({
                    whatsapp_instance: instanceName,
                    whatsapp_status: 'connecting'
                }).eq('id', tenant_id);
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: response.status,
            })
        }

        if (action === 'get_qr' || action === 'sync_webhook') {
            const stateUrl = `${baseUrl}/instance/connectionState/${instanceName}`;
            const stateResponse = await fetch(stateUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const stateData = await stateResponse.json();

            if (stateData?.instance?.state === 'open' || action === 'sync_webhook') {
                await setWebhook(instanceName);
                if (stateData?.instance?.state === 'open') {
                    await supabase.from('tenants').update({ whatsapp_status: 'connected' }).eq('id', tenant_id);
                }
                if (action === 'sync_webhook') {
                    return new Response(JSON.stringify({ status: 'success', webhookUrl }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 200,
                    })
                }
            }

            const apiUrl = `${baseUrl}/instance/connect/${instanceName}`;
            const response = await fetch(apiUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const data = await response.json();
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: response.status,
            })
        }

        if (action === 'logout') {
            await fetch(`${baseUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY } });
            await fetch(`${baseUrl}/instance/delete/${instanceName}`, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY } });
            await supabase.from('tenants').update({ whatsapp_status: 'disconnected', whatsapp_instance: null }).eq('id', tenant_id);
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        throw new Error('Invalid action');

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
