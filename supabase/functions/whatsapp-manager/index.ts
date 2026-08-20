
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { buildCors } from "../_shared/cors.ts"
import { HARDENED_SETTINGS, sanitizeUrl, setInstanceSettings } from "../_shared/evolution.ts"
import { checkFeature } from "../_shared/features.ts"

// Acciones que ponen en marcha (o mantienen viva) la integración de WhatsApp.
// Son las que consumen una instancia de Evolution y habilitan al bot a gastar
// tokens de OpenAI, así que son las que exigen tener `whatsapp_bot` en el plan.
//
// `logout` queda deliberadamente afuera: alguien que bajó de plan tiene que
// poder desconectar su instancia. Bloquearle la salida sería dejarlo atado a un
// servicio que ya no le corresponde.
const WHATSAPP_PAID_ACTIONS = new Set(['create', 'get_qr', 'sync_webhook', 'debug_instance']);

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
        // Acciones globales de admin: no llevan tenant_id.
        const isBulkWebhookSync = action === 'sync_webhook_all';
        const isBulkSettingsSync = action === 'sync_settings_all';
        const isBulkSync = isBulkWebhookSync || isBulkSettingsSync;
        if (!action) {
            return new Response(JSON.stringify({ error: "Missing action" }), { status: 400, headers: corsHeaders });
        }
        if (!isBulkSync && !tenant_id) {
            return new Response(JSON.stringify({ error: "Missing tenant_id" }), { status: 400, headers: corsHeaders });
        }

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

        // El plan tiene que incluir el bot. Hasta ahora este control existía sólo
        // en `SettingsView` (tab bloqueado con UpgradePrompt), así que invocar esta
        // función directamente con un JWT válido alcanzaba para levantar la
        // instancia sin pagarla. Las acciones globales ya validaron contra
        // `admin_users` arriba y no pasan por acá.
        if (!isBulkSync && WHATSAPP_PAID_ACTIONS.has(action)) {
            const check = await checkFeature(supabase, user.id, 'whatsapp_bot');
            if (!check.allowed) {
                return new Response(
                    JSON.stringify({
                        status: 'error',
                        instanceName: null,
                        qr: null,
                        message: 'El bot de WhatsApp no está incluido en tu plan actual.',
                    }),
                    { status: 403, headers: corsHeaders },
                );
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

        /**
         * Ajustes anti-bloqueo de la instancia (ver HARDENED_SETTINGS). Best-effort:
         * si Evolution no los acepta, la instancia sigue funcionando — sólo pierde
         * las mitigaciones, y eso no debe romper el alta ni la reconexión.
         */
        const applyHardening = async (name: string) => {
            const res = await setInstanceSettings({ baseUrl, apiKey: EVOLUTION_KEY }, name);
            if (!res.ok) console.error(`settings/set falló para ${name}: ${res.status} ${res.error ?? ''}`);
            return res;
        };

        // ── Helpers del ciclo de vida de la instancia ─────────────────────────
        // El nombre de instancia es determinista (`instance_<uuid>`), así que una
        // instancia que quedó huérfana en Evolution tras un logout incompleto choca
        // con el siguiente `create` (403 "already in use"). Estos helpers permiten
        // consultar el estado real antes de decidir y devolver siempre la misma forma
        // de respuesta al cliente, en vez del passthrough crudo de Evolution.

        /**
         * Sondea la instancia en Evolution. `known: false` = no se pudo determinar
         * (red caída o 5xx): nunca hay que limpiar la BD ni borrar nada en ese caso,
         * sólo con un 404 explícito sabemos que la instancia no existe.
         */
        type InstanceProbe = { known: boolean; exists: boolean; state: string | null };
        const probeInstance = async (name: string): Promise<InstanceProbe> => {
            try {
                const res = await fetch(`${baseUrl}/instance/connectionState/${name}`, { headers: { 'apikey': EVOLUTION_KEY } });
                if (res.status === 404) return { known: true, exists: false, state: null };
                const body = await res.json().catch(() => null);
                if (!res.ok) {
                    // Antes esto era silencioso: un 401 (apikey inválida) o una URL mal
                    // configurada quedaban indistinguibles de "no sé" sin rastro en los logs.
                    console.error(`connectionState no-ok para ${name}: ${res.status} ${evolutionMessage(body, '')}`);
                    return { known: false, exists: false, state: null };
                }
                return { known: true, exists: true, state: body?.instance?.state ?? null };
            } catch (e: any) {
                console.error(`connectionState failed for ${name}:`, e?.message);
                return { known: false, exists: false, state: null };
            }
        };

        /** Evolution v2 devuelve el QR en varias formas según el endpoint. */
        const extractQr = (d: any): string | null =>
            d?.qrcode?.base64 ?? d?.qrcode?.code ?? d?.base64 ?? d?.code ?? null;

        /**
         * Los fallos de Evolution se devuelven con 200 + `status: 'error'`: `supabase-js`
         * envuelve cualquier no-2xx en un error genérico sin exponer el body, así que un
         * status HTTP crudo le impediría al cliente mostrar el motivo real.
         */
        const okResponse = (payload: Record<string, unknown>) =>
            new Response(JSON.stringify(payload), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });

        /** Aplana el `response.message` de Evolution (a veces array) a un string legible. */
        const evolutionMessage = (d: any, fallback: string): string => {
            const raw = d?.response?.message ?? d?.message ?? d?.error;
            if (Array.isArray(raw)) return raw.join(' ');
            if (typeof raw === 'string' && raw) return raw;
            return fallback;
        };

        const updateProfile = async (patch: Record<string, unknown>) => {
            const { error } = await supabase.from('profiles').update(patch).eq('id', tenant_id);
            if (error) console.error(`profiles update failed for ${tenant_id}:`, error.message);
        };

        /** DELETE tolerante: un 404 significa que ya no existe, que es el objetivo. */
        const tryDelete = async (path: string, name: string): Promise<boolean> => {
            try {
                const res = await fetch(`${baseUrl}/instance/${path}/${name}`, {
                    method: 'DELETE',
                    headers: { 'apikey': EVOLUTION_KEY }
                });
                return res.ok || res.status === 404;
            } catch (e: any) {
                console.error(`${path} failed for ${name}:`, e?.message);
                return false;
            }
        };

        /** Las dos acciones bulk recorren el mismo universo de instancias. */
        const listInstances = async (): Promise<string[]> => {
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, whatsapp_instance')
                .not('whatsapp_instance', 'is', null);

            if (profilesError) throw profilesError;
            return (profiles ?? []).map((row: any) => row.whatsapp_instance as string);
        };

        // Re-registra el webhook de TODAS las instancias existentes. Se usa después de
        // rotar CHAT_WEBHOOK_SECRET o al migrar la URL del webhook, para que ningún
        // tenant quede con una URL vieja que `chat-webhook` rechace con 401.
        if (isBulkWebhookSync) {
            const instances = await listInstances();
            const failed: { instance: string; status: number }[] = [];
            let ok = 0;

            for (const name of instances) {
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
                total: instances.length,
                ok,
                failed,
                webhookUrl: webhookUrlMasked
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Aplica los ajustes anti-bloqueo a TODAS las instancias existentes. Va en un
        // bloque aparte de `sync_webhook_all` a propósito: esa acción es un paso del
        // runbook de rotación de CHAT_WEBHOOK_SECRET y tiene que seguir haciendo
        // exactamente una cosa.
        if (isBulkSettingsSync) {
            const instances = await listInstances();
            const failed: { instance: string; status: number }[] = [];
            let ok = 0;

            for (const name of instances) {
                const res = await applyHardening(name);
                if (res.ok) ok++;
                else failed.push({ instance: name, status: res.status });
            }

            await Promise.allSettled(logPromises);
            return new Response(JSON.stringify({
                total: instances.length,
                ok,
                failed,
                settings: HARDENED_SETTINGS
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
            const probe = await probeInstance(instanceName);

            // IDEMPOTENCIA: Si ya está conectado, verificamos y configuramos webhook una única vez.
            if (probe.state === 'open') {
                const { data: tenant } = await supabase
                    .from('profiles').select('whatsapp_status').eq('id', tenant_id).maybeSingle();

                // Solo disparamos sincronización si no estaba marcado como conectado previamente
                if (tenant?.whatsapp_status !== 'connected') {
                    await setWebhook(instanceName);
                    await applyHardening(instanceName);
                    await updateProfile({ whatsapp_instance: instanceName, whatsapp_status: 'connected' });
                }

                await Promise.allSettled(logPromises);
                return okResponse({ status: 'connected', instanceName, qr: null });
            }

            // La instancia desapareció de Evolution (p. ej. borrada por un logout previo):
            // se limpia el perfil acá para que un reload no rehidrate un `connecting` zombi.
            if (probe.known && !probe.exists) {
                await updateProfile({ whatsapp_status: 'disconnected', whatsapp_instance: null });
                await Promise.allSettled(logPromises);
                return okResponse({ status: 'disconnected', instanceName, qr: null });
            }

            // Si no está conectado, procedemos a obtener QR/conectar
            const connectUrl = `${baseUrl}/instance/connect/${instanceName}`;
            const res = await fetch(connectUrl, { headers: { 'apikey': EVOLUTION_KEY } });
            const data = await res.json().catch(() => null);
            await Promise.allSettled(logPromises);

            if (!res.ok) {
                // Ver nota en probeInstance: sin esto, el motivo real del error sólo
                // llegaba al toast del usuario, nunca a los logs del servidor.
                console.error(`get_qr: /instance/connect no-ok para ${instanceName}: ${res.status} ${evolutionMessage(data, '')}`);
                return okResponse({
                    status: 'error',
                    instanceName,
                    qr: null,
                    message: evolutionMessage(data, `Evolution respondió ${res.status} al pedir el QR.`)
                });
            }

            return okResponse({ status: 'connecting', instanceName, qr: extractQr(data) });
        }

        // `create` es idempotente: el nombre de instancia es determinista, así que
        // "Conectar" después de un "Cancelar" apunta siempre al mismo nombre. Si esa
        // instancia sigue viva en Evolution, /instance/create devuelve 403
        // "already in use"; por eso se sondea el estado primero y se reutiliza o se
        // recrea, en vez de propagarle al usuario un error del que no puede salir.
        if (action === 'create') {
            const persistConnecting = async () => {
                await setWebhook(instanceName);
                await applyHardening(instanceName);
                await updateProfile({ whatsapp_instance: instanceName, whatsapp_status: 'connecting' });
            };

            /** Pide un QR nuevo sobre una instancia ya existente. null = no se pudo. */
            const connectExisting = async (): Promise<Response | null> => {
                const res = await fetch(`${baseUrl}/instance/connect/${instanceName}`, { headers: { 'apikey': EVOLUTION_KEY } });
                const data = await res.json().catch(() => null);
                if (!res.ok) return null;
                await persistConnecting();
                return okResponse({ status: 'connecting', instanceName, qr: extractQr(data) });
            };

            const createInstance = async () => {
                const res = await fetch(`${baseUrl}/instance/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
                    body: JSON.stringify({
                        instanceName: instanceName,
                        token: instanceName,
                        qrcode: true,
                        integration: "WHATSAPP-BAILEYS",
                        // En el alta, no después: un /settings/set posterior llega
                        // tarde para `syncFullHistory`, que actúa al conectar.
                        ...HARDENED_SETTINGS
                    })
                });
                return { res, data: await res.json().catch(() => null) };
            };

            const probe = await probeInstance(instanceName);

            // Ya conectado: no hay nada que crear, sólo reconciliar el perfil.
            if (probe.state === 'open') {
                await setWebhook(instanceName);
                await applyHardening(instanceName);
                await updateProfile({ whatsapp_instance: instanceName, whatsapp_status: 'connected' });
                await Promise.allSettled(logPromises);
                return okResponse({ status: 'connected', instanceName, qr: null });
            }

            // Existe pero sin sesión (`connecting`/`close`): reutilizarla pidiéndole un QR.
            if (probe.exists) {
                const reused = await connectExisting();
                if (reused) {
                    await Promise.allSettled(logPromises);
                    return reused;
                }
                // El connect falló: la instancia quedó inservible, se borra y se recrea.
                await tryDelete('logout', instanceName);
                await tryDelete('delete', instanceName);
            }

            let { res, data } = await createInstance();

            // Carrera, o instancia en un estado que connectionState no reporta:
            // borrar y un único reintento antes de darse por vencido.
            if (!res.ok && (res.status === 403 || /already in use/i.test(evolutionMessage(data, '')))) {
                await tryDelete('logout', instanceName);
                await tryDelete('delete', instanceName);
                await new Promise((resolve) => setTimeout(resolve, 500));
                ({ res, data } = await createInstance());

                // Último recurso: si Evolution sigue reclamando el nombre, al menos
                // pedirle el QR de la instancia que quedó.
                if (!res.ok) {
                    const fallback = await connectExisting();
                    if (fallback) {
                        await Promise.allSettled(logPromises);
                        return fallback;
                    }
                }
            }

            await Promise.allSettled(logPromises);

            if (!res.ok) {
                // Ver nota en probeInstance: sin esto, el motivo real del error sólo
                // llegaba al toast del usuario, nunca a los logs del servidor.
                console.error(`create: /instance/create no-ok para ${instanceName}: ${res.status} ${evolutionMessage(data, '')} | baseUrl=${baseUrl}`);
                return okResponse({
                    status: 'error',
                    instanceName,
                    qr: null,
                    message: evolutionMessage(data, `Evolution respondió ${res.status} al crear la instancia.`)
                });
            }

            await persistConnecting();
            return okResponse({ status: 'connecting', instanceName, qr: extractQr(data) });
        }

        // `logout` es lo que ejecutan tanto "Desconectar" como "Cancelar". Los dos
        // DELETE van en secuencia (Evolution v2 espera logout y DESPUÉS delete; en
        // paralelo el delete corre con la sesión viva y deja la instancia huérfana),
        // y el perfil se limpia siempre, incluso si Evolution no responde: quedarse
        // con `whatsapp_instance` seteado bloquearía al usuario en `connecting`.
        if (action === 'logout') {
            await tryDelete('logout', instanceName);
            let cleaned = await tryDelete('delete', instanceName);

            // Verificar que realmente desapareció; si no, un segundo intento.
            const probe = await probeInstance(instanceName);
            if (probe.exists) {
                cleaned = await tryDelete('delete', instanceName);
            } else if (probe.known) {
                cleaned = true;
            }

            await updateProfile({ whatsapp_status: 'disconnected', whatsapp_instance: null });

            await Promise.allSettled(logPromises);
            return okResponse({ status: 'disconnected', instanceName, evolutionCleaned: cleaned });
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

        return new Response(JSON.stringify({ error: `Action not implemented: ${action}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
