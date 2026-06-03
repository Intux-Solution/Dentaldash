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
│   ├── EvolutionService.ts         # Integración Evolution API (WhatsApp)
│   ├── GoogleCalendarService.ts    # Integración Google Calendar
│   ├── InsuranceService.ts         # Listado de obras sociales
│   ├── StorageService.ts           # Supabase Storage (upload/delete)
│   └── AppointmentService.test.ts  # Tests (vitest)
├── repositories/
│   └── AppointmentRepository.ts   # Acceso a datos de appointments (Supabase)
├── schemas/
│   ├── patient.schema.ts           # Validacion Zod para pacientes
│   ├── appointment.schema.ts       # Validacion Zod para turnos
│   └── odontogram.schema.ts        # Validacion Zod para odontograma
├── types/
│   ├── database.types.ts           # Interfaces: Patient, ClinicalRecord, etc.
│   └── appointments.ts             # Tipos de appointments
├── config/
│   ├── supabaseClient.ts           # Instancia de Supabase client
│   └── appointments.ts             # Configuracion de tipos de turno
├── context/
│   └── AuthContext.tsx             # Context de sesion (session, isLoading)
├── store/
│   └── useAppStore.ts              # Zustand: estado global UI (search, filters)
├── router/
│   ├── AppRoutes.tsx               # Definicion de rutas privadas (lazy loading)
│   └── ProtectedRoute.tsx          # Guard de rutas autenticadas
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
| `/privacy` | PrivacyPolicy | Publico |
| `/terms` | TermsOfService | Publico |
| `/*` | Redirect a `/` | - |

---

## Base de Datos (Supabase / PostgreSQL)

Todas las tablas tienen RLS habilitado excepto `debug_payloads`.

### `public.patients`
Registro de pacientes. Campo `user_id` = dentista propietario. Soft-delete via `deleted_at` y `estado = 'Inactivo'`.

Columnas clave: `id`, `nombre`, `dni`, `telefono`, `email`, `obra_social`, `numero_afiliado`, `fecha_nacimiento`, `alergias`, `antecedentes`, `historia_clinica_url`, `consentimiento_url`, `estado`, `deleted_at`, `user_id`.

### `public.appointments`
Turnos/citas. Sincronizados con Google Calendar via `google_event_id`.

Columnas clave: `id`, `title`, `start_time`, `end_time`, `duration`, `appointment_type`, `patient_id`, `status`, `notes`, `google_event_id`, `user_id`.

Estados: `pending`, `confirmed`, `completed`, `cancelled`.

### `public.profiles`
Perfil del dentista (1:1 con `auth.users`). Incluye configuracion de WhatsApp, servicios, obras sociales aceptadas, sistema de FAQs y tokens de integraciones.

Columnas clave: `id`, `full_name`, `avatar_url`, `accepted_insurances[]`, `services (jsonb)`, `contact_phone`, `business_name`, `whatsapp_instance`, `whatsapp_status`, `system_prompt`, `apikey_evolution`, `notification_phone`, `google_refresh_token`.

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
Logs de debugging de Edge Functions. **Sin RLS** - solo para uso interno.

---

## Edge Functions (Supabase Deno)

### `whatsapp-manager`
Gestiona la instancia de WhatsApp via Evolution API.

Acciones: `create`, `get_qr`, `logout`, `send_text`, `sync_webhook`, `debug_instance`.

Requiere JWT. Variables de entorno: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`.

### `chat-webhook`
Recibe mensajes de WhatsApp (no requiere JWT - endpoint publico para Evolution API).

Flujo:
1. Recibe payload de Evolution API
2. Inserta mensaje como `pending` en `chat_history`
3. Espera 3s (debounce para agrupar mensajes rapidos)
4. Si no hay mensajes mas nuevos, procesa el lote completo
5. Genera respuesta via OpenAI GPT-4o-mini (fallback: Gemini)
6. Ejecuta Function Calling: `get_available_slots`, `create_appointment`
7. Envia respuesta por WhatsApp
8. Persiste respuesta en `chat_history`

Variables de entorno: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### `cleanup-orphaned-files`
Limpieza programada de archivos huerfanos en Supabase Storage. Elimina archivos en `clinical-records` que no esten referenciados por ningun paciente y sean mayores a N dias (default: 30).

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

## Notas para Claude

- El sistema es **multitenant**. Nunca mezclar datos de distintos `user_id`.
- El `user_id` en la DB corresponde al `session.user.id` de Supabase Auth.
- Los turnos se crean via RPC (`insertAppointmentRPC`) para garantizar atomicidad y evitar solapamientos.
- Google Calendar sync: si falla la sincronizacion, se hace rollback del insert en DB.
- El odontograma guarda todo el estado dental en un campo `jsonb` en la tabla `odontograms`.
- Los servicios del perfil son `jsonb` (array de objetos `{name, duration, price}`).
- Las obras sociales aceptadas en el perfil son `text[]`.
- Los tipos de turno en el cliente vienen de `src/config/appointments.ts`.
- El `chat-webhook` no verifica JWT porque Evolution API no puede enviar tokens de usuario.
