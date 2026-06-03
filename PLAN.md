# PLAN.md - Plan de Integracion de Suscripciones con MercadoPago

## Objetivo

Convertir DentalDash en un producto SaaS comercializable con:
- Pantalla publica de precios/landing que muestre las funcionalidades y el precio
- Pago de suscripcion mensual/anual via MercadoPago Checkout Pro
- Usuario Administrador (`info@intux.solutions`) con panel de control completo
- Sistema de roles y permisos por funcionalidad (qué puede hacer cada usuario segun su plan)
- Posibilidad del Admin de modificar precios, planes y permisos por usuario

---

## Fase 1 - Base de Datos (Supabase)

### 1.1 Nuevas Tablas

#### `public.subscription_plans`
Define los planes disponibles en el sistema. El Admin puede modificarlos desde el panel.

```sql
CREATE TABLE public.subscription_plans (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,                    -- "Básico", "Pro", "Ilimitado"
  description  text,
  price_monthly numeric(10,2) NOT NULL,          -- Precio mensual en ARS
  price_yearly  numeric(10,2),                   -- Precio anual (opcional descuento)
  currency      text DEFAULT 'ARS',
  features      jsonb DEFAULT '[]',              -- Lista de features incluidas
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- No RLS: solo el admin puede modificar (via service role)
-- El frontend lo lee sin autenticacion para mostrar pricing
```

#### `public.subscriptions`
Registra el estado de suscripcion de cada tenant.

```sql
CREATE TABLE public.subscriptions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  plan_id               uuid REFERENCES public.subscription_plans(id),
  status                text DEFAULT 'trial',    -- 'trial', 'active', 'past_due', 'cancelled', 'free'
  mercadopago_sub_id    text,                    -- ID de suscripcion en MercadoPago
  mercadopago_payer_id  text,                    -- ID del pagador en MercadoPago
  trial_ends_at         timestamptz,             -- Cuando termina el periodo de prueba
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
```

#### `public.feature_permissions`
Controla qué features puede usar cada usuario. El Admin puede sobreescribir los defaults del plan.

```sql
CREATE TABLE public.feature_permissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  feature_key text NOT NULL,        -- 'whatsapp_bot', 'odontogram', 'clinical_records', etc.
  enabled     boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE public.feature_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_permissions" ON public.feature_permissions
  FOR SELECT USING (auth.uid() = user_id);
```

#### `public.admin_users`
Tabla de usuarios con rol de super-administrador.

```sql
CREATE TABLE public.admin_users (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  created_at timestamptz DEFAULT now()
);
-- Sin RLS: acceso solo via service role desde Edge Functions
```

#### `public.payment_events`
Log de todos los eventos de pago recibidos de MercadoPago (para auditoria).

```sql
CREATE TABLE public.payment_events (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type    text NOT NULL,              -- 'payment', 'subscription', etc.
  mp_resource_id text,                     -- ID del recurso en MercadoPago
  user_id       uuid REFERENCES auth.users(id),
  payload       jsonb,
  processed     boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
-- Sin RLS: solo admin/service role
```

### 1.2 Modificar `public.profiles`
Agregar columna de rol (para identificar admins en el frontend sin consultar `admin_users` cada vez).

```sql
ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'dentist';
-- Valores: 'dentist', 'admin'
```

### 1.3 Insertar el Admin y Plan Inicial

```sql
-- Primero crear el usuario en Supabase Auth con email: info@intux.solutions
-- Luego ejecutar (reemplazar <USER_ID> con el UUID del usuario creado):

INSERT INTO public.admin_users (user_id) VALUES ('<USER_ID>');
UPDATE public.profiles SET role = 'admin' WHERE id = '<USER_ID>';

-- Plan inicial de ejemplo
INSERT INTO public.subscription_plans (name, description, price_monthly, price_yearly, features, sort_order)
VALUES
  ('Trial', 'Prueba gratuita 14 días', 0, 0,
   '["Gestión de pacientes", "Agenda de turnos", "Odontograma", "Hasta 20 pacientes"]', 0),
  ('Básico', 'Para consultorios pequeños', 15000, 150000,
   '["Gestión de pacientes ilimitados", "Agenda de turnos", "Odontograma", "Historial clínico", "Obras sociales"]', 1),
  ('Pro', 'Para consultorios en crecimiento', 25000, 250000,
   '["Todo lo del Básico", "Chatbot WhatsApp con IA", "Sincronización Google Calendar", "Consentimientos digitales", "Soporte prioritario"]', 2);
```

### 1.4 Definicion de Feature Keys

Las claves de funcionalidades que el sistema controlará:

| feature_key | Descripcion |
|---|---|
| `patients_unlimited` | Sin límite de pacientes (vs. limite trial) |
| `appointments` | Modulo de turnos |
| `odontogram` | Odontograma interactivo |
| `clinical_records` | Historial clínico y archivos |
| `consent_forms` | Consentimientos informados |
| `whatsapp_bot` | Chatbot IA por WhatsApp |
| `google_calendar` | Sincronizacion Google Calendar |
| `insurance_management` | Gestion de obras sociales |
| `services_config` | Configuracion de servicios |
| `faqs_config` | Configuracion de FAQs para el bot |
| `export_data` | Exportacion de datos |

---

## Fase 2 - Edge Functions Nuevas

### 2.1 `create-checkout` (Nueva Edge Function)
Genera una preferencia de pago en MercadoPago y devuelve el `init_point` (URL de pago).

**Flujo:**
1. Recibe `plan_id` y el JWT del usuario autenticado
2. Verifica que el usuario no tenga suscripcion activa
3. Llama a la API de MercadoPago para crear una suscripcion recurrente (preapproval)
4. Guarda el `mercadopago_sub_id` en `subscriptions` con estado `pending`
5. Devuelve la URL de checkout de MercadoPago

**Variables de entorno necesarias:**
```
MP_ACCESS_TOKEN=APP_USR-xxxx  (MercadoPago Access Token de produccion)
MP_PUBLIC_KEY=APP_USR-xxxx    (Para el frontend)
APP_URL=https://tu-dominio.com (Para las URLs de retorno)
```

### 2.2 `mp-webhook` (Nueva Edge Function, sin JWT)
Recibe notificaciones de MercadoPago sobre cambios de estado de pagos y suscripciones.

**Flujo:**
1. Recibe el webhook de MercadoPago
2. Valida la firma del webhook (header `x-signature`)
3. Consulta el estado real del pago/suscripcion en MercadoPago API
4. Actualiza `subscriptions` segun el evento:
   - `authorized` / `charged` → `status = 'active'`, actualiza fechas del periodo
   - `cancelled` / `paused` → `status = 'cancelled'`
   - `payment_failed` → `status = 'past_due'`
5. Si se activa, actualiza los `feature_permissions` del usuario segun el plan
6. Guarda el evento en `payment_events`

### 2.3 `admin-api` (Nueva Edge Function)
API del panel de administracion. Solo accesible por usuarios en `admin_users`.

**Endpoints (via `action` en body):**
- `list_users` - Lista todos los usuarios con su estado de suscripcion
- `update_user_plan` - Cambia el plan de un usuario (override manual)
- `update_user_permission` - Activa/desactiva una feature para un usuario especifico
- `update_plan_price` - Modifica el precio de un plan
- `create_plan` - Crea un nuevo plan
- `toggle_plan` - Activa/desactiva un plan
- `cancel_subscription` - Cancela la suscripcion de un usuario manualmente
- `grant_free_access` - Da acceso gratuito permanente a un usuario

---

## Fase 3 - Frontend

### 3.1 Nueva Ruta Publica: `/pricing` (Landing Page)
Pantalla accesible sin login que muestra:
- Descripcion del producto y sus funcionalidades
- Cards de planes con precios (leidos de `subscription_plans`)
- CTA "Comenzar prueba gratis" → redirige a `/signup` o a la sesion
- CTA "Contratar" → inicia el flujo de checkout
- Testimonios (estaticos inicialmente)

**Archivo:** `src/components/PricingView.tsx`

### 3.2 Contexto de Suscripcion: `SubscriptionContext`
Nuevo context que se carga al autenticarse y expone:

```typescript
interface SubscriptionContextType {
  subscription: Subscription | null;
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysLeft: number | null;        // Dias restantes de trial
  canUse: (featureKey: string) => boolean;  // Verifica permisos
  isAdmin: boolean;
}
```

**Archivo:** `src/context/SubscriptionContext.tsx`

Se carga via React Query al inicio de sesion consultando `subscriptions` y `feature_permissions`.

### 3.3 Hook `useFeature`
Hook simple para verificar permisos en componentes:

```typescript
const { canUse } = useSubscription();

// En cualquier componente:
if (!canUse('whatsapp_bot')) {
  return <UpgradePrompt feature="Chatbot WhatsApp" />;
}
```

### 3.4 Componente `UpgradePrompt`
Componente de llamado a la accion que aparece cuando un usuario intenta usar una feature bloqueada por su plan.

**Archivo:** `src/components/UpgradePrompt.tsx`

Muestra: "Esta funcionalidad requiere el plan Pro. [Actualizar plan]"

### 3.5 Componente `SubscriptionBanner`
Banner en la parte superior del dashboard que muestra:
- En trial: "Estas en tu período de prueba. X días restantes. [Activar suscripcion]"
- En `past_due`: "Tu pago falló. Actualiza tu metodo de pago para continuar usando el sistema."
- En `cancelled`: "Tu suscripcion fue cancelada. [Renovar]"

**Archivo:** `src/components/SubscriptionBanner.tsx`

### 3.6 Flujo de Checkout
Al hacer clic en "Contratar plan":
1. Frontend llama a `create-checkout` Edge Function con el `plan_id`
2. Edge Function devuelve `init_point` (URL de MercadoPago)
3. Frontend redirige al usuario a MercadoPago Checkout Pro
4. MercadoPago redirige de vuelta a `/suscripcion/exito` o `/suscripcion/error`
5. En `/suscripcion/exito`: muestra mensaje de confirmacion y espera el webhook para activar
6. El webhook `mp-webhook` actualiza el estado en DB

**Rutas nuevas:**
```
/pricing              → PricingView (publica)
/suscripcion          → SubscriptionView (privada: estado actual, historial)
/suscripcion/exito    → SuccessView (post-pago)
/suscripcion/error    → ErrorView (pago fallido)
/admin                → AdminView (solo usuarios admin)
```

### 3.7 Panel de Administracion: `/admin`
Vista solo accesible si `profile.role === 'admin'`. Tabs:

**Tab "Usuarios":**
- Tabla de todos los usuarios con: nombre, email, plan, estado de suscripcion, fecha de vencimiento
- Acciones por usuario: cambiar plan, activar/desactivar features individuales, dar acceso gratuito, cancelar suscripcion

**Tab "Planes":**
- Lista de planes activos
- Editar nombre, descripcion, precio mensual, precio anual de cada plan
- Activar/desactivar un plan (si lo desactivan, los usuarios existentes mantienen el acceso)
- Crear nuevo plan

**Tab "Pagos":**
- Log de eventos de pago (`payment_events`) con fecha, tipo, usuario y estado

**Archivo:** `src/components/AdminView.tsx`

### 3.8 Modificar `ProtectedRoute`
Agregar verificacion de suscripcion:

```typescript
// Si la suscripcion esta vencida/cancelada, mostrar pantalla de renovacion
// Si esta en trial, permitir acceso con banner
// Si es admin, siempre permitir acceso
```

### 3.9 Modificar `Sidebar`
- Agregar item "Admin" solo para usuarios con `role === 'admin'`
- Agregar indicador de estado de suscripcion (icono verde/amarillo/rojo)

### 3.10 Modificar `AuthContext`
- Incluir el `profile.role` en el contexto para evitar consultas adicionales

---

## Fase 4 - Creacion del Usuario Admin

### Pasos exactos:

1. Ir a Supabase Dashboard → Authentication → Users → "Invite user"
2. Ingresar email: `info@intux.solutions`
3. El sistema envia un email de invitacion con contraseña temporal
4. Cambiar la contraseña por una definitiva desde el panel de Auth o al primer login
5. Copiar el UUID del usuario creado
6. Ejecutar en SQL Editor de Supabase:

```sql
INSERT INTO public.admin_users (user_id) VALUES ('<UUID_DEL_USUARIO>');
UPDATE public.profiles SET role = 'admin' WHERE id = '<UUID_DEL_USUARIO>';
```

7. Verificar acceso en `/admin`

**Contraseña inicial sugerida:** `DentalDash2024!` (cambiarla inmediatamente en la primera sesion)

---

## Fase 5 - Configuracion de MercadoPago

### 5.1 Obtener credenciales
1. Crear cuenta en MercadoPago Developers
2. Crear aplicacion → obtener `Access Token` y `Public Key` de produccion
3. Configurar en Supabase Edge Functions → Secrets:
   ```
   MP_ACCESS_TOKEN=APP_USR-...
   MP_PUBLIC_KEY=APP_USR-...
   APP_URL=https://tu-dominio.com
   ```

### 5.2 Configurar Webhook en MercadoPago
En el panel de MercadoPago Developers:
- URL del webhook: `https://<proyecto>.supabase.co/functions/v1/mp-webhook`
- Eventos a escuchar: `payment`, `subscription_preapproval`

### 5.3 Estructura del Pago (Suscripcion Recurrente)
Se usara **Preapproval** (suscripcion recurrente) de MercadoPago:

```json
{
  "reason": "Suscripcion DentalDash Pro",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 25000,
    "currency_id": "ARS"
  },
  "back_url": "https://tu-dominio.com/suscripcion/exito",
  "payer_email": "email_del_usuario@ejemplo.com"
}
```

---

## Orden de Implementacion Recomendado

1. **DB**: Crear las nuevas tablas y configurar el usuario admin
2. **Edge Function `admin-api`**: Permite gestionar todo desde el panel antes de que exista la UI
3. **SubscriptionContext + useFeature hook**: Base sobre la que se construye todo lo demas
4. **FeatureGates en el frontend**: Proteger las funcionalidades actuales con `canUse()`
5. **PricingView**: Landing page publica con los planes
6. **Edge Function `create-checkout`**: Genera la URL de pago de MercadoPago
7. **Edge Function `mp-webhook`**: Recibe confirmaciones de pago y activa suscripciones
8. **SubscriptionBanner + UpgradePrompt**: UX de monetizacion
9. **AdminView**: Panel de administracion completo
10. **Rutas de exito/error de pago**: Cierre del flujo de checkout

---

## Cambios en Archivos Existentes

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Envolver con `SubscriptionProvider`. Agregar rutas `/pricing`, `/suscripcion/*`, `/admin` |
| `src/context/AuthContext.tsx` | Incluir `profile.role` en el contexto |
| `src/router/AppRoutes.tsx` | Agregar rutas nuevas: pricing, suscripcion, admin |
| `src/router/ProtectedRoute.tsx` | Verificar estado de suscripcion ademas de la sesion |
| `src/components/Sidebar.tsx` | Agregar item Admin, indicador de suscripcion |
| `src/components/AuthedApp.tsx` | Agregar `SubscriptionBanner` |
| `src/components/settings/WhatsAppTab.tsx` | Verificar `canUse('whatsapp_bot')` |
| `src/components/OdontogramView.tsx` | Verificar `canUse('odontogram')` |
| `src/components/ClinicalRecordModal.tsx` | Verificar `canUse('clinical_records')` |
| `src/components/ConsentimientoModal.tsx` | Verificar `canUse('consent_forms')` |

---

## Archivos Nuevos a Crear

```
src/
├── context/
│   └── SubscriptionContext.tsx          # Estado global de suscripcion y permisos
├── hooks/
│   └── useSubscription.ts              # Hook para acceder al SubscriptionContext
├── components/
│   ├── PricingView.tsx                  # Landing page de precios (publica)
│   ├── AdminView.tsx                    # Panel de administracion
│   ├── SubscriptionView.tsx             # Vista de suscripcion del usuario
│   ├── SubscriptionBanner.tsx           # Banner de estado de suscripcion
│   └── UpgradePrompt.tsx               # Componente para features bloqueadas
└── services/
    ├── SubscriptionService.ts           # Llamadas a suscripciones en Supabase
    └── AdminService.ts                  # Llamadas a la Edge Function admin-api

supabase/functions/
├── create-checkout/
│   └── index.ts                        # Genera checkout de MercadoPago
├── mp-webhook/
│   └── index.ts                        # Recibe webhooks de MercadoPago
└── admin-api/
    └── index.ts                        # API de administracion
```

---

## Estimacion de Complejidad

| Fase | Complejidad | Dependencias |
|---|---|---|
| DB + Admin user | Baja | Ninguna |
| Edge Function admin-api | Media | DB |
| SubscriptionContext | Media | DB |
| Feature gates en frontend | Baja | SubscriptionContext |
| PricingView | Baja | subscription_plans |
| Edge Function create-checkout | Media-Alta | Cuenta MercadoPago |
| Edge Function mp-webhook | Alta | create-checkout + cuenta MP |
| AdminView | Alta | admin-api |
| Flujo completo integrado | Alta | Todo lo anterior |
