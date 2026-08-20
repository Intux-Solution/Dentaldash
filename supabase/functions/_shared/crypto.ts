/**
 * Primitivas criptograficas compartidas por las Edge Functions.
 *
 * `timingSafeEqual` vivia solo en `chat-webhook`, asi que `mp-webhook` comparaba
 * la firma de MercadoPago con `===`: dos controles de acceso del mismo sistema
 * con dos niveles de rigor distintos, sin ninguna razon.
 */

/**
 * Compara dos strings en tiempo constante respecto del contenido.
 *
 * Evita filtrar el secreto caracter a caracter midiendo cuanto tarda la
 * comparacion. La diferencia de longitud si es observable — es informacion que
 * el atacante normalmente ya tiene (el largo de un HMAC-SHA256 en hex es fijo).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hex en minusculas del HMAC-SHA256 de `message` con `secret`. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
