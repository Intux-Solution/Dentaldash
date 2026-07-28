// Envio de emails transaccionales via Resend.
//
// Resend expone una API HTTP simple, sin SDK ni dependencias nativas, que es lo que
// necesita Deno en Edge Functions.
//
// Variables de entorno:
//   RESEND_API_KEY    api key de Resend
//   NOTIFY_FROM_EMAIL remitente verificado, ej: "DentalDash <turnos@tu-dominio.com>"
//
// Si falta cualquiera de las dos, el envio se saltea en silencio: una notificacion
// no configurada nunca debe romper la operacion que la disparo.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export type EmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "invalid_recipient" | "api_error"; detail?: string };

/** Validacion minima: evita gastar un request en un valor que claramente no es un email. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("NOTIFY_FROM_EMAIL")?.trim();

  if (!apiKey || !from) return { sent: false, reason: "not_configured" };
  if (!message.to || !looksLikeEmail(message.to)) {
    return { sent: false, reason: "invalid_recipient" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
    });

    if (!res.ok) {
      return { sent: false, reason: "api_error", detail: await res.text() };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: "api_error", detail: String(err) };
  }
}

/** Escapa el texto que se interpola en el HTML del mail. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envoltorio visual comun a todos los mails.
 * Estilos inline: los clientes de correo ignoran las hojas de estilo externas y
 * la mayoria descarta tambien los <style> del <head>.
 */
export function renderEmailLayout(params: {
  heading: string;
  intro: string;
  rows: Array<{ label: string; value: string }>;
  footer?: string;
}): string {
  const rows = params.rows
    .filter((r) => r.value)
    .map(
      (r) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;width:40%;">${escapeHtml(r.label)}</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(r.value)}</td>
        </tr>`,
    )
    .join("");

  return `
<div style="margin:0;padding:24px;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:24px 28px;background-color:#0d9488;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(params.heading)}</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">${escapeHtml(params.intro)}</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${
        params.footer
          ? `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">${escapeHtml(params.footer)}</p>`
          : ""
      }
    </div>
    <div style="padding:16px 28px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado por DentalDash</p>
    </div>
  </div>
</div>`.trim();
}
