# CLAUDE.md - Documentación del Sistema DentalDash

## Descripcion General

DentalDash es una SPA (Single Page Application) de gestión odontológica multitenant construida con React 18 + TypeScript. Cada dentista/clínica es un "tenant" independiente con sus propios datos aislados por RLS en Supabase.

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 7 |
| Estilos | Tailwind CSS 3 + Ant Design 6 + Lucide React |
| Estado global | Zustand 5 |
| Estado servidor | TanStack React Query 5 |
| Formularios | React Hook Form 7 + Zod 4 |
| Routing | React Router DOM 6 |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Deploy | Docker + nginx |

---

## Estructura de Directorios

```
src/
├── App.tsx                         # Boot principal, AuthProvider, QueryClientProvider, Router
├── App.css
├── index.tsx                       # Entry point React
├── index.css
├── components/
│   ├── AuthedApp.tsx               # Layout autenticado (Sidebar + Header + Main + Modals)
│   ├── LoginView.tsx               # Vista de login (Email/Password + Google OAuth)
│   ├── DashboardView.tsx           # Dashboard: stats + proximos turnos + ultimos pacientes
│   ├── TurnosView.tsx              # Vista de agenda de turnos
│   ├── PacientesView.tsx           # Vista de listado de pacientes (paginado)
│   ├── OdontogramView.tsx          # Vista de odontograma por paciente
│   ├── SettingsView.tsx            # Vista de configuración (tabs)
│   ├── Sidebar.tsx                 # Navegación lateral
│   ├── Header.tsx                  # Cabecera superior
│   ├── ModalsRoot.tsx              # Punto de montaje de todos los modales
│   ├── ModalShell.tsx              # Wrapper genérico de modal
│   ├── AddPatientModal.tsx         # Modal: crear paciente
│   ├── EditPatientModal.tsx        # Modal: editar paciente
│   ├── PatientProfileModal.tsx     # Modal: ver perfil de paciente
│   ├── ClinicalRecordModal.tsx     # Modal: historial clínico
│   ├── ConsentimientoModal.tsx     # Modal: consentimiento informado (PDF)
│   ├── BookingModal.tsx            # Modal: crear turno
│   ├── BookingForm.tsx             # Formulario de turno
│   ├── EditTurnoModal.tsx          # Modal: editar turno
│   ├── TurnoDetailsModal.tsx       # Modal: ver detalles del turno
│   ├── Odontogram.tsx              # Componente odontograma SVG interactivo
│   ├── PatientTable.tsx            # Tabla de pacientes
│   ├── SearchInput.tsx             # Input de busqueda reutilizable
│   ├── StatsCard.tsx               # Tarjeta de estadistica
│   ├── InsuranceAutocomplete.tsx   # Autocomplete de obras sociales
│   ├── ErrorBoundary.tsx           # Error boundary global
│   ├── PrivacyPolicy.tsx           # Pagina publica: política de privacidad
│   ├── TermsOfService.tsx          # Pagina publica: términos de servicio
│   ├── PublicBookingView.tsx       # Pagina publica: formulario de reservas para pacientes (/agendar/:slug)
│   ├── UpgradePrompt.tsx           # Pantalla de bloqueo con boton "Ver planes" (usado en Settings tabs)
│   ├── SubscriptionView.tsx        # Vista de estado de suscripcion del usuario (/suscripcion)
│   ├── SubscriptionBanner.tsx      # Banner contextual en AuthedApp (trial countdown, past_due, etc.)
│   ├── PricingView.tsx             # Vista de planes y precios (/pricing)
│   ├── CheckoutResultView.tsx      # Pagina de resultado de pago (/suscripcion/exito y /error)
│   ├── AdminApp.tsx                # Shell de la app para admins (header + AdminView)
│   ├── AdminView.tsx               # Panel de admin: tabs Usuarios, Planes, Pagos
│   ├── PlanFormModal.tsx           # Modal para crear/editar planes (incluye feature_keys checkboxes)
│   ├── UserPermissionsModal.tsx    # Modal admin: editar feature_permissions de un usuario
│   └── SupportMessageModal.tsx     # Modal: enviar mensaje de soporte al admin (desde Header)
│   ├── form/
│   │   ├── PatientInfoFields.tsx   # Campos de datos del paciente (reutilizables)
│   │   └── TimeSlotGrid.tsx        # Grilla de horarios disponibles
│   ├── odontogram/
│   │   └── Tooth.tsx               # Pieza dental individual (SVG)
│   └── settings/
│       ├── useSettings.ts          # Hook de settings (React Query + mutations)
│       ├── ProfileTab.tsx          # Tab: perfil del dentista
│       ├── InsurancesTab.tsx       # Tab: obras sociales aceptadas
│       ├── ServicesTab.tsx         # Tab: servicios/tratamientos ofrecidos
│       ├── ScheduleTab.tsx         # Tab: horarios laborales
│       ├── WhatsAppTab.tsx         # Tab: conexión WhatsApp (Evolution API)
│       └── FaqsTab.tsx             # Tab: preguntas frecuentes (para el chatbot)
├── hooks/
│   ├── usePatients.ts              # Query + paginacion de pacientes
│   ├── useTurnos.ts                # Query de turnos con rango de fechas
│   ├── useDashboardData.ts         # Derivaciones de datos para el dashboard
│   ├── useNormalizedPatients.ts    # Normalización de datos de pacientes
│   ├── useModals.tsx               # Coordinador de apertura de modales
│   ├── usePatientModals.tsx        # Context provider de modales de paciente
│   ├── useAppointmentModals.tsx    # Context provider de modales de turnos
│   ├── useAppointmentsQuery.ts     # Query de appointments (React Query)
│   ├── useAppointmentsMutations.ts # Mutations CRUD de appointments
│   ├── useBookingForm.ts           # Lógica del formulario de booking
│   ├── useEditTurnoModal.ts        # Lógica del modal de edicion de turno
│   ├── useOdontogram.ts            # Lógica del odontograma
│   └── useOdontogramView.ts        # Lógica de la vista de odontograma
├── services/
│   ├── PatientService.ts           # CRUD de pacientes (Supabase + Storage)
│   ├── AppointmentService.ts       # CRUD de turnos + sync Google Calendar
│   ├── AppointmentBusinessLogic.ts # Lógica de slots disponibles
│   ├── OdontogramService.ts        # CRUD de odontograma
│   ├── EvolutionService.ts         # CRUD de treatment_history (evolución clínica) — NO es la Evolution API
│   ├── GoogleCalendarService.ts    # Conexión/desconexión de Google Calendar (Settings)
│   ├── CalendarSyncService.ts      # Cliente de la Edge Function calendar-sync (sync + freeBusy)
│   ├── NotificationService.ts      # Cliente de la Edge Function notify-appointment (emails)
│   ├── InsuranceService.ts         # Listado de obras sociales
│   ├── StorageService.ts           # Supabase Storage (upload/delete)
│   ├── SubscriptionService.ts      # Fetch de suscripcion y feature_permissions del usuario
│   ├── AdminService.ts             # Llamadas a la Edge Function admin-api
│   ├── PublicBookingService.ts     # Llamadas a la Edge Function public-booking (sin auth)
│   ├── ExportService.ts            # Exportacion de datos (feature export_data)
│   └── *.test.ts                   # Tests (vitest): AppointmentService, ExportService
├── repositories/
│   └── AppointmentRepository.ts   # Acceso a datos de appointments (Supabase)
├── schemas/
│   ├── patient.schema.ts           # Validacion Zod para pacientes
│   ├── appointment.schema.ts       # Validacion Zod para turnos
│   ├── odontogram.schema.ts        # Validacion Zod para odontograma
│   ├── plan.schema.ts              # Validacion Zod para formulario de planes (incluye feature_keys)
│   └── publicBooking.schema.ts     # Validacion Zod para el formulario publico de reservas
├── types/
│   ├── database.types.ts           # Interfaces: Patient, ClinicalRecord, etc.
│   └── appointments.ts             # Tipos de appointments
├── config/
│   ├── supabaseClient.ts           # Instancia de Supabase client
│   ├── appointments.ts             # Configuracion de tipos de turno
│   └── featureKeys.ts              # Lista de los 11 feature keys con labels (fuente de verdad frontend)
├── context/
│   ├── AuthContext.tsx             # Context de sesion (session, isLoading, profile)
│   └── SubscriptionContext.tsx     # Context de suscripcion (subscription, permissions, canUse, isAdmin)
├── store/
│   └── useAppStore.ts              # Zustand: estado global UI (search, filters)
├── router/
│   ├── AppRoutes.tsx               # Definicion de rutas privadas (lazy loading)
│   ├── ProtectedRoute.tsx          # Guard de rutas autenticadas (verifica sesion + suscripcion)
│   └── AdminRoute.tsx              # Guard de rutas admin (verifica profile.role === 'admin')
└── utils/
    ├── dateUtils.ts                # Utilidades de fechas
    └── helpers.ts                  # Helpers genericos
```

---

## Rutas de la Aplicacion

| Path | Componente | Acceso |
|---|---|---|
| `/` | DashboardView | Privado |
| `/turnos` | TurnosView | Privado |
| `/pacientes` | PacientesView | Privado |
| `/configuracion` | SettingsView | Privado |
| `/pacientes/:id/odontograma` | OdontogramView | Privado |
| `/suscripcion` | SubscriptionView | Privado (exempt de guard de suscripcion) |
| `/suscripcion/exito` | CheckoutResultView | Privado |
| `/suscripcion/error` | CheckoutResultView | Privado |
| `/pricing` | PricingView | Privado (exempt de guard) |
| `/admin` | AdminView | Solo admin (`profile.role === 'admin'`) |
| `/privacy` | PrivacyPolicy | Publico |
| `/terms` | TermsOfService | Publico |
| `/agendar/:slug` | PublicBookingView | Publico (sin auth) |
| `/*` | Redirect a `/` | - |

---

## Base de Datos (Supabase / PostgreSQL)

Todas las tablas tienen RLS habilitado. Algunas (debug_payloads, processed_mp_events, public_booking_attempts) no tienen politicas: solo las accede el service role.

### `public.patients`
Registro de pacientes. Campo `user_id` = dentista propietario. Soft-delete via `deleted_at` y `estado = 'Inactivo'`.

Columnas clave: `id`, `nombre`, `dni`, `telefono`, `email`, `obra_social`, `numero_afiliado`, `fecha_nacimiento`, `alergias`, `antecedentes`, `historia_clinica_url`, `consentimiento_url`, `estado`, `deleted_at`, `user_id`.

### `public.appointments`
Turnos/citas. Sincronizados con Google Calendar via `google_event_id`.

Columnas clave: `id`, `title`, `start_time`, `end_time`, `duration`, `appointment_type`, `patient_id`, `status`, `notes`, `google_event_id`, `user_id`.

Estados: `pending`, `confirmed`, `completed`, `cancelled`.

### `public.profiles`
Perfil del dentista (1:1 con `auth.users`). Incluye configuracion de WhatsApp, servicios, obras sociales aceptadas, sistema de FAQs y tokens de integraciones.

Columnas clave: `id`, `full_name`, `avatar_url`, `accepted_insurances[]`, `services (jsonb)`, `contact_phone`, `business_name`, `whatsapp_instance`, `whatsapp_status`, `system_prompt`, `apikey_evolution`, `notification_phone`, `google_refresh_token`, `role` (dentist | admin), `booking_slug` (UNIQUE, para el link publico de reservas).

### `public.schedules`
Horarios laborales por día de la semana. Relacion `user_id` -> dentista.

Columnas: `id`, `day_of_week` (0=Dom...6=Sab), `start_time`, `end_time`, `is_active`, `user_id`.

### `public.odontograms`
Odontograma en JSON por paciente (1:1 con `patients`). Almacena estado de cada pieza dental.

Columnas: `id`, `patient_id` (unique), `data (jsonb)`, `user_id`.

### `public.treatment_history`
Historial de tratamientos por pieza dental.

Columnas: `id`, `patient_id`, `tooth_number`, `procedure_type`, `description`, `user_id`.

### `public.chat_history`
Historial de conversaciones WhatsApp del chatbot. Campo `status`: `pending` | `processed`.

Columnas: `id`, `tenant_id`, `jid` (WhatsApp ID del paciente), `role` (user/assistant), `content`, `whatsapp_instance`, `status`.

### `public.tenant_faqs`
Preguntas frecuentes del consultorio (usadas como contexto del chatbot IA).

Columnas: `id`, `tenant_id`, `question`, `answer`.

### `public.debug_payloads`
Logs de debugging de Edge Functions. RLS habilitado sin politicas (solo escribe el service role). Los inserts desde `chat-webhook` y `whatsapp-manager` solo ocurren si la env var `DEBUG_LOGS=true`.

### `public.support_messages`
Mensajes de soporte de usuarios al admin. RLS: usuario ve/inserta solo sus filas.

Columnas: `id`, `user_id`, `subject`, `body`, `status`, `created_at`, `read_at`.

### `public.processed_mp_events`
Deduplicacion de webhooks de MercadoPago (`event_key` unico). Solo service role; RLS habilitado sin politicas.

### `public.public_booking_attempts`
Rate-limiting del formulario publico de reservas (`ip_hash`, `dni`, `user_id`). Solo service role; RLS habilitado sin politicas.

### `public.subscription_plans`
Planes de suscripcion disponibles. **Sin RLS** (lectura publica, escritura solo service role).

Columnas: `id`, `name`, `description`, `price_monthly`, `price_yearly`, `currency` (default 'ARS'), `features` (jsonb, etiquetas de display), `feature_keys` (text[], claves de funcionalidades habilitadas), `trial_days` (dias de prueba al registrarse), `is_active`, `sort_order`.

Planes actuales: **Basico** y **Asistente IA** (todas las features). El plan Trial se elimino; el trial ahora son dias gratis configurables sobre un plan (`subscription_plans.trial_days`, editable desde el panel admin).

### `public.subscriptions`
Suscripcion activa por usuario (1:1 con `auth.users`). RLS: usuario ve solo su fila.

Columnas: `id`, `user_id` (UNIQUE), `plan_id`, `status` (trial | active | past_due | cancelled | free), `mercadopago_sub_id`, `mercadopago_payer_id`, `trial_ends_at`, `current_period_start`, `current_period_end`, `cancelled_at`.

### `public.feature_permissions`
Permisos de funcionalidades por usuario (11 feature keys posibles). RLS: usuario ve solo sus filas. UNIQUE en (user_id, feature_key).

Feature keys: `appointments`, `odontogram`, `clinical_records`, `consent_forms`, `patients_unlimited`, `insurance_management`, `services_config`, `export_data`, `whatsapp_bot`, `google_calendar`, `faqs_config`.

### `public.admin_users`
Tabla de usuarios admin. **Sin RLS** (solo service role). Un registro por admin.

### `public.payment_events`
Log de eventos de MercadoPago. **Sin RLS** - auditoria.

---

## Edge Functions (Supabase Deno)

### `whatsapp-manager`
Gestiona la instancia de WhatsApp via Evolution API.

Acciones: `create`, `get_qr`, `logout`, `sync_webhook`, `debug_instance`, `sync_webhook_all`.

`create`, `get_qr` y `logout` devuelven siempre la misma forma normalizada — `{ status, instanceName, qr, message? }` con `status` en `connected | connecting | disconnected | error` — y **HTTP 200 incluso cuando Evolution falla** (`status: 'error'` + `message`): `supabase.functions.invoke` envuelve cualquier no-2xx en un error generico sin exponer el body, asi que un status crudo le ocultaria el motivo real al usuario. Los no-2xx quedan reservados para auth/validacion (400/401/403).

`create` es **idempotente**: el nombre de instancia es determinista (`instance_<uuid>`), asi que primero sondea `connectionState` y reutiliza la instancia existente (`connect` para pedir un QR nuevo) en vez de chocar con el 403 "already in use" de `/instance/create`; ante un 403 igual hace `delete` + un reintento. `logout` (que en la UI es tanto "Desconectar" como "Cancelar") ejecuta `logout` y **despues** `delete` — en paralelo el delete corre con la sesion viva y deja la instancia huerfana — y limpia `profiles` aunque Evolution no responda.

`sync_webhook_all` es una accion **global de admin** (validada contra `admin_users`, no lleva `tenant_id`): re-registra el webhook de todas las instancias con `whatsapp_instance` no nulo. Se usa al rotar `CHAT_WEBHOOK_SECRET` o al cambiar la URL del webhook, para que ningun tenant quede con una URL vieja que `chat-webhook` rechace con 401.

Requiere JWT. Variables de entorno: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `CHAT_WEBHOOK_SECRET` (obligatoria: sin ella la funcion devuelve 500, porque registraria un webhook que `chat-webhook` rechazaria).

### `chat-webhook`
Recibe mensajes de WhatsApp (no requiere JWT - endpoint publico para Evolution API).

**Autenticacion (fail-closed):** el unico control de acceso es el secreto `CHAT_WEBHOOK_SECRET`. Sin la env var la funcion responde `503`; con secreto incorrecto o ausente, `401`. El secreto viaja como **query param `?s=`** en la URL que `whatsapp-manager` registra en Evolution API (Evolution self-hosted v2 no soporta headers custom en el webhook); tambien se acepta el header `x-webhook-secret` para pruebas manuales.

Flujo:
1. Recibe payload de Evolution API
2. Inserta mensaje como `pending` en `chat_history`
3. Espera 3s (debounce para agrupar mensajes rapidos)
4. Si no hay mensajes mas nuevos, procesa el lote completo
5. Genera respuesta via OpenAI GPT-4o-mini (fallback: Gemini)
6. Ejecuta Function Calling: `get_available_slots`, `create_appointment` (crea el turno via RPC `confirm_public_appointment_safe` con overlap-check, duracion segun `profile.services`, status `confirmed`, y sincroniza con Google Calendar)
7. Envia respuesta por WhatsApp
8. Persiste respuesta en `chat_history`

Variables de entorno: `CHAT_WEBHOOK_SECRET` (obligatoria), `OPENAI_API_KEY`, `GEMINI_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

**Orden de deploy al rotar `CHAT_WEBHOOK_SECRET`** (para que el bot no se caiga): 1) setear el secreto; 2) deploy de `whatsapp-manager`; 3) invocar `sync_webhook_all` con JWT de admin; 4) deploy de `chat-webhook` (`--no-verify-jwt`).

### `cleanup-orphaned-files`
Limpieza programada de archivos huerfanos en Supabase Storage. Elimina archivos en `clinical-records` que no esten referenciados por ningun paciente y sean mayores a N dias (default: 30). La dispara un cron job de pg_cron (`cleanup-orphaned-files`, domingos 03:00 UTC) via `net.http_post` con el anon key — debe mantenerse con `verify_jwt=true`.

### `admin-api`
Panel de administracion (requiere JWT + estar en `admin_users`). Acciones: `list_users`, `update_user_plan`, `update_user_permission`, `update_plan_price`, `create_plan`, `update_plan`, `delete_plan`, `toggle_plan`, `cancel_subscription`, `grant_free_access`, `list_plans`, `list_payment_events`.

Al asignar un plan a un usuario, lee `plan.feature_keys` de la DB y hace upsert en `feature_permissions`.

### `mp-webhook`
Recibe webhooks de MercadoPago (publico, sin JWT). Verifica firma HMAC si hay `MP_WEBHOOK_SECRET`. Al activar una suscripcion, lee `plan.feature_keys` de la DB (NO hardcodeado) y actualiza `feature_permissions` del usuario.

### `create-checkout`
Crea un preapproval de MercadoPago para una suscripcion recurrente. Requiere JWT.

### `public-booking`
Endpoint publico (sin JWT) para el formulario de reservas de pacientes. Acciones: `resolve_slug` (slug → user_id), `get_profile`, `get_working_days`, `get_slots`, `create_appointment`. Usa service role para bypassear RLS. Llama al RPC `confirm_public_appointment_safe`.

### `google-token-refresh`
Renueva el access token de Google Calendar a partir del `google_refresh_token` del perfil. Requiere JWT. Invocada desde `GoogleCalendarService.ts` (que hoy solo se usa para conectar/desconectar la integracion desde Settings).

### `calendar-sync`
Sincronizacion de Google Calendar para la app autenticada (requiere JWT). Acciones: `push_appointment` (crea/actualiza el evento y persiste `google_event_id`), `delete_event`, `busy` (franjas ocupadas via `freeBusy` sobre **todos** los calendarios del usuario).

Corre server-side con el `google_refresh_token` de `profiles`, igual que `public-booking` y `chat-webhook`. Reemplaza el camino anterior desde el navegador, que dependia del `provider_token` efimero de la sesion y fallaba en silencio: los turnos quedaban sin `google_event_id` y las reuniones de Google no bloqueaban horarios.

Variables de entorno: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### `notify-appointment`
Envia el email de confirmacion del turno al paciente y al dentista (requiere JWT). Usada por la app; `public-booking` y `chat-webhook` llaman en proceso al helper compartido.

Variables de entorno: `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` (remitente verificado en Resend). Si faltan, el envio se saltea en silencio.

### Codigo compartido (`supabase/functions/_shared/`)
- `google-calendar.ts` — refresh de token + create/update/delete de eventos + `freeBusy`.
- `email.ts` — cliente de Resend y layout HTML comun.
- `appointment-notifications.ts` — `notifyAppointmentCreated(supabase, appointmentId)`, usada por `notify-appointment`, `public-booking` y `chat-webhook`.

---

## Integraciones Externas

| Servicio | Proposito |
|---|---|
| Google OAuth + Calendar API | Login con Google + sincronizacion de turnos |
| Evolution API | Gestion de WhatsApp Business |
| OpenAI GPT-4o-mini | Motor conversacional del chatbot |
| Google Gemini | Fallback del chatbot si OpenAI falla |

---

## Autenticacion y Seguridad

- **Auth**: Supabase Auth con Email/Password y Google OAuth.
- **RLS**: Todas las tablas aplican Row Level Security. Cada query solo devuelve registros donde `user_id = auth.uid()`.
- **Storage**: Bucket `clinical-records` para historias clinicas y consentimientos. Bucket `avatars` para fotos de perfil.
- **Validacion**: Zod en cliente antes de persistir datos. DNI se sanitiza (sin puntos/guiones).
- **Soft Delete**: Los pacientes nunca se eliminan fisicamente. Se marca `deleted_at` y `estado = 'Inactivo'`.
- **Rollback**: Si falla la DB despues de subir un archivo, se borra el archivo del Storage.

---

## Flujo de Autenticacion

```
App.tsx
  └── AuthProvider (AuthContext)
        └── supabase.auth.getSession() + onAuthStateChange
              ├── session = null  →  LoginView
              └── session existe →  AuthedApp
                                      └── AppRoutes (rutas privadas)
```

---

## Gestion de Estado

| Tipo de estado | Herramienta |
|---|---|
| Sesion de usuario | AuthContext (useState + useEffect) |
| Datos del servidor (pacientes, turnos) | TanStack React Query |
| Estado de UI global (filtros, busqueda) | Zustand (useAppStore) |
| Estado de formularios | React Hook Form |
| Estado de modales | Context providers (usePatientModals, useAppointmentModals) |

---

## Comandos Utiles

```bash
npm run dev          # Servidor de desarrollo (Vite)
npm run build        # Build de produccion
npm run preview      # Preview del build
npm run test         # Tests (vitest)
```

Variables de entorno necesarias (`.env` local):
```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## Sistema de Suscripciones y Feature Gating

### Flujo de acceso
1. Al registrarse, el trigger `handle_new_user_subscription` crea una `subscriptions` row (status=trial) usando el primer plan activo con `trial_days` configurado (fallback: 14 dias), y 11 `feature_permissions` rows segun los `feature_keys` de ese plan.
2. `SubscriptionContext.tsx` carga la suscripcion y permisos al iniciar sesion. Expone `canUse(featureKey)`.
3. `ProtectedRoute.tsx` bloquea todas las rutas privadas si la suscripcion esta vencida/cancelada (redirige a `/suscripcion`). Admins y usuarios `free` siempre pasan.
4. `canUse()` retorna `true` si: es admin, es `free`, o tiene la `feature_permission` con `enabled=true`.

### Feature gating en Settings
`SettingsView.tsx` usa `canUse()` para mostrar `UpgradePrompt` en lugar del contenido de tabs bloqueados:
- `insurances` tab → `insurance_management`
- `services` tab → `services_config`
- `whatsapp` tab → `whatsapp_bot`
- `faqs` tab → `faqs_config`
- `profile` y `schedule` → siempre accesibles

### Roles
- `profile.role = 'dentist'` → renderiza `AuthedApp` (app normal)
- `profile.role = 'admin'` → renderiza `AdminApp` (panel de admin simplificado)

### Admin Panel (`/admin`)
`AdminView.tsx` con 3 tabs: Usuarios, Planes, Pagos. Permite: asignar planes, otorgar acceso gratuito, cancelar suscripciones, crear/editar/eliminar planes con feature_keys configurables via checkboxes.

### Configurar features de un plan
Los `feature_keys` de cada plan se guardan en `subscription_plans.feature_keys text[]`. El admin los edita desde `PlanFormModal` (checkboxes). Las Edge Functions `admin-api` y `mp-webhook` leen de la DB, NO tienen hardcoded el mapeo de features.

---

## Link Publico de Reservas

### Flujo para el dentista
1. Va a Configuracion → Perfil → sección "Link de reservas"
2. Configura un slug unico (ej: `dr-garcia`) — solo letras minusculas, numeros y guiones
3. La URL resultante es `{origen}/agendar/dr-garcia`
4. El link se puede copiar con el boton "Copiar"

### Flujo para el paciente
1. Abre `/agendar/{slug}` (sin necesidad de cuenta)
2. La pagina `PublicBookingView` llama a la Edge Function `public-booking`:
   - `resolve_slug` → obtiene el `user_id` del dentista
   - `get_profile` → nombre, consultorio, servicios, obras sociales
   - `get_working_days` → dias laborales activos
   - `get_slots` → horarios disponibles para una fecha y duracion
3. Selecciona servicio → fecha → horario → completa datos personales → confirma
4. La Edge Function llama al RPC `confirm_public_appointment_safe(p_user_id, ...)` que hace el overlap-check y crea el turno con `status=pending`
5. Si el paciente ya existe (mismo DNI + user_id), se reutiliza; sino se crea nuevo

---

## Notas para Claude

- El sistema es **multitenant**. Nunca mezclar datos de distintos `user_id`.
- El `user_id` en la DB corresponde al `session.user.id` de Supabase Auth.
- Los turnos se crean via RPC (`insertAppointmentRPC`) para garantizar atomicidad y evitar solapamientos.
- Google Calendar sync: si falla la sincronizacion, se hace rollback del insert en DB.
- El odontograma guarda todo el estado dental en un campo `jsonb` en la tabla `odontograms`.
- La sincronizacion con Google Calendar y el calculo de franjas ocupadas van **siempre** por la Edge Function `calendar-sync`, nunca desde el navegador.
- Los horarios de `schedules` son hora de pared argentina: usar `createARDateTime()` de `src/utils/dateUtils.ts`, nunca `setHours()`.
- `AppointmentService.getAvailableSlots()` devuelve `{ slots, calendarUnavailable }`, no un array.
- Al bajar de plan no se cobra de nuevo: se guarda `subscriptions.pending_plan_id` / `pending_plan_effective_at` y el cron `apply_pending_plan_changes()` (pg_cron, 04:00 UTC) lo aplica al vencer el periodo pagado. `mp-webhook` no toca `plan_id` mientras haya un cambio pendiente.
- Los servicios del perfil son `jsonb` (array de objetos `{name, duration, price}`).
- Las obras sociales aceptadas en el perfil son `text[]`.
- Los tipos de turno en el cliente vienen de `src/config/appointments.ts`.
- El `chat-webhook` no verifica JWT porque Evolution API no puede enviar tokens de usuario: su unico control de acceso es `CHAT_WEBHOOK_SECRET` en la query string (`?s=`), fail-closed.
- Los `feature_keys` de cada plan viven en `subscription_plans.feature_keys` (DB), NO hardcodeados en Edge Functions.
- `PublicBookingView` no usa `useAuth()` ni `useSubscription()`. Es completamente standalone.
- El RPC `confirm_public_appointment_safe` tiene `SECURITY DEFINER` y acepta `p_user_id` explicito (para uso sin sesion de auth).
- `src/config/featureKeys.ts` es la fuente de verdad para los 11 feature keys en el frontend.
