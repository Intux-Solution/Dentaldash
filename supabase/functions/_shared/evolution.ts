/**
 * Cliente unificado de Evolution API (self-hosted v2.3.0).
 *
 * Antes cada Edge Function llamaba a Evolution con `fetch` inline: `sanitizeUrl`
 * estaba duplicada byte a byte entre `chat-webhook` y `whatsapp-manager`, y no
 * había reintentos, timeouts ni un lugar donde colgar los ajustes anti-bloqueo.
 *
 * Nota de versión: v2 usa camelCase en los settings de instancia (`groupsIgnore`,
 * `alwaysOnline`, ...). v1 usaba snake_case. Este módulo asume v2.
 */

export interface EvolutionConfig {
    baseUrl: string; // ya saneada, sin barra final ni sufijo /manager
    apiKey: string;
}

export interface EvolutionResult<T = any> {
    ok: boolean;
    /** 0 = error de red o timeout (no hubo respuesta HTTP). */
    status: number;
    data: T | null;
    error?: string;
}

export interface EvolutionRequest {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    /** Reintentos ADICIONALES al primer intento. Default 0. */
    retries?: number;
    timeoutMs?: number;
}

export type PresenceState =
    | "unavailable"
    | "available"
    | "composing"
    | "recording"
    | "paused";

/**
 * Saneamiento de URL para evitar fallos por espacios o saltos de línea. Quita la
 * barra final y el sufijo `/manager` (pegar la URL del panel web es un error
 * frecuente).
 */
export function sanitizeUrl(url: string): string {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "").replace(/\/manager$/, "");
}

/** Lee las env vars de Evolution. Lanza si falta alguna. */
export function evolutionConfigFromEnv(): EvolutionConfig {
    const rawUrl = Deno.env.get("EVOLUTION_API_URL")?.trim();
    const apiKey = Deno.env.get("EVOLUTION_API_KEY")?.trim();
    if (!rawUrl || !apiKey) throw new Error("Missing Evolution Secrets");

    const baseUrl = sanitizeUrl(rawUrl);
    if (!baseUrl) throw new Error("EVOLUTION_API_URL resolved to an empty string after sanitization.");

    return { baseUrl, apiKey };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Solo se reintenta lo que puede ser transitorio. Un 4xx (instancia inexistente,
 * número inválido) no mejora reintentando, y duplicar un saliente es peor que
 * perderlo: es exactamente la señal que dispara los bloqueos.
 */
const isRetryable = (status: number) => status === 0 || status === 429 || status >= 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff con jitter, para no sincronizar reintentos entre isolates. */
const backoffMs = (attempt: number) => (attempt === 0 ? 500 : 1500) + Math.floor(Math.random() * 300);

export async function evolutionFetch<T = any>(
    cfg: EvolutionConfig,
    path: string,
    req: EvolutionRequest = {},
): Promise<EvolutionResult<T>> {
    const { method = "POST", body, retries = 0, timeoutMs = DEFAULT_TIMEOUT_MS } = req;

    const headers: Record<string, string> = { apikey: cfg.apiKey };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let last: EvolutionResult<T> = { ok: false, status: 0, data: null, error: "not attempted" };

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(backoffMs(attempt - 1));

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(`${cfg.baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
            });

            const data = (await res.json().catch(() => null)) as T | null;
            last = {
                ok: res.ok,
                status: res.status,
                data,
                error: res.ok ? undefined : evolutionMessage(data, `Evolution respondió ${res.status}.`),
            };
        } catch (e: any) {
            last = { ok: false, status: 0, data: null, error: e?.name === "AbortError" ? `timeout tras ${timeoutMs}ms` : e?.message };
        } finally {
            clearTimeout(timer);
        }

        if (last.ok || !isRetryable(last.status)) return last;
    }

    return last;
}

/** Aplana el `response.message` de Evolution (a veces array) a un string legible. */
export function evolutionMessage(d: any, fallback: string): string {
    const raw = d?.response?.message ?? d?.message ?? d?.error;
    if (Array.isArray(raw)) return raw.join(" ");
    if (typeof raw === "string" && raw) return raw;
    return fallback;
}

// ─── Mensajería ──────────────────────────────────────────────────────────────

export function sendText(
    cfg: EvolutionConfig,
    instance: string,
    opts: { number: string; text: string; delay?: number; retries?: number; timeoutMs?: number },
): Promise<EvolutionResult> {
    return evolutionFetch(cfg, `/message/sendText/${instance}`, {
        body: { number: opts.number, text: opts.text, delay: opts.delay ?? 0 },
        // Un solo reintento por default: si el primer envío llegó pero se perdió la
        // respuesta HTTP, reintentar duplica el mensaje del lado del paciente.
        retries: opts.retries ?? 1,
        timeoutMs: opts.timeoutMs,
    });
}

/**
 * Presencia ("escribiendo...", "grabando..."). v2.3 espera el cuerpo plano; hay
 * builds 2.x que todavía aceptan la forma v1 con `options`. Se intenta plano y,
 * ante 400/404, se reintenta con el wrapper — mismo patrón de doble intento que
 * ya usa `setWebhook` en whatsapp-manager.
 */
export async function sendPresence(
    cfg: EvolutionConfig,
    instance: string,
    opts: { number: string; presence: PresenceState; delay?: number; timeoutMs?: number },
): Promise<EvolutionResult> {
    const path = `/chat/sendPresence/${instance}`;
    const flat = await evolutionFetch(cfg, path, {
        body: { number: opts.number, presence: opts.presence, delay: opts.delay ?? 0 },
        timeoutMs: opts.timeoutMs,
    });
    if (flat.ok || (flat.status !== 400 && flat.status !== 404)) return flat;

    return evolutionFetch(cfg, path, {
        body: { number: opts.number, options: { presence: opts.presence, delay: opts.delay ?? 0 } },
        timeoutMs: opts.timeoutMs,
    });
}

export function markAsRead(
    cfg: EvolutionConfig,
    instance: string,
    messages: Array<{ remoteJid: string; fromMe: boolean; id: string }>,
): Promise<EvolutionResult> {
    return evolutionFetch(cfg, `/chat/markMessageAsRead/${instance}`, {
        body: { readMessages: messages },
    });
}

// ─── Settings de instancia (anti-bloqueo) ────────────────────────────────────

export interface InstanceSettings {
    rejectCall: boolean;
    msgCall: string;
    groupsIgnore: boolean;
    alwaysOnline: boolean;
    readMessages: boolean;
    readStatus: boolean;
    syncFullHistory: boolean;
}

/**
 * Defaults anti-bloqueo que aplica DentalDash. Cada uno corta una señal concreta
 * de automatización o una fuente de mensajes no solicitados:
 */
export const HARDENED_SETTINGS: InstanceSettings = {
    // Un consultorio no atiende llamadas por el número del bot; rechazarlas evita
    // además que Baileys quede colgado en la señalización de la llamada.
    rejectCall: true,
    msgCall: "Hola! Este número no recibe llamadas. Escribinos por acá y te respondemos.",
    // El filtro que más importa: Evolution ni siquiera emite MESSAGES_UPSERT de
    // grupos, así que el bot no puede responderle a gente que nunca lo contactó.
    groupsIgnore: true,
    // Estar "en línea" las 24 horas es la firma de bot más obvia que existe.
    alwaysOnline: false,
    // Los tildes azules los pone chat-webhook por mensaje, solo cuando corresponde.
    readMessages: false,
    // No mirar los estados/historias de los contactos.
    readStatus: false,
    // Evita la ráfaga de eventos de sincronización al conectar la instancia.
    syncFullHistory: false,
};

/**
 * Aplica los settings de instancia. Igual que `sendPresence`, tolera las dos
 * formas de body que circulan entre builds 2.x.
 */
export async function setInstanceSettings(
    cfg: EvolutionConfig,
    instance: string,
    settings: Partial<InstanceSettings> = {},
): Promise<EvolutionResult> {
    const payload: InstanceSettings = { ...HARDENED_SETTINGS, ...settings };
    const path = `/settings/set/${instance}`;

    const flat = await evolutionFetch(cfg, path, { body: payload, retries: 1 });
    if (flat.ok || (flat.status !== 400 && flat.status !== 404)) return flat;

    return evolutionFetch(cfg, path, { body: { settings: payload }, retries: 1 });
}
