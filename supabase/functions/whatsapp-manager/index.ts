
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { buildCors } from "../_shared/cors.ts"

/**
 * Saneamiento de URL para evitar fallos por espacios o saltos de línea.
 */
const sanitizeUrl = (url: string) => {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "").replace(/\/manager$/, "");
};

serve(async (req) => {
    // La llama el navegador autenticado: misma allowlist que el resto de la app,
    // en vez del `*` que tenía antes.
    const corsHeaders = buildCors(req.headers.get('origin'));

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.trim();
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const EVOLUTION_URL_RAW = Deno.env.get('EVOLUTION_API_URL')?.trim();
    const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY')?.trim();
    const CHAT_WEBHOOK_SECRET = Deno.env.get('CHAT_WEBHOOK_SECRET')?.trim();

    // ── Fail-fast env validation ──────────────────────────────────────────────
    // Any missing critical variable returns a 500 immediately with a clear
    // message that will show verbatim in the Supabase Edge Function logs.
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: "Missing Supabase configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." }), { status: 500, headers: corsHeaders });
    }
    if (!EVOLUTION_URL_RAW) {
        return new Response(JSON.stringify({ error: "Missing environment variable: EVOLUTION_API_URL is required but was not set." }), { status: 500, headers: corsHeaders });
    }
    if (!EVOLUTION_KEY) {
        return new Response(JSON.stringify({ error: "Missing environment variable: EVOLUTION_API_KEY is required but was not set." }), { status: 500, headers: corsHeaders });
    }
    // Sin el secreto no se puede registrar un webhook que `chat-webhook` acepte
    // (esa función es fail-closed): mejor fallar acá que dejar instancias mudas.
    if (!CHAT_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Missing environment variable: CHAT_WEBHOOK_SECRET is required but was not set." }), { status: 500, headers: corsHeaders });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const body = await req.json();
        const { action, tenant_id } = body;
        // `sync_webhook_all` es una acción global de admin: no lleva tenant_id.
        const isBulkSync = action === 'sync_webhook_all';
        if (!action) throw new Error('Missing action');
        if (!isBulkSync && !tenant_id) throw new Error('Missing action or tenant_id');

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
        // Since it's a 1:1 user-to-profile setup, we just check if tenant_id matches user.id
        if (!isBulkSync && tenant_id !== user.id) {
            return new Response(JSON.stringify({ error: "Forbidden: You don't own this profile." }), { status: 403, headers: corsHeaders });
        }

        // La acción global sólo la puede ejecutar un admin (mismo patrón que admin-api).
        if (isBulkSync) {
            const { data: adminRow } = await supabase
                .from('admin_users')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (!adminRow) {
                return new Response(JSON.stringify({ error: "Forbidden: admin only." }), { status: 403, headers: corsHeaders });
            }
        }

        // Reusar el nombre ya persistido: instancias creadas antes de este fix usaban
        // solo los primeros 8 caracteres del UUID (riesgo de colisión entre tenants
        // cuyo UUID comparte ese prefijo). Sólo se genera un nombre NUEVO —con el UUID
        // completo, sin guiones— cuando el tenant todavía no tiene ninguna instancia
        // guardada; `chat-webhook` hace el lookup del tenant por igualdad contra
        // `profiles.whatsapp_instance`, así que esto es retrocompatible sin migrar nada.
        let instanceName = '';
        if (!isBulkSync) {
            const { data: tenantProfile } = await supabase
                .from('profiles')
                .select('whatsapp_instance')
                .eq('id', tenant_id)
                .maybeSingle();
            instanceName = tenantProfile?.whatsapp_instance || `instance_${tenant_id.replace(/-/g, '')}`;
        }
        const baseUrl = sanitizeUrl(EVOLUTION_URL_RAW);
        // El secreto viaja en la query string porque Evolution API self-hosted v2 no
        // soporta headers custom en el webhook. `chat-webhook` lo valida fail-closed.
        const webhookUrl = `${SUPABASE_URL}/functions/v1/chat-webhook?s=${encodeURIComponent(CHAT_WEBHOOK_SECRET)}`;
        // Versión segura para devolver al cliente / loguear, sin filtrar el secreto.
        const webhookUrlMasked = `${SUPABASE_URL}/functions/v1/chat-webhook?s=***`;

        // baseUrl is guaranteed non-empty here (validated above), but keep the guard for safety
        if (!baseUrl) throw new Error("EVOLUTION_API_URL resolved to an empty string after sanitization.");

        const logPromises: Promise<any>[] = [];

        /**
         * Optimiza la eficiencia guardando logs de forma asíncrona (best-effort).
         */
        const logFetch = (url: string, options: any, res: Response) => {
            // Solo loguear a debug_payloads si DEBUG_LOGS=true (evita crecimiento sin límite en prod)
            if (Deno.env.get('DEBUG_LOGS') !== 'true') return;
            // Intentamos clonar y procesar sin bloquear el flujo principal
            const p = res.clone().text().then(resText => {
                return supabase.from('debug_payloads').insert({
                    function_name: 'whatsapp-manager-fetch-log',
                    payload: {
                        url,
                        method: options.method,
                        requestBody: options.body,
                        status: res.status,
                        response: resText
                    }
                }).catch(e => console.error("Log insertion failed:", e.message));
            }).catch(e => console.error("Response clone failed:", e.message));
            logPromises.push(p);
        };

        const setWebhook = async (name: string) => {
            // Estructura requerida específicamente para Evolution API v2.3.0
            const buildPayload = (url: string) => JSON.stringify({
                webhook: {
                    url,
                    enabled: true,
                    webhookByEvents: false,
                    events: ["MESSAGES_UPSERT"]
                }
            });
            const webhookPayload = buildPayload(webhookUrl);
            // Nunca escribir el secreto en debug_payloads.
            const webhookPayloadMasked = buildPayload(webhookUrlMasked);

            // Prioridad v2 endpoint
            const urlV2 = `${baseUrl}/webhook/set/${name}`;
            const resV2 = await fetch(urlV2, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: webhookPayload
            });
            logFetch(urlV2, { method: 'POST', body: webhookPayloadMasked }, resV2);

            if (resV2.ok) return resV2;

            // Fallback v2 (alternative endpoint structure)
            const urlAlt = `${baseUrl}/webhook/instance/${name}`;
            const resAlt = await fetch(urlAlt, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                body: webhookPayload
            });
            logFetch(urlAlt, { method: 'POST', body: webhookPayloadMasked }, resAlt);
            return resAlt;
        };

        // Re-registra el webhook de TODAS las instancias existentes. Se usa después de
        // rotar CHAT_WEBHOOK_SECRET o al migrar la URL del webhook, para que ningún
        // tenant quede con una URL vieja que `chat-webhook` rechace con 401.
        if (isBulkSync) {
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, whatsapp_instance')
                .not('whatsapp_instance', 'is', null);

            if (profilesError) throw profilesError;

            const failed: { instance: string; status: number }[] = [];
            let ok = 0;

            for (const row of profiles ?? []) {
                const name = row.whatsapp_instance as string;
                try {
                    const res = await setWebhook(name);
                    if (res.ok) ok++;
                    else failed.push({ instance: name, status: res.status });
                } catch (e: any) {
                    console.error(`sync_webhook_all failed for ${name}:`, e?.message);
                    failed.push({ instance: name, status: 0 });
                }
            }

            await Promise.allSettled(logPromises);
            return new Response(JSON.stringify({
                total: profiles?.length ?? 0,
                ok,
                failed,
                webhookUrl: webhookUrlMasked
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        if (action === 'sync_webhook') {
            const res = await setWebhook(instanceName);
            const resData = await res.json().catch(() => ({}));
            await Promise.allSettled(logPromises);
            return new Response(JSON.stringify({
                status: res.ok ? 'success' : 'fail',
                evolutionStatus: res.status,
                evolutionResponse: resData,
                webhookUrl: webhookUrlMasked
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
                const { data: tenant } = await supabase.from('profiles').select('whatsapp_status').eq('id', tenant_id).single();

                // Solo disparamos sincronización si no estaba marcado como conectado previamente
                if (tenant?.whatsapp_status !== 'connected') {
                    await setWebhook(instanceName);
                    await supabase.from('profiles').update({ whatsapp_status: 'connected' }).eq('id', tenant_id);
                }

                await Promise.allSettled(logPromises);
                return new Response(JSON.stringify({ ...stateData, status: 'connected' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Si no está conectado, procedemos a obtener QR/conectar
            const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
            const res = await fetch(connectUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const data = await res.json();
            await Promise.allSettled(logPromises);
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
                await supabase.from('profiles').update({
                    whatsapp_instance: instanceName,
                    whatsapp_status: 'connecting'
                }).eq('id', tenant_id);
            }

            await Promise.allSettled(logPromises);
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

            await supabase.from('profiles').update({
                whatsapp_status: 'disconnected',
                whatsapp_instance: null
            }).eq('id', tenant_id);

            await Promise.allSettled(logPromises);
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

            // La config que devuelve Evolution incluye la URL completa del webhook
            // (con el secreto en la query string): se redacta antes de exponerla.
            const redactSecret = (value: unknown): unknown =>
                typeof value === 'string'
                    ? value.replace(/([?&]s=)[^&]*/g, '$1***')
                    : value;
            const webhooksRaw = await webRes.json().catch(() => 'error');
            const webhooksSafe = JSON.parse(
                JSON.stringify(webhooksRaw ?? null, (_k, v) => redactSecret(v))
            );

            await Promise.allSettled(logPromises);
            return new Response(JSON.stringify({
                instance: await instRes.json().catch(() => 'error'),
                webhooks: webhooksSafe,
                config: { baseUrl, webhookUrl: webhookUrlMasked }
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
