
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Saneamiento de URL para evitar fallos por espacios o saltos de línea.
 */
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
        const body = await req.json();
        const { action, tenant_id } = body;
        if (!action || !tenant_id) throw new Error('Missing action or tenant_id');

        // Extract and validate Auth Token from Authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: corsHeaders });
        }

        const token = authHeader.replace(/^Bearer\s+/, "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized / Invalid Token" }), { status: 401, headers: corsHeaders });
        }

        // Validate that the request maker actually has access to the target tenant
        const { data: tenantUser, error: tenantUserError } = await supabase
            .from('tenant_users')
            .select('role')
            .eq('tenant_id', tenant_id)
            .eq('user_id', user.id)
            .single();

        if (tenantUserError || !tenantUser) {
            return new Response(JSON.stringify({ error: "Forbidden: You don't own this tenant." }), { status: 403, headers: corsHeaders });
        }

        const instanceName = `instance_${tenant_id.split('-')[0]}`
        const baseUrl = sanitizeUrl(EVOLUTION_URL_RAW || "");
        const webhookUrl = `${SUPABASE_URL}/functions/v1/chat-webhook`;

        if (!baseUrl || !EVOLUTION_KEY) throw new Error("Missing Evolution API configuration");

        /**
         * Optimiza la eficiencia guardando logs de forma asíncrona (best-effort).
         */
        const logFetch = (url: string, options: any, res: Response) => {
            // Intentamos clonar y procesar sin bloquear el flujo principal
            res.clone().text().then(resText => {
                supabase.from('debug_payloads').insert({
                    function_name: 'whatsapp-manager-fetch-log',
                    payload: {
                        url,
                        method: options.method,
                        requestBody: options.body,
                        status: res.status,
                        response: resText
                    }
                }).then(() => { }).catch(e => console.error("Log insertion failed:", e.message));
            }).catch(e => console.error("Response clone failed:", e.message));
        };

        const setWebhook = async (name: string) => {
            // Estructura requerida específicamente para Evolution API v2.3.0
            const webhookPayload = JSON.stringify({
                webhook: {
                    url: webhookUrl,
                    enabled: true,
                    webhookByEvents: false,
                    events: ["MESSAGES_UPSERT"]
                }
            });

            // Prioridad v2 endpoint
            const urlV2 = `${baseUrl}/webhook/set/${name}`;
            const resV2 = await fetch(urlV2, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: webhookPayload
            });
            logFetch(urlV2, { method: 'POST', body: webhookPayload }, resV2);

            if (resV2.ok) return resV2;

            // Fallback v2 (alternative endpoint structure)
            const urlAlt = `${baseUrl}/webhook/instance/${name}`;
            const resAlt = await fetch(urlAlt, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: webhookPayload
            });
            logFetch(urlAlt, { method: 'POST', body: webhookPayload }, resAlt);
            return resAlt;
        };

        if (action === 'sync_webhook') {
            const res = await setWebhook(instanceName);
            const resData = await res.json().catch(() => ({}));
            return new Response(JSON.stringify({
                status: res.ok ? 'success' : 'fail',
                evolutionStatus: res.status,
                evolutionResponse: resData,
                webhookUrl
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: res.ok ? 200 : res.status,
            });
        }

        if (action === 'get_qr') {
            const stateUrl = `${baseUrl}/instance/connectionState/${instanceName}`;
            const stateResponse = await fetch(stateUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const stateData = await stateResponse.json();

            // IDEMPOTENCIA: Si ya está conectado, verificamos y configuramos webhook una única vez.
            if (stateData?.instance?.state === 'open') {
                const { data: tenant } = await supabase.from('tenants').select('whatsapp_status').eq('id', tenant_id).single();

                // Solo disparamos sincronización si no estaba marcado como conectado previamente
                if (tenant?.whatsapp_status !== 'connected') {
                    await setWebhook(instanceName);
                    await supabase.from('tenants').update({ whatsapp_status: 'connected' }).eq('id', tenant_id);
                }

                return new Response(JSON.stringify({ ...stateData, status: 'connected' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Si no está conectado, procedemos a obtener QR/conectar
            const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
            const res = await fetch(connectUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const data = await res.json();
            return new Response(JSON.stringify(data), {
                status: res.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

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

        if (action === 'logout') {
            await Promise.all([
                fetch(`${baseUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY } }),
                fetch(`${baseUrl}/instance/delete/${instanceName}`, { method: 'DELETE', headers: { 'apikey': EVOLUTION_KEY } })
            ]);

            await supabase.from('tenants').update({
                whatsapp_status: 'disconnected',
                whatsapp_instance: null
            }).eq('id', tenant_id);

            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'debug_instance') {
            const [instRes, webRes] = await Promise.all([
                fetch(`${baseUrl}/instance/fetchInstances?instanceName=${instanceName}`, { headers: { 'apikey': EVOLUTION_KEY } }),
                fetch(`${baseUrl}/webhook/instance/${instanceName}`, { headers: { 'apikey': EVOLUTION_KEY } })
            ]);

            return new Response(JSON.stringify({
                instance: await instRes.json().catch(() => 'error'),
                webhooks: await webRes.json().catch(() => 'error'),
                config: { baseUrl, webhookUrl }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        throw new Error('Action not implemented');

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
