import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const rawApiUrl = Deno.env.get('EVOLUTION_API_URL')
        const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        const { action, tenant_id } = await req.json()

        if (!action || !tenant_id) {
            return new Response(JSON.stringify({ error: 'Missing action or tenant_id' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const instanceName = `instance_${tenant_id.split('-')[0]}`
        const baseUrl = sanitizeUrl(rawApiUrl || "");
        const webhookUrl = `${SUPABASE_URL}/functions/v1/chat-webhook`;

        if (action === 'create') {
            const apiUrl = `${baseUrl}/instance/create`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                body: JSON.stringify({
                    instanceName: instanceName,
                    token: instanceName,
                    qrcode: true,
                    integration: "WHATSAPP-BAILEYS"
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Set Webhook
                await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                    body: JSON.stringify({
                        url: webhookUrl,
                        enabled: true,
                        events: ["MESSAGES_UPSERT"]
                    })
                });

                const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
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

        if (action === 'get_qr') {
            // Check connection state first
            const stateUrl = `${baseUrl}/instance/connectionState/${instanceName}`;
            const stateResponse = await fetch(stateUrl, {
                headers: { 'apikey': EVOLUTION_API_KEY }
            });
            const stateData = await stateResponse.json();

            if (stateData?.instance?.state === 'open') {
                // Auto-sync webhook just in case
                await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                    body: JSON.stringify({
                        url: webhookUrl,
                        enabled: true,
                        events: ["MESSAGES_UPSERT"]
                    })
                });

                const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
                await supabase.from('tenants').update({ whatsapp_status: 'connected' }).eq('id', tenant_id);
                return new Response(JSON.stringify({ ...stateData, status: 'connected' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            // If not open, get QR
            const apiUrl = `${baseUrl}/instance/connect/${instanceName}`;
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'apikey': EVOLUTION_API_KEY }
            });

            const data = await response.json();
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: response.status,
            })
        }

        if (action === 'sync_webhook') {
            const response = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                body: JSON.stringify({
                    url: webhookUrl,
                    enabled: true,
                    events: ["MESSAGES_UPSERT"]
                })
            });
            const data = await response.json();
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'logout') {
            const apiUrl = `${baseUrl}/instance/logout/${instanceName}`;
            await fetch(apiUrl, {
                method: 'DELETE',
                headers: { 'apikey': EVOLUTION_API_KEY }
            });

            await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': EVOLUTION_API_KEY }
            });

            const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
            await supabase.from('tenants').update({ whatsapp_status: 'disconnected', whatsapp_instance: null }).eq('id', tenant_id)

            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})

const sanitizeUrl = (url: string) => {
    let clean = url.replace(/\/$/, "");
    clean = clean.replace(/\/manager$/, "");
    return clean;
};
