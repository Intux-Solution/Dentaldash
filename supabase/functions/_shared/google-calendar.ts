// Acceso a Google Calendar desde Edge Functions.
//
// Todo el flujo corre server-side con service role y el `google_refresh_token` que
// vive en `profiles`. Es el unico camino confiable: el `provider_token` del browser
// es efimero (se pierde al recargar) y solo existe si el usuario entro por el redirect
// de Google, asi que la sincronizacion desde el front fallaba en silencio para
// cualquiera que hubiera iniciado sesion con email/password.
//
// Este modulo lo comparten `calendar-sync`, `public-booking` y `chat-webhook`.

export const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  attendeeEmail?: string | null;
}

export interface BusyInterval {
  start: string;
  end: string;
}

/** Motivo por el que no se pudo sincronizar. `not_connected` no es un error. */
export type SyncFailure = "not_connected" | "not_configured" | "auth_failed" | "api_error";

/**
 * Obtiene un access token de Google para el usuario dado.
 * Devuelve `null` si la integracion no esta configurada o el usuario no la conecto.
 */
export async function getAccessTokenForUser(
  supabase: any,
  userId: string,
): Promise<{ token: string } | { error: SyncFailure; detail?: string }> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { error: "not_configured" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("google_refresh_token")
    .eq("id", userId)
    .maybeSingle();

  const refreshToken = profile?.google_refresh_token;
  if (!refreshToken) return { error: "not_connected" };

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Un refresh token revocado desde la cuenta de Google no se recupera solo:
    // limpiarlo evita reintentar en cada turno y deja la UI mostrando "desconectado".
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from("profiles")
        .update({ google_refresh_token: null })
        .eq("id", userId);
      return { error: "not_connected", detail };
    }
    return { error: "auth_failed", detail };
  }

  const data = await res.json();
  if (!data?.access_token) return { error: "auth_failed" };
  return { token: data.access_token };
}

function buildEventBody(event: CalendarEventInput) {
  return {
    summary: event.title,
    description: event.description ?? "",
    start: { dateTime: event.startTime, timeZone: AR_TIMEZONE },
    end: { dateTime: event.endTime, timeZone: AR_TIMEZONE },
    attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : [],
  };
}

/**
 * Crea el evento en el calendario principal.
 *
 * `sendUpdates=all` hace que Google le mande la invitacion por mail al paciente
 * (va como attendee), sin necesidad de un proveedor de email propio.
 */
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<{ id: string } | { error: SyncFailure; detail?: string }> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(event)),
    },
  );

  if (!res.ok) return { error: "api_error", detail: await res.text() };

  const created = await res.json();
  if (!created?.id) return { error: "api_error", detail: "Google no devolvió un id de evento." };
  return { id: created.id };
}

/** Actualiza un evento existente. */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<{ ok: true } | { error: SyncFailure; detail?: string }> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildEventBody(event)),
    },
  );

  if (!res.ok) return { error: "api_error", detail: await res.text() };
  return { ok: true };
}

/** Elimina un evento. Un 404/410 se considera exito: el evento ya no esta. */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<{ ok: true } | { error: SyncFailure; detail?: string }> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (res.ok || res.status === 404 || res.status === 410) return { ok: true };
  return { error: "api_error", detail: await res.text() };
}

/**
 * Franjas ocupadas del usuario en un rango, consultando TODOS sus calendarios.
 *
 * Mirar solo `primary` dejaba pasar las reuniones cargadas en calendarios
 * secundarios (laboral, compartido), que entonces no bloqueaban el horario y el
 * turno se ofrecia igual.
 *
 * freeBusy devuelve solo intervalos ocupados, sin titulos ni asistentes: alcanza
 * para bloquear y no expone el contenido de la agenda.
 */
export async function getBusyIntervals(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<{ busy: BusyInterval[] } | { error: SyncFailure; detail?: string }> {
  const listRes = await fetch(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&fields=items(id,selected,primary)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!listRes.ok) return { error: "api_error", detail: await listRes.text() };

  const list = await listRes.json();
  const calendarIds: string[] = (list?.items ?? [])
    .filter((c: any) => c?.id && (c.primary || c.selected !== false))
    .map((c: any) => c.id);

  const ids = calendarIds.length > 0 ? calendarIds : ["primary"];

  // freeBusy admite hasta 50 calendarios por request.
  const busyRes = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: AR_TIMEZONE,
      items: ids.slice(0, 50).map((id) => ({ id })),
    }),
  });

  if (!busyRes.ok) return { error: "api_error", detail: await busyRes.text() };

  const data = await busyRes.json();
  const busy: BusyInterval[] = [];
  for (const calendar of Object.values<any>(data?.calendars ?? {})) {
    for (const slot of calendar?.busy ?? []) {
      if (slot?.start && slot?.end) busy.push({ start: slot.start, end: slot.end });
    }
  }
  return { busy };
}
