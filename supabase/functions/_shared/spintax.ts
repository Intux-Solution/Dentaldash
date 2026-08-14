/**
 * Spintax mínimo para variar los textos FIJOS que envía el bot.
 *
 * Por qué existe: las respuestas del LLM ya varían por construcción, pero las
 * plantillas (confirmación de turno, aviso fuera de horario) salían idénticas
 * byte a byte en cada envío y entre tenants. Un mismo texto repetido miles de
 * veces es una de las señales más baratas de detectar para un antispam.
 *
 * Sintaxis: "{Hola|Buenas}, {¿cómo va?|¿todo bien?}". Resuelve siempre el grupo
 * MÁS INTERNO, así que el anidamiento "{a|{b|c}}" también funciona.
 */

const INNERMOST_GROUP = /\{([^{}]*)\}/;
const MAX_PASSES = 50;

/**
 * ⚠️ NO aplicar sobre el system prompt del agente: los placeholders `{{x}}` de
 * AGENT_SYSTEM_PROMPT matchean este patrón y perderían las llaves en silencio,
 * rompiendo el reemplazo de `{{nombre_odontologo}}`.
 */
export function spin(template: string): string {
    let out = template;

    for (let i = 0; i < MAX_PASSES && INNERMOST_GROUP.test(out); i++) {
        out = out.replace(INNERMOST_GROUP, (_match, body: string) => {
            const options = body.split("|");
            return options[Math.floor(Math.random() * options.length)];
        });
    }

    return out;
}

/** Elige un elemento al azar. Para variantes que son frases enteras. */
export function pick<T>(options: readonly T[]): T {
    return options[Math.floor(Math.random() * options.length)];
}
