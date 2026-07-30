/**
 * CORS compartido por las Edge Functions que llama el navegador.
 *
 * Los orígenes permitidos se configuran vía `APP_URL` (coma-separada). El dominio
 * de producción está incluido por defecto para que un `APP_URL` mal cargado no
 * deje al frontend sin CORS.
 *
 * Antes este bloque estaba copiado literalmente en cinco funciones, con el dominio
 * hardcodeado en cada copia: cambiar de dominio implicaba editar y redeployar cinco
 * archivos, con el riesgo de que alguno quedara atrás.
 *
 * Las funciones server-to-server (`chat-webhook`, `mp-webhook`,
 * `cleanup-orphaned-files`) NO deben usar esto: las llaman Evolution API,
 * MercadoPago y pg_cron, que no envían `Origin` ni hacen preflight.
 */
const ALLOWED_ORIGINS = [
  "https://dashboard.dentaldash.cloud",
  ...(Deno.env.get("APP_URL") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")),
].filter(Boolean);

/** Headers por defecto: los que manda supabase-js con una sesión autenticada. */
const DEFAULT_ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

/**
 * @param origin  El header `Origin` de la request (puede ser null).
 * @param headers Lista de `Access-Control-Allow-Headers`. Los endpoints públicos
 *                que no reciben `Authorization` pasan solo `"content-type"`.
 */
export function buildCors(
  origin: string | null,
  headers = DEFAULT_ALLOWED_HEADERS,
): Record<string, string> {
  // Un origen no permitido recibe el primero de la allowlist, que el navegador
  // rechazará por no coincidir: falla cerrado sin exponer `*`.
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? "");

  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
