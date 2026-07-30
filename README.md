# DentalDash

Sistema de gestión odontológica SaaS multitenant. Cada dentista/clínica opera como un tenant independiente con datos completamente aislados.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite 7 |
| Estilos | Tailwind CSS 3 + Ant Design 6 + Lucide React |
| Estado | Zustand 5 + TanStack React Query 5 |
| Formularios | React Hook Form 7 + Zod 4 |
| Routing | React Router DOM 6 |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Deploy | Docker + nginx |

---

## Requisitos

- Node.js 18.x (ver `.nvmrc`)
- npm
- Proyecto Supabase configurado

```bash
npm install
```

---

## Variables de entorno

Crear un archivo `.env` en la raíz:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## Comandos

```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción (corre `tsc --noEmit` antes de compilar)
npm run preview    # Preview del build
npm run lint       # ESLint sobre src/
npm run typecheck  # Verificación de tipos (tsc --noEmit)
npm run test       # Tests (vitest)
```

---

## Funcionalidades

- **Gestión de pacientes**: alta, edición, búsqueda, soft-delete, historial clínico con archivos PDF, consentimiento informado.
- **Agenda de turnos**: creación, edición, cancelación, slots disponibles según horarios configurados, sincronización con Google Calendar.
- **Odontograma interactivo**: mapa dental SVG por paciente con historial de tratamientos por pieza.
- **Chatbot WhatsApp**: bot conversacional con IA (OpenAI / Gemini) que gestiona consultas y reservas de turnos via Evolution API.
- **Panel de configuración**: perfil del dentista, horarios laborales, obras sociales, servicios/tratamientos, FAQs para el chatbot.
- **Suscripciones SaaS**: planes de pago via MercadoPago Checkout Pro con provisioning automático de tenants.
- **Panel de Super-Admin**: gestión de tenants, planes y suscripciones desde una cuenta administradora.
- **Exportación de datos**: pacientes, turnos e historiales a CSV/PDF.
- **Onboarding**: wizard de configuración inicial para nuevos usuarios.

---

## Arquitectura

### Seguridad
- **Auth**: Supabase Auth (Email/Password + Google OAuth).
- **RLS**: Row Level Security en todas las tablas. Cada query filtra por `user_id = auth.uid()`.
- **Storage**: bucket `clinical-records` para historias clínicas y consentimientos.
- **Soft Delete**: los pacientes se marcan con `deleted_at` y `estado = 'Inactivo'`, nunca se eliminan físicamente.

### Edge Functions (Supabase Deno)

| Función | JWT | Descripción |
|---|---|---|
| `chat-webhook` | no | Recibe mensajes de WhatsApp, genera respuesta con IA y ejecuta function calling (slots/turnos). Se autentica con `CHAT_WEBHOOK_SECRET` en el query param `?s=` |
| `whatsapp-manager` | sí | Gestiona instancias de WhatsApp via Evolution API (QR, logout, sync) |
| `create-checkout` | sí | Crea sesiones de pago en MercadoPago |
| `mp-webhook` | no | Procesa notificaciones de pago de MercadoPago y activa suscripciones |
| `admin-api` | sí | API privada del panel super-admin |
| `public-booking` | no | Endpoint del formulario público de reservas (`/agendar/:slug`) |
| `calendar-sync` | sí | Sincronización con Google Calendar (push, delete, freeBusy) |
| `notify-appointment` | sí | Email de confirmación de turno (Resend) |
| `google-token-refresh` | sí | Renueva tokens de Google Calendar |
| `cleanup-orphaned-files` | sí | Limpieza programada de archivos huérfanos en Storage (la dispara pg_cron con la anon key) |

Código compartido entre funciones en `supabase/functions/_shared/`: `cors.ts` (allowlist de orígenes),
`feature-keys.ts` (claves de funcionalidad), `google-calendar.ts`, `email.ts`, `appointment-notifications.ts`.

### Deploy

```bash
# Migraciones
supabase db push

# Funciones sin verificación de JWT (webhooks y endpoints públicos)
supabase functions deploy chat-webhook --no-verify-jwt
supabase functions deploy mp-webhook --no-verify-jwt
supabase functions deploy public-booking --no-verify-jwt

# El resto
supabase functions deploy admin-api create-checkout calendar-sync notify-appointment \
                          whatsapp-manager google-token-refresh cleanup-orphaned-files
```

> Al rotar `CHAT_WEBHOOK_SECRET` el orden es obligatorio o se cae el bot:
> 1) setear el secreto, 2) deploy de `whatsapp-manager`, 3) invocar `sync_webhook_all` con
> un JWT de admin, 4) deploy de `chat-webhook`.

### Migraciones

Las migraciones SQL están en `supabase/migrations/` y se aplican en orden cronológico.

---

## Integraciones externas

| Servicio | Uso |
|---|---|
| Google OAuth + Calendar API | Login con Google + sincronización de turnos |
| Evolution API | Gestión de WhatsApp Business |
| OpenAI GPT-4o-mini | Motor conversacional del chatbot |
| Google Gemini | Fallback del chatbot |
| MercadoPago | Cobro de suscripciones SaaS |

---

## Estructura del proyecto

```
src/
├── App.tsx                   # Boot, AuthProvider, QueryClientProvider, Router
├── components/               # Vistas y componentes UI
├── hooks/                    # Custom hooks (React Query, lógica de negocio)
├── services/                 # Clientes de servicios (Supabase, Storage, APIs)
├── repositories/             # Capa de acceso a datos
├── schemas/                  # Validaciones Zod
├── types/                    # Interfaces TypeScript
├── config/                   # Configuración de clientes
├── context/                  # Contextos React (Auth)
├── store/                    # Estado global UI (Zustand)
├── router/                   # Rutas y guards
└── utils/                    # Utilidades y helpers
supabase/
├── functions/                # Edge Functions (Deno)
└── migrations/               # Migraciones SQL
```
