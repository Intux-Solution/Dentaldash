# Soluciones — problemas detectados el 2026-07-27

Los 10 problemas reportados **no son 10 problemas independientes**: se agrupan en 5 causas raíz.
Este documento tiene un prompt autocontenido por problema, listo para pegar en una sesión nueva.

| # | Problema reportado | Categoría | Estado |
|---|---|---|---|
| 1 | Foto de perfil por defecto | A — Deploy/caché | ✅ Ya en código · verificar tras deploy |
| 2 | Quitar barra de scroll horizontal, agregar flechita | A — Deploy/caché | ✅ Ya en código · verificar tras deploy |
| 3 | WhatsApp al último | A — Deploy/caché | ✅ Ya resuelto |
| 4 | Unir Link de Reserva con Perfil | A — Deploy/caché | ✅ Ya resuelto |
| 7 | "Este contenido está bloqueado" al ver un PDF | B — Documentos | ✅ Implementado |
| 8 | No adjunta el PDF en consentimiento | B — Documentos | ✅ Implementado |
| 5 | No bloqueó una reunión y mostró el horario igual | C — Google Calendar | ✅ Implementado |
| 6 | No sincroniza turnos del dashboard con Google Calendar | C — Google Calendar | ✅ Implementado |
| 9 | Notificar al médico y al paciente cuando se agenda | D — Notificaciones | ✅ Implementado (falta alta en Resend) |
| 10 | Downgrade de plan no debería volver a cobrar | E — Suscripciones | ✅ Implementado |

> **Los prompts de abajo documentan la causa raíz de cada problema y el fix aplicado.**
> Lo que queda es el despliegue: ver "Qué falta para que esto llegue a producción" al final.

---

## Categoría A — Deploy y caché del navegador

> **Puntos 1, 2, 3 y 4.** Los cuatro ya están implementados en el commit `7c1f6a4` (27/07/2026):
> `src/components/Avatar.tsx` (fallback a iniciales sobre color determinístico),
> `src/components/settings/SettingsTabs.tsx` (`no-scrollbar` + flechas Chevron),
> `SettingsView.tsx:57` (WhatsApp último) y `SettingsView.tsx:113-129` (BookingLinkTab dentro de Perfil).
>
> El motivo por el que no se veían: `nginx.conf` no mandaba `Cache-Control` para `index.html`
> mientras los assets tienen `expires 1y`. El navegador aplicaba frescura heurística y seguía
> cargando los bundles de la build anterior.

### Prompt A0 — Cache busting del deploy *(YA APLICADO)*

```
En nginx.conf, el bloque `location /` no fija Cache-Control, así que index.html
—el único archivo sin hash en el nombre— queda cacheado por el navegador y sigue
apuntando a los bundles viejos después de cada deploy.

Agregar dentro de `location /`:
  add_header Cache-Control "no-cache, must-revalidate" always;
  include /etc/nginx/security-headers.conf;

El include repetido es obligatorio: en nginx un add_header en un bloque hijo
cancela la herencia de los del padre (ya documentado en security-headers.conf:3-6).

Aceptación: `curl -I https://<dominio>/` devuelve el Cache-Control nuevo y todos
los headers de seguridad.
```

### Prompt A1 — Foto de perfil por defecto *(verificar primero)*

```
Rehacer el deploy y probar con Ctrl+Shift+R. Si el avatar sigue apareciendo mal:

1. src/components/Avatar.tsx:34-41 — el <img> no lleva referrerPolicy="no-referrer".
   Google devuelve 403 en las fotos de OAuth (lh3.googleusercontent.com) cuando el
   Referrer-Policy manda origen, y el componente cae al fallback de iniciales.
   Agregar referrerPolicy="no-referrer".

2. src/utils/avatar.ts:15 usa supabase.storage.from('avatars').getPublicUrl(). Verificar
   en Supabase que el bucket `avatars` sea PÚBLICO; si es privado, toda foto subida
   devuelve 400 y nunca se ve. Si es privado, migrar a createSignedUrl.

3. src/components/PatientProfileModal.tsx:186 arma su propio header de avatar en vez
   de usar el componente Avatar. Unificarlo.

Aceptación: usuario sin foto → iniciales sobre color; usuario con foto de Google → se
ve la foto; usuario con foto subida → se ve la foto.
```

### Prompt A2 — Barra de scroll horizontal + flechita *(verificar primero)*

```
Los tabs de Configuración ya usan src/components/settings/SettingsTabs.tsx, que oculta
la barra con la utilidad `.no-scrollbar` (src/index.css:5-14) y muestra flechas
ChevronLeft/ChevronRight condicionales. Verificar con hard refresh.

Si la queja apuntaba a otro lado, los que SÍ siguen con barra horizontal visible son:
  - src/components/AdminView.tsx:267-282 — los tabs del panel admin no tienen scroller
    ni flechas y se desbordan en móvil.
  - src/components/PatientTable.tsx:37 — <div className="overflow-x-auto"> de la tabla
    de pacientes; es la barra más visible de la app.
  - src/components/AdminView.tsx:309/472/523 y OdontogramView.tsx:126/330.

Extraer el patrón de SettingsTabs a un componente genérico ScrollableTabs y aplicarlo
a AdminView. Para PatientTable, agregar `.no-scrollbar` + flechas o pasar a tarjetas
en viewport chico.

Aceptación: en móvil no se ve barra de scroll gris y aparecen flechitas al desbordar.
```

### Prompt A3 y A4 — WhatsApp al último / Link de reserva en Perfil

```
Ambos YA ESTÁN RESUELTOS. No requieren cambios de código:

- SettingsView.tsx:50-58 — el array TABS termina en { key: 'whatsapp', label: 'WhatsApp' }.
- SettingsView.tsx:113-129 — el tab 'profile' renderiza <ProfileTab/> seguido de
  <BookingLinkTab/>; ya no existe un tab 'booking' propio y SettingsView.tsx:62-66
  normaliza los links viejos con ?tab=booking a 'profile'.

Solo verificar en producción tras el fix de caché.
```

---

## Categoría B — Visualización y adjunto de documentos

### Prompt B1 — "Este contenido está bloqueado" al ver un PDF (punto 7) *(YA APLICADO)*

```
Causa raíz: security-headers.conf:15 tenía `object-src 'none'`. Chrome renderiza un
<iframe src="*.pdf"> mediante un plugin document interno que se valida contra la
directiva object-src del documento embebedor; con 'none' el visor nunca carga y
aparece "Este contenido está bloqueado. Para solucionar el problema, ponte en
contacto con el propietario del sitio web".

Afecta a src/components/ConsentimientoModal.tsx:239 y ClinicalRecordModal.tsx:246.
No era frame-src: esa directiva ya permitía https://*.supabase.co.

Fix: object-src 'self' blob: https://*.supabase.co

Aceptación: abrir un consentimiento y una historia clínica en PDF → se ven inline en
desktop, sin violaciones de CSP en la consola.
```

### Prompt B2 — Servir el PDF como blob (robustez)

```
Depender del origen *.supabase.co dentro de un <iframe> es frágil: las signed URLs
expiran a la hora y cualquier cambio de headers del lado de Supabase rompe la vista.

1. En src/services/StorageService.ts, junto a getSignedUrl() (líneas 39-76), agregar:
     static async downloadAsObjectUrl(bucket, path): Promise<string>
   que use supabase.storage.from(bucket).download(path) y devuelva URL.createObjectURL(blob).

2. ConsentimientoModal.tsx y ClinicalRecordModal.tsx usan esa URL blob: en el <iframe>
   y llaman a URL.revokeObjectURL en el cleanup del efecto. frame-src y object-src ya
   incluyen blob:.

3. Mantener el <a target="_blank"> con la signed URL para descargar/abrir en pestaña.

Aceptación: el PDF se ve aunque pase más de una hora con el modal abierto; sin fugas
de object URLs al cerrar y reabrir.
```

### Prompt B3 — "No adjunta el PDF en consentimiento" (punto 8)

```
El archivo SÍ se sube y SÍ se guarda en patients.consentimiento_url. Lo que falla es
lo que ve el usuario. Cuatro bugs reales:

1. RACE CONDITION que borra el preview — src/hooks/usePatientModals.tsx:112-121.
   Tras el upload, handleRefresh (128-141) setea el paciente fresco vía getPatientById,
   pero ese useEffect lo pisa con la fila stale de la lista de React Query (el
   invalidate todavía no resolvió) → ConsentimientoModal.tsx:45-58 resetea localRawUrl
   a "" y la UI muestra "No hay consentimiento adjunto" (línea 213) con el archivo ya
   subido. Es intermitente. Fix: no sobrescribir selectedPatient con datos más viejos
   (comparar updated_at) o suspender la re-sincronización mientras hay un refresh en vuelo.

2. MIME VACÍO — src/services/PatientService.ts:156 rechaza el archivo si file.type no
   está en ALLOWED_MIME_TYPES (33-39). En Windows sin asociación registrada, file.type
   llega "" o application/octet-stream y un PDF legítimo se rechaza con "Tipo de archivo
   no permitido". Fix: fallback por extensión cuando file.type venga vacío.

3. PATH DE 3 SEGMENTOS — uploadConsentimiento (PatientService.ts:150-168) usa
   `${userId}/consentimientos/${fileName}` mientras uploadClinicalRecord (línea 187) usa
   `${userId}/${fileName}`. Las policies del bucket clinical-records NO están en
   supabase/migrations/ (viven en el dashboard). Verificarlas: si restringen al primer
   nivel, el consentimiento falla con RLS y la historia clínica no. Efecto colateral:
   cleanup-orphaned-files/index.ts:64-99 lista un solo nivel y nunca ve la subcarpeta
   (esos archivos huérfanos no se limpian nunca).

4. ERROR TRAGADO — ClinicalRecordModal.tsx:143 hace .update() sin .eq('user_id', ...) y
   sin chequear `error`. Normalizar con el patrón correcto de ConsentimientoModal.tsx:132-138.

Aceptación: subir un PDF → se ve inmediatamente; cerrar y reabrir el modal → sigue ahí;
subir un archivo con file.type vacío → se acepta; un update fallido muestra un error.
```

---

## Categoría C — Google Calendar

> **Puntos 5 y 6, misma causa raíz.** La integración corre en el navegador y falla en
> silencio absoluto. Las Edge Functions (`public-booking`, `chat-webhook`) sí funcionan
> porque usan service role + `profiles.google_refresh_token` + `GOOGLE_CLIENT_ID/SECRET`
> de env. El front depende de `session.provider_token` (efímero, se pierde al recargar)
> y de tres capas de caché de módulo.

### Prompt C1 — Los turnos del dashboard no llegan a Google Calendar (punto 6)

```
Traza del fallo silencioso:
  - GoogleCalendarService.ts:288-292 — createEvent captura el error y hace `return null`.
    El try/catch de AppointmentService.ts:141-157 nunca se dispara: googleEvent queda
    null, se saltea el if y el turno se guarda sin google_event_id, sin ningún aviso.
  - GoogleCalendarService.ts:183-191 — sin token, fetchWithAuth devuelve un Response
    sintético 401 en vez de lanzar.
  - AuthContext.tsx:39-47 — google_refresh_token solo se persiste si la sesión trajo
    provider_refresh_token (redirect OAuth con access_type=offline&prompt=consent).
    Quien entró con email/password nunca sincroniza y la UI no lo dice.
  - AppointmentRepository.ts:159-172 — el reintento diferido filtra .eq('status','confirmed'),
    así que los turnos `pending` NUNCA se reintentan.

Fix recomendado: mover la sincronización al servidor, replicando el patrón que ya
funciona en public-booking/index.ts:70-146.

1. Crear supabase/functions/_shared/google-calendar.ts con el refresh de token y
   create/patch/delete de eventos, hoy duplicado en public-booking y chat-webhook.
2. Crear la Edge Function `calendar-sync` (verify_jwt=true) con la acción
   `push_appointment`, que crea/actualiza/borra el evento y persiste google_event_id
   usando service role.
3. AppointmentService.createAppointment invoca calendar-sync tras el RPC. Si falla y el
   usuario tiene Google conectado, mostrar un toast de advertencia (el turno igual queda
   guardado, eso está bien).
4. Quitar el filtro .eq('status','confirmed') de AppointmentRepository.ts:159-172.

Aceptación: crear un turno desde el dashboard → aparece en Google Calendar y la fila
tiene google_event_id. Con Google desconectado → el turno se crea y la UI avisa.
```

### Prompt C2 — Una reunión de Google no bloqueó el horario (punto 5)

```
El horario se ofreció porque la app no vio el evento de Google:

  - AppointmentBusinessLogic.ts:37-39 — si GoogleCalendarService.isConnected(session)
    da false (sin refresh token, caché de módulo stale, error de red), googleEvents = []
    y CUALQUIER reunión de Google queda invisible. Aun conectado, listEvents devuelve []
    ante cualquier error (GoogleCalendarService.ts:241-251 y 255-259).
  - GoogleCalendarService.ts:239 — consulta SOLO el calendario `primary`. Una reunión en
    un calendario secundario nunca bloquea nada.
  - El RPC de escritura (20260604000002_public_booking.sql:30-39) solo mira la tabla
    appointments, así que tampoco frena una reunión que solo existe en Google.

Fix:
1. Agregar la acción `busy` a la Edge Function calendar-sync: POST /calendar/v3/freeBusy
   con TODOS los calendarios del usuario (GET /users/me/calendarList), no solo primary.
2. AppointmentBusinessLogic.ts:37-39 consume esa acción. Si falla teniendo Google
   conectado, NO devolver [] en silencio: propagar el aviso a la UI para que el dentista
   no confíe en una lista de slots incompleta.

Riesgo secundario a corregir en el mismo paso — ZONA HORARIA:
  AppointmentBusinessLogic.ts:49-53 aplica los horarios de `schedules` en hora local del
  navegador, etiqueta el slot en hora AR (formatTimeAR, dateUtils.ts:26-28) y lo
  reconstruye en hora local (combineDateTimeToISO, helpers.ts:23-29). Con un equipo fuera
  de America/Argentina/Buenos_Aires los tres instantes se desfasan y el chequeo de
  solapamiento corre contra franjas corridas. Fijar el offset AR como ya hace
  public-booking/index.ts:51-62 (AR_OFFSET_MS).

Aceptación: crear una reunión en Google Calendar (incluido un calendario secundario) →
ese horario NO aparece en los slots del BookingModal. Con la TZ del equipo cambiada a
UTC, los slots siguen coincidiendo con los horarios configurados.

NOTA APARTE: confirm_appointment_safe y update_appointment_safe (los RPC que usa el
front, AppointmentRepository.ts:86 y 124) NO están en supabase/migrations/ — solo
referenciados en 20260607000004_revoke_definer_execute.sql. Viven únicamente en la base
remota, no son auditables y pueden haber derivado respecto de
confirm_public_appointment_safe. Volcarlos a una migración.

Existen TRES implementaciones distintas del cálculo de slots que deberían converger:
AppointmentBusinessLogic.ts, public-booking/index.ts:254-336 y chat-webhook/index.ts:318-435
(esta última con slotDuration=30 fijo y sin offset AR).
```

---

## Categoría D — Notificaciones al agendar (punto 9)

### Prompt D1 — Email al médico y al paciente

```
Estado actual: la ÚNICA notificación existente es chat-webhook/index.ts:562-572, que
avisa al dentista por WhatsApp usando profiles.notification_phone. public-booking crea
el turno (líneas 436-473) y NO notifica a nadie. No hay ningún proveedor de email en el
proyecto (ni resend, ni sendgrid, ni nodemailer, ni SMTP).

Ojo: src/services/EvolutionService.ts NO es la Evolution API de WhatsApp — es el CRUD
de treatment_history. El nombre confunde.

Implementación:
1. supabase/functions/_shared/email.ts con Resend (API HTTP, anda bien en Deno).
   Env vars nuevas: RESEND_API_KEY, NOTIFY_FROM_EMAIL. Requiere verificar el dominio
   en Resend antes de poder enviar.
2. Edge Function `notify-appointment` con dos plantillas HTML:
     - al paciente: fecha, hora, profesional, consultorio, dirección
     - al dentista: nuevo turno + datos del paciente
   Destinatarios: email del dentista desde auth.users vía service role; email del
   paciente desde patients.email — PUEDE SER NULL, el envío al paciente es condicional.
3. Invocar desde los tres orígenes de alta de turnos:
     - public-booking/index.ts:472, después del bloque de sync a Google
     - chat-webhook, junto al aviso de WhatsApp existente
     - AppointmentService.createAppointment, tras el RPC
   El envío NUNCA debe hacer fallar la creación del turno: .catch(console.error), igual
   que el patrón actual de WhatsApp.
4. Refuerzo barato: agregar sendUpdates:'all' a la creación del evento de Google
   Calendar. El email del paciente ya se manda como attendee
   (GoogleCalendarService.ts:271, public-booking/index.ts:122); con ese flag Google le
   envía la invitación sin costo de infraestructura.

Aceptación: reservar desde /agendar/{slug} → llegan dos emails con los datos correctos.
Reservar sin email de paciente → llega solo el del dentista y el turno se crea igual.
```

---

## Categoría E — Suscripciones y downgrade (punto 10)

> Lo que se pidió **ya está escrito en el working tree** (sin commitear) y es correcto:
> `create-checkout` detecta el downgrade, baja el monto del preapproval con
> `PUT /preapproval/{id}` en vez de crear uno nuevo, y guarda `pending_plan_id` /
> `pending_plan_effective_at` sin tocar `plan_id`, `status` ni `feature_permissions`.
> **No hay cobro nuevo y el plan superior se conserva hasta el vencimiento.**
> La migración `20260727000000_scheduled_plan_change.sql` está bien formada.
> Faltan cerrar los agujeros de abajo antes de commitear.

### Prompt E1 — mp-webhook revierte el downgrade solo (CRÍTICO)

```
supabase/functions/mp-webhook/index.ts no menciona pending_plan_id ni
pending_plan_effective_at por ningún lado. En la línea 204 hace:
    updateData.plan_id = planId;
tomando el plan del external_reference del preapproval ("userId|planId"), que en un
downgrade sigue apuntando al PLAN CARO — el external_reference nunca se actualiza.

Consecuencia: cuando MercadoPago cobre la cuota siguiente (ya con el monto reducido) y
dispare el webhook, este restaura plan_id al plan caro y re-sincroniza
feature_permissions con las features del plan caro (líneas 223-245). El cron y el
webhook se pisan: el downgrade se revierte solo, con el usuario pagando el precio bajo.

Fix: si la suscripción tiene pending_plan_id, el webhook NO debe tocar plan_id. Y si
pending_plan_effective_at ya venció, debe aplicar el pendiente en ese mismo momento
llamando a apply_pending_plan_changes().

Aceptación: simular un webhook de cobro con pending_plan_id presente → plan_id NO vuelve
al plan caro y feature_permissions no se recalcula con las features del plan caro.
```

### Prompt E2 — La renovación mensual nunca extiende el período (CRÍTICO, preexistente)

```
supabase/functions/mp-webhook/index.ts:163-173 usa como clave de idempotencia:
    const eventKey = `${preapprovalId}:${mpStatus}`;
En una suscripción recurrente, mpStatus del preapproval queda en "authorized" mes tras
mes. Por lo tanto la SEGUNDA cuota (subscription_authorized_payment) genera el mismo
event_key, choca con el unique de processed_mp_events (23505) y se descarta como
duplicada → current_period_end NUNCA avanza.

Efecto sobre el downgrade diferido: al mes siguiente hasPaidPeriod es false
(PricingView.tsx:40-41) e isDowngrade es false en create-checkout (condición
periodEndsAt.getTime() > Date.now()) → el downgrade programado deja de ofrecerse y
vuelve a caer en checkout con cobro inmediato.

Fix: incluir el resourceId del pago en la clave de idempotencia (no solo el estado del
preapproval) y extender current_period_end en cada subscription_authorized_payment.

Aceptación: simular dos cobros consecutivos → current_period_end avanza en ambos.
```

### Prompt E3 — Cancelar no limpia el pendiente ni el preapproval

```
src/services/SubscriptionService.ts:86-97 (cancelMySubscription) solo hace
UPDATE subscriptions SET status='cancelled', cancelled_at=now(). Dos problemas:

1. Deja pending_plan_id vivo → el cron apply_pending_plan_changes() va a mutar el
   plan_id de una suscripción ya cancelada.
2. NUNCA cancela el preapproval en MercadoPago → MP le sigue cobrando al usuario.

Fix: limpiar pending_plan_id/pending_plan_effective_at y cancelar el preapproval vía
Edge Function (el front no puede tener el token de MP).

Aceptación: cancelar → status='cancelled', columnas de pendiente en NULL y el
preapproval en estado `cancelled` en MercadoPago.
```

### Prompt E4 — Guardas de consistencia en create-checkout

```
1. CONCURRENCIA: si updatePreapprovalAmount() tiene éxito pero el UPDATE de Supabase
   falla (bloque scheduleError), el monto en MP queda bajado sin registro en la DB →
   el usuario paga el precio bajo con el plan caro, indefinidamente. Fix: revertir el
   monto en MP si falla el UPDATE.

2. REPROGRAMACIÓN: si ya hay un pending_plan_id y el usuario elige un tercer plan aún
   más barato, se sobrescribe sin aviso. PricingView.tsx:46 solo bloquea el botón del
   plan exacto ya programado. Fix: advertir en la UI.

3. DOBLE PREAPPROVAL: en upgrade/alta, el fallo al cancelar el preapproval viejo es no
   fatal (console.warn) → pueden quedar dos activos cobrando dos veces. Fix: registrar
   el fallo en payment_events para poder auditarlo.

4. ORDEN DE DESPLIEGUE: SubscriptionService.ts:52-54 usa el embed
   `subscription_plans!subscriptions_pending_plan_id_fkey`. Si el front se despliega
   ANTES que la migración, PostgREST devuelve PGRST200, fetchSubscription lanza (línea 60)
   y la app entera queda sin suscripción. La migración va primero, siempre.

5. pg_cron: si la extensión no está instalada, la migración solo emite un RAISE NOTICE
   (líneas 97-112) y el cambio programado nunca se aplica. Verificar que pg_cron esté
   activo; como red de seguridad, llamar a apply_pending_plan_changes() también desde
   mp-webhook y desde el arranque de SubscriptionContext.

Aceptación: con una suscripción active en el plan caro y período vigente, elegir el plan
barato → confirmación explicativa, SIN redirect a checkout, SIN cobro. subscriptions
muestra pending_plan_id y pending_plan_effective_at = current_period_end, con plan_id y
feature_permissions intactos. En MercadoPago el preapproval mantiene el mismo id con
transaction_amount reducido. Adelantar pending_plan_effective_at al pasado y ejecutar
SELECT apply_pending_plan_changes(); → el plan baja y las feature_permissions se recalculan.
```

---

---

## Qué falta para que esto llegue a producción

El código está aplicado, compila (`npm run build`) y los tests pasan (18/18). Falta desplegarlo,
**en este orden**:

### 1. Migración de base de datos (antes que el front)

```bash
supabase db push
```

Aplica `20260727000000_scheduled_plan_change.sql`. **Va primero, siempre**: el front usa el embed
`subscription_plans!subscriptions_pending_plan_id_fkey`, y si se despliega antes que la migración
PostgREST devuelve `PGRST200`, `fetchSubscription` lanza y la app entera queda sin suscripción.

pg_cron ya está instalado (v1.6.4, verificado), así que el job diario `apply-pending-plan-changes`
(04:00 UTC) queda programado por la propia migración.

### 2. Variables de entorno de las Edge Functions

| Variable | Para qué | Estado |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `calendar-sync` | Ya existen (las usa `public-booking`) |
| `RESEND_API_KEY` | envío de emails | **Falta**: crear cuenta en Resend |
| `NOTIFY_FROM_EMAIL` | remitente, ej. `DentalDash <turnos@dentaldash.cloud>` | **Falta**: verificar el dominio en Resend |
| `APP_URL` | CORS de las funciones nuevas | Ya existe |

Sin `RESEND_API_KEY` / `NOTIFY_FROM_EMAIL` el envío se saltea en silencio y **nada más se rompe**:
los turnos se crean igual. Se puede desplegar todo y dar de alta Resend después.

### 3. Edge Functions

```bash
supabase functions deploy calendar-sync
supabase functions deploy notify-appointment
supabase functions deploy mp-webhook
supabase functions deploy create-checkout
supabase functions deploy public-booking
supabase functions deploy chat-webhook
```

Todas con `verify_jwt` por defecto (true) **salvo** `mp-webhook`, `public-booking` y `chat-webhook`,
que ya están desplegadas como públicas y deben seguir así.

### 4. Frontend + nginx

Rebuild de la imagen Docker (toma `nginx.conf` y `security-headers.conf` nuevos) y deploy.
Verificar con `curl -I https://<dominio>/` que aparezca `Cache-Control: no-cache, must-revalidate`.

### 5. Verificación manual

- **Puntos 1-4**: Ctrl+Shift+R y revisar avatar, tabs de Configuración, WhatsApp último, Link de reservas en Perfil.
- **Puntos 7-8**: subir un PDF en Consentimiento → se ve inline; cerrar y reabrir → sigue ahí.
- **Punto 6**: crear un turno desde el dashboard → aparece en Google Calendar.
- **Punto 5**: crear una reunión en Google Calendar (probar un calendario secundario) → ese horario no se ofrece.
- **Punto 9**: reservar desde `/agendar/{slug}` → llegan los dos emails.
- **Punto 10**: con plan activo y período vigente, elegir un plan más barato → confirmación, sin redirect a MercadoPago, sin cobro.

### Pendiente de verificar en el dashboard de Supabase (no auditable desde el repo)

1. **Policies del bucket `clinical-records`** — no están en migraciones. Confirmar que aceptan paths
   de 3 segmentos (`{userId}/consentimientos/{file}`), no solo de 2. Ver prompt B3 punto 3.
2. **Bucket `avatars`** — `src/utils/avatar.ts` usa `getPublicUrl()`; confirmar que es público.
3. **`confirm_appointment_safe` / `update_appointment_safe`** — los RPC que usa el front no están en
   `supabase/migrations/`, viven solo en la base remota. Conviene volcarlos a una migración.
