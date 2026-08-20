/**
 * Resolucion de la IP del cliente detras del proxy de Supabase.
 *
 * Sin imports a proposito: es un control de seguridad y tiene que poder
 * testearse desde vitest, fuera del runtime de Deno.
 */

/**
 * Devuelve la IP del cliente segun `x-forwarded-for`, o `"unknown"`.
 *
 * ─── Por que el ultimo elemento y no el primero ───────────────────────────
 *
 * `X-Forwarded-For` es una lista que cada proxy amplia agregando **al final**
 * la direccion de quien le hablo. El ultimo elemento lo escribe el proxy de
 * Supabase, que es infraestructura nuestra: es el unico que el cliente no puede
 * falsificar. Todo lo que este mas a la izquierda pudo haberlo puesto el cliente
 * en el request original.
 *
 * Tomando `split(",")[0]`, el rate limiting de `public-booking` (5 reservas por
 * hora, 8 por dia) se saltaba mandando un `X-Forwarded-For: 1.2.3.4` distinto en
 * cada request: alcanzaba con conocer el slug publico de un dentista —un dato
 * que se comparte a proposito— para llenarle la agenda y la lista de pacientes.
 *
 * Si Supabase agregara mas hops por delante de la funcion, este indice hay que
 * revisarlo. La forma de confirmarlo es loguear la cadena completa una vez en
 * produccion y contar los saltos.
 */
export function clientIp(headers: Headers): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain.length ? chain[chain.length - 1] : "unknown";
}
