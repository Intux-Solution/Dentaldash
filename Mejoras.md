# Plan de Mejoras y Refactorización

Deuda técnica, refactors y optimizaciones detectados en la auditoría del 2026-07-28. Ninguno de estos puntos rompe la aplicación hoy (los que sí lo hacen están en `Errores.md`), pero todos degradan mantenibilidad, rendimiento o robustez.

---

## [Impacto: Alto] [Esfuerzo: Fácil] El proyecto no tiene linter configurado

* **Ubicación:** `package.json`
* **Categoría:** Mantenibilidad
* **Justificación:** No hay ESLint en el proyecto (ni dependencia, ni configuración, ni script), pese a que el código contiene comentarios `// eslint-disable-line react-hooks/exhaustive-deps` que asumen que existe. Sin `eslint-plugin-react-hooks` no hay nada que detecte el early-return antes de un `useEffect` (ver `Errores.md`, Header.tsx), las dependencias faltantes en efectos, ni las variables muertas. Es la herramienta con mejor relación costo/beneficio para este código base.
* **Antes (Código Actual):**

```json
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "start:prod": "serve -s dist -l tcp://0.0.0.0:${PORT:-80}"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^5.1.4",
    "autoprefixer": "^10.4.24",
    "jsdom": "^28.1.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vitest": "^4.0.18"
  }
```

* **Después (Código Optimizado):**

```json
  "scripts": {
    "start": "vite",
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "test": "vitest",
    "start:prod": "serve -s dist -l tcp://0.0.0.0:${PORT:-80}"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "@vitejs/plugin-react": "^5.1.4",
    "autoprefixer": "^10.4.24",
    "eslint": "^9.18.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-react-refresh": "^0.4.18",
    "jsdom": "^28.1.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vitest": "^4.0.18"
  }
```

Con `eslint.config.js` en la raíz:

```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
```

---

## [Impacto: Alto] [Esfuerzo: Fácil] El update optimista de pacientes escribe en una clave de caché inexistente

* **Ubicación:** `src/hooks/usePatients.ts`
* **Categoría:** Performance / Clean Code
* **Justificación:** La query se registra bajo `[...PATIENTS_KEY, page, pageSize, searchTerm, statusFilter]` pero el `onMutate` lee y escribe `[...PATIENTS_KEY, page, pageSize]`. Esa clave nunca existe: el paciente optimista no aparece jamás en la UI, el snapshot para rollback siempre es `undefined` y el `onError` no restaura nada. Son ~35 líneas que simulan una funcionalidad que no ocurre; la UI se actualiza recién con el `invalidateQueries` del `onSettled`.
* **Antes (Código Actual):**

```typescript
        onMutate: async (newPatientData) => {
            // Cancelar peticiones en vuelo para no pisar la data optimista
            await queryClient.cancelQueries({ queryKey: PATIENTS_KEY });

            // Guardar el snapshot de la data actual para un posible rollback
            const previousData = queryClient.getQueryData<PaginatedResult<Patient>>([...PATIENTS_KEY, page, pageSize]);

            // Crear un paciente optimista temporal
            const optimisticPatient = {
                ...newPatientData,
                id: `temp_${Date.now()}`,
                estado: newPatientData.estado || 'Activo',
            } as unknown as Patient;

            // Inyectar el paciente directamente en la caché de la UI
            queryClient.setQueryData<PaginatedResult<Patient>>([...PATIENTS_KEY, page, pageSize], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    data: [optimisticPatient, ...old.data],
                    total: old.total + 1
                };
            });

            return { previousData };
        },
        onError: (err, newPatient, context) => {
            // Si falla la DB, restauramos la caché original (Rollback)
            if (context?.previousData) {
                queryClient.setQueryData([...PATIENTS_KEY, page, pageSize], context.previousData);
            }
            console.error("Error creando paciente:", err);
        },
```

* **Después (Código Optimizado):**

```typescript
        onMutate: async (newPatientData) => {
            // La clave debe ser EXACTAMENTE la de la query activa; con una clave
            // parcial el update optimista escribe en una entrada que no existe.
            const activeKey = [...PATIENTS_KEY, page, pageSize, searchTerm, statusFilter];
            await queryClient.cancelQueries({ queryKey: PATIENTS_KEY });

            const previousData = queryClient.getQueryData<PaginatedResult<Patient>>(activeKey);

            const optimisticPatient = {
                ...newPatientData,
                id: `temp_${Date.now()}`,
                estado: newPatientData.estado || 'Activo',
            } as unknown as Patient;

            queryClient.setQueryData<PaginatedResult<Patient>>(activeKey, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    data: [optimisticPatient, ...old.data],
                    total: old.total + 1,
                };
            });

            return { previousData, activeKey };
        },
        onError: (err, newPatient, context) => {
            if (context?.previousData && context.activeKey) {
                queryClient.setQueryData(context.activeKey, context.previousData);
            }
            console.error("Error creando paciente:", err);
        },
```

---

## [Impacto: Alto] [Esfuerzo: Medio] GoogleCalendarService: ~250 líneas de código muerto que contradicen la arquitectura documentada

* **Ubicación:** `src/services/GoogleCalendarService.ts`
* **Categoría:** Arquitectura / Clean Code
* **Justificación:** CLAUDE.md establece que "la sincronización con Google Calendar y el cálculo de franjas ocupadas van **siempre** por la Edge Function `calendar-sync`, nunca desde el navegador". Sin embargo el archivo conserva `listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `fetchWithAuth`, `isConnected`, `getProviderToken` y toda la maquinaria de caché de tokens. Una búsqueda en `src/` confirma que **el único método usado desde fuera es `clearTokenCache()`** (AuthContext y useSettings). El resto son 250 líneas que hacen llamadas directas a `googleapis.com` desde el browser — el camino roto que `calendar-sync` vino a reemplazar. Mantenerlas invita a reintroducir el bug y confunde a quien lea el código.
* **Antes (Código Actual):**

```typescript
export class GoogleCalendarService {
    static getProviderToken(session: any) { /* ... */ }
    static getRefreshToken(session: any) { /* ... */ }
    private static async resolveRefreshToken(session: any): Promise<string | null> { /* ... */ }
    static async isConnected(session: any): Promise<boolean> { /* ... */ }
    static clearTokenCache() { /* ... */ }
    static async refreshGoogleToken(session: any) { /* ... */ }
    static async fetchWithAuth(url: string, options: any = {}, session: any = null): Promise<Response> { /* ... */ }
    static async listEvents(timeMin: Date, timeMax: Date, session: any = null) { /* ... */ }
    static async createEvent(appointment: any, session: any = null) { /* ... */ }
    static async updateEvent(googleEventId: string, appointment: any, session: any = null) { /* ... */ }
    static async deleteEvent(googleEventId: string, session: any = null) { /* ... */ }
}
```

* **Después (Código Optimizado):**

```typescript
/**
 * Estado de conexión con Google Calendar en el cliente.
 *
 * Toda la sincronización real vive en la Edge Function `calendar-sync`
 * (ver CalendarSyncService): corre server-side con el `google_refresh_token`
 * de `profiles`. Este módulo solo conserva el caché de "conectado / no
 * conectado" que la UI necesita invalidar al conectar o desconectar.
 */
export class GoogleCalendarService {
    /**
     * Invalida el estado de conexión cacheado.
     * Debe llamarse al desconectar Google o al cerrar sesión.
     */
    static clearTokenCache(): void {
        cachedIsConnected = null;
    }
}

let cachedIsConnected: boolean | null = null;
```

Eliminar `google-token-refresh` del frontend queda cubierto: tras este cambio nada en `src/` invoca esa Edge Function.

---

## [Impacto: Alto] [Esfuerzo: Medio] ClinicalRecordModal y ConsentimientoModal son el mismo componente duplicado

* **Ubicación:** `src/components/ClinicalRecordModal.tsx`, `src/components/ConsentimientoModal.tsx`
* **Categoría:** Arquitectura (DRY)
* **Justificación:** Los dos archivos son casi idénticos (~340 y ~330 líneas): mismos helpers `kindFromMime`/`kindFromUrl`, mismos cuatro `useEffect`, mismo `handleFileChange`, mismo bloque de preview PDF/imagen/Word. Solo cambian el título, el campo de la DB (`historia_clinica_url` vs `consentimiento_url`), el método de upload y los textos. Cada bug encontrado (el orden de borrado en `Errores.md`, por ejemplo) hay que arreglarlo dos veces, y ya se nota la deriva: uno maneja `isGoogleDrive` y el otro no.
* **Antes (Código Actual):**

```typescript
// ClinicalRecordModal.tsx
export default function ClinicalRecordModal({ open, patient, onClose, session }: ClinicalRecordModalProps) {
  // ...340 líneas...
  const newPath = await PatientService.uploadClinicalRecord(file, userId);
  const { error: updateError } = await supabase
    .from('patients').update({ historia_clinica_url: newPath })
    .eq('id', patient.id).eq('user_id', userId);
}

// ConsentimientoModal.tsx  ← mismas 330 líneas con otros dos identificadores
export default function ConsentimientoModal({ open, patient, onClose, session }: ConsentimientoModalProps) {
  const newPath = await PatientService.uploadConsentimiento(file, userId);
  const { error: updateError } = await supabase
    .from('patients').update({ consentimiento_url: newPath })
    .eq('id', patient.id).eq('user_id', userId);
}
```

* **Después (Código Optimizado):**

```typescript
// src/components/PatientDocumentModal.tsx — componente único parametrizado
import React from 'react';
import { Patient } from '../types/database.types';
import { Session } from '@supabase/supabase-js';

export interface PatientDocumentConfig {
  /** Título del modal */
  title: string;
  /** Columna de `patients` donde se guarda el path */
  column: 'historia_clinica_url' | 'consentimiento_url';
  /** Sube el archivo y devuelve el path dentro del bucket */
  upload: (file: File, userId: string) => Promise<string>;
  /** Campos del objeto paciente donde puede venir el path (orden de preferencia) */
  urlFields: string[];
  /** Texto del toast de éxito */
  successMessage: string;
  /** Texto cuando no hay archivo */
  emptyMessage: string;
}

interface PatientDocumentModalProps {
  open: boolean;
  patient: Patient | null | any;
  onClose: () => void;
  session: Session | null;
  config: PatientDocumentConfig;
}

export default function PatientDocumentModal({ open, patient, onClose, session, config }: PatientDocumentModalProps) {
  // Cuerpo único: el actual de ClinicalRecordModal, reemplazando
  //   patient.historiaClinica || ...            → config.urlFields.map(f => patient[f]).find(Boolean) ?? ''
  //   PatientService.uploadClinicalRecord(...)   → config.upload(file, userId)
  //   .update({ historia_clinica_url: newPath }) → .update({ [config.column]: newPath })
  //   "Historia Clínica"                         → config.title
}
```

```typescript
// src/components/documentModalConfigs.ts
import { PatientService } from '../services/PatientService';
import type { PatientDocumentConfig } from './PatientDocumentModal';

export const CLINICAL_RECORD_CONFIG: PatientDocumentConfig = {
  title: 'Historia Clínica',
  column: 'historia_clinica_url',
  upload: (file, userId) => PatientService.uploadClinicalRecord(file, userId),
  urlFields: ['historiaUrl', 'odontogramaUrl', 'odontograma', 'historiaClinica', 'historiaClinicaUrl', 'historia_clinica_url'],
  successMessage: 'Archivo subido exitosamente',
  emptyMessage: 'No hay archivo seleccionado',
};

export const CONSENT_CONFIG: PatientDocumentConfig = {
  title: 'Consentimiento Informado',
  column: 'consentimiento_url',
  upload: (file, userId) => PatientService.uploadConsentimiento(file, userId),
  urlFields: ['consentimientoUrl', 'consentimiento_url'],
  successMessage: 'Consentimiento subido exitosamente',
  emptyMessage: 'No hay consentimiento adjunto',
};
```

`ModalsRoot` pasa a montar `<PatientDocumentModal config={CLINICAL_RECORD_CONFIG} .../>` y `<PatientDocumentModal config={CONSENT_CONFIG} .../>`. Se eliminan ~330 líneas duplicadas.

---

## [Impacto: Alto] [Esfuerzo: Fácil] La lista de feature keys está duplicada en cuatro lugares

* **Ubicación:** `src/config/featureKeys.ts`, `supabase/functions/admin-api/index.ts`, `supabase/functions/mp-webhook/index.ts`, `supabase/migrations/20260727000000_scheduled_plan_change.sql`
* **Categoría:** Arquitectura (DRY) / Mantenibilidad
* **Justificación:** Las 11 claves de funcionalidades están escritas literalmente en cuatro archivos: el frontend, dos Edge Functions y una función PL/pgSQL. Agregar una feature nueva exige tocar los cuatro y recordar redeployar dos funciones; si alguno queda desactualizado el usuario recibe permisos incompletos según qué camino disparó la actualización (admin manual, webhook de pago o cron de downgrade). Las Edge Functions pueden compartir un módulo, igual que ya comparten `_shared/google-calendar.ts`.
* **Antes (Código Actual):**

```typescript
// admin-api/index.ts (y copia idéntica en mp-webhook/index.ts)
const ALL_FEATURES = [
  "appointments",
  "odontogram",
  "clinical_records",
  "consent_forms",
  "patients_unlimited",
  "insurance_management",
  "services_config",
  "export_data",
  "whatsapp_bot",
  "google_calendar",
  "faqs_config",
];
```

* **Después (Código Optimizado):**

```typescript
// supabase/functions/_shared/feature-keys.ts
/**
 * Claves de funcionalidad del sistema. Fuente de verdad para las Edge Functions.
 * Debe mantenerse en sync con src/config/featureKeys.ts (frontend) y con
 * apply_pending_plan_changes() (SQL).
 */
export const ALL_FEATURES = [
  "appointments",
  "odontogram",
  "clinical_records",
  "consent_forms",
  "patients_unlimited",
  "insurance_management",
  "services_config",
  "export_data",
  "whatsapp_bot",
  "google_calendar",
  "faqs_config",
] as const;

/** Construye el upsert completo de feature_permissions para un usuario. */
export function buildPermissionRows(userId: string, enabledKeys: string[], now = new Date().toISOString()) {
  return ALL_FEATURES.map((key) => ({
    user_id: userId,
    feature_key: key,
    enabled: enabledKeys.includes(key),
    updated_at: now,
  }));
}
```

```typescript
// admin-api/index.ts y mp-webhook/index.ts
import { ALL_FEATURES, buildPermissionRows } from "../_shared/feature-keys.ts";
// ...
await supabase
  .from("feature_permissions")
  .upsert(buildPermissionRows(target_user_id, enabledFeatures), { onConflict: "user_id,feature_key" });
```

Para el lado SQL, reemplazar el array literal de `apply_pending_plan_changes()` por una lectura de las claves distintas ya existentes, evitando una cuarta copia:

```sql
  v_all_features text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT fk), ARRAY[]::text[])
    INTO v_all_features
  FROM public.subscription_plans sp, unnest(COALESCE(sp.feature_keys, '{}')) AS fk;
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] index.html apunta a `/src/index.jsx`, un archivo que no existe

* **Ubicación:** `index.html`
* **Categoría:** Mantenibilidad
* **Justificación:** El entry point real es `src/index.tsx`. El build funciona solo porque el resolver de Vite prueba extensiones alternativas, pero es una inconsistencia frágil que rompe con cualquier cambio de configuración de `resolve.extensions` y desorienta a quien busque el punto de entrada. La meta description además sigue diciendo "Web site created using create-react-app" en un proyecto Vite, y aparece en los resultados de búsqueda y al compartir el link.
* **Antes (Código Actual):**

```html
  <meta name="description" content="Web site created using create-react-app" />
  <link rel="apple-touch-icon" href="/logo192.png" />
  <link rel="manifest" href="/manifest.json" />
  <title>DentalDash by Intux Solutions</title>
</head>

<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <script type="module" src="/src/index.jsx"></script>
</body>
```

* **Después (Código Optimizado):**

```html
  <meta name="description" content="DentalDash — gestión de turnos, pacientes e historias clínicas para consultorios odontológicos." />
  <link rel="apple-touch-icon" href="/logo192.png" />
  <link rel="manifest" href="/manifest.json" />
  <title>DentalDash by Intux Solutions</title>
</head>

<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <script type="module" src="/src/index.tsx"></script>
</body>
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] La configuración de CORS está copiada en cinco Edge Functions

* **Ubicación:** `supabase/functions/{admin-api,create-checkout,calendar-sync,notify-appointment,public-booking}/index.ts`
* **Categoría:** Arquitectura (DRY)
* **Justificación:** El bloque `ALLOWED_ORIGINS` + `buildCors()` está replicado literalmente en cinco funciones, con el dominio de producción hardcodeado en cada copia. Cambiar de dominio o agregar un origen implica editar y redeployar cinco archivos, con el riesgo de que alguno quede atrás y bloquee el frontend en producción. Ya existe la convención `_shared/` para exactamente esto.
* **Antes (Código Actual):**

```typescript
const ALLOWED_ORIGINS = [
  "https://dashboard.dentaldash.cloud",
  ...(Deno.env.get("APP_URL") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")),
].filter(Boolean);

function buildCors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
```

* **Después (Código Optimizado):**

```typescript
// supabase/functions/_shared/cors.ts
/**
 * Allowlist de orígenes. Se configura vía APP_URL (coma-separada); el dominio de
 * producción está incluido por defecto para que un APP_URL mal cargado no deje
 * al frontend sin CORS.
 */
const ALLOWED_ORIGINS = [
  "https://dashboard.dentaldash.cloud",
  ...(Deno.env.get("APP_URL") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")),
].filter(Boolean);

export function buildCors(
  origin: string | null,
  headers = "authorization, x-client-info, apikey, content-type",
): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": headers,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
```

```typescript
// en cada función
import { buildCors } from "../_shared/cors.ts";
// public-booking, que no recibe Authorization:
const corsHeaders = buildCors(req.headers.get("origin"), "content-type");
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] chat-webhook y whatsapp-manager usan `Access-Control-Allow-Origin: *`

* **Ubicación:** `supabase/functions/chat-webhook/index.ts`, `supabase/functions/whatsapp-manager/index.ts`, `supabase/functions/google-token-refresh/index.ts`, `supabase/functions/cleanup-orphaned-files/index.ts`
* **Categoría:** Arquitectura / Seguridad defensiva
* **Justificación:** Cuatro funciones quedaron con CORS abierto mientras las otras cinco ya usan allowlist. En `chat-webhook` y `cleanup-orphaned-files` el header es directamente innecesario (los llama Evolution API y pg_cron, no un navegador); en `whatsapp-manager` y `google-token-refresh` sí los llama el browser autenticado y deberían usar la misma allowlist que el resto. Un `*` no es explotable por sí solo (el token va en el header, no en cookies), pero elimina una capa de defensa y rompe la consistencia del proyecto.
* **Antes (Código Actual):**

```typescript
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

* **Después (Código Optimizado):**

```typescript
// whatsapp-manager y google-token-refresh (los llama el navegador):
import { buildCors } from "../_shared/cors.ts";
// dentro del serve():
const corsHeaders = buildCors(req.headers.get('origin'));
```

```typescript
// chat-webhook y cleanup-orphaned-files (server-to-server: sin CORS):
// No hay navegador involucrado — Evolution API y pg_cron no envían Origin.
const corsHeaders: Record<string, string> = {};
```

---

## [Impacto: Medio] [Esfuerzo: Medio] PacientesView filtra dos veces los mismos datos

* **Ubicación:** `src/components/PacientesView.tsx`
* **Categoría:** Performance / Clean Code
* **Justificación:** `PatientService.searchPatients()` ya filtra por nombre/DNI en el servidor y `fetchPatientsPaginated()` ya aplica el filtro de estado, pero el componente vuelve a filtrar todo en el cliente con `norm()` sobre el resultado. Es trabajo duplicado y, peor, inconsistente: la búsqueda del servidor usa `ilike` (sensible a acentos) y la del cliente usa `norm()` (insensible), así que un paciente "Pérez" buscado como "perez" pasa el filtro cliente pero nunca llega desde el servidor. Además `searchPatients` tiene `limit(100)` sin paginación, con lo cual una búsqueda amplia trunca silenciosamente los resultados.
* **Antes (Código Actual):**

```typescript
    const filteredPacientes = useMemo(() => {
        const term = norm(searchTerm || '');
        return localPatients
            .filter((p) => {
                const matchesSearch = term ? (norm(p?.nombre || '').includes(term) || norm(String(p?.dni || '')).includes(term)) : true;
                const matchesStatus = statusFilter === 'Todos'
                    ? (p?.estado !== 'Inactivo')
                    : (p?.estado === statusFilter);
                return matchesSearch && matchesStatus;
            })
            .slice()
            .sort((a, b) => collator.compare(a?.nombre || '', b?.nombre || ''));
    }, [searchTerm, statusFilter, localPatients, collator]);
```

* **Después (Código Optimizado):**

```typescript
    // El filtrado (búsqueda y estado) ya lo resuelve el servidor: PatientService
    // aplica `ilike` sobre nombre/dni y el filtro de estado. Acá solo ordenamos,
    // que es lo único que la UI necesita decidir localmente.
    const filteredPacientes = useMemo(
        () => [...localPatients].sort((a, b) => collator.compare(a?.nombre || '', b?.nombre || '')),
        [localPatients, collator]
    );
```

Y para que la búsqueda del servidor sea también insensible a acentos, aplicar en la DB (migración):

```sql
-- Índices trigram insensibles a acentos para la búsqueda de pacientes.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_patients_nombre_trgm
  ON public.patients USING gin (lower(public.unaccent(nombre)) gin_trgm_ops);
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] `usePatients()` sin sesión rompe las mutaciones (camino latente)

* **Ubicación:** `src/components/PacientesView.tsx`, `src/hooks/usePatients.ts`
* **Categoría:** Tipado / Mantenibilidad
* **Justificación:** `PacientesView` llama `usePatients()` sin argumentos, por lo que `session` es `null` y `userId` también. El `deletePatient` que obtiene y pasa a `PatientTable` como `onDelete` lanzaría "No hay sesión activa para eliminar paciente". Hoy no se dispara porque `showActions={false}` oculta el botón, pero el bug queda armado esperando a que alguien active la columna de acciones. Lo mismo aplica al `usePatients(null, 1, 4, ...)` de `DashboardView`. La firma del hook debería impedir este uso.
* **Antes (Código Actual):**

```typescript
export default function PacientesView() {
    const { patients, loading: patientsLoading, deletePatient } = usePatients();
```

* **Después (Código Optimizado):**

```typescript
export default function PacientesView() {
    const { session } = useAuth();
    const { patients, loading: patientsLoading, deletePatient } = usePatients(
        session, 1, 300, searchTerm, statusFilter
    );
```

(agregando `import { useAuth } from '../context/AuthContext';` y moviendo la lectura de `searchParams` por encima de la llamada al hook). Complementariamente, hacer explícito el contrato en el hook:

```typescript
export function usePatients(
    session: Session | null,   // ← ya no tiene default: forzar la decisión en el llamador
    page = 1,
    pageSize = 300,
    searchTerm = '',
    statusFilter = 'Todos'
): UsePatientsResult {
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] `AppointmentService.getAppointments` pierde turnos que cruzan el límite del rango

* **Ubicación:** `src/repositories/AppointmentRepository.ts`
* **Categoría:** Clean Code / Correctitud de datos
* **Justificación:** El filtro combina `start_time >= from` con `end_time <= to`, es decir exige que el turno esté **completamente** contenido en la ventana. Un turno que empieza a las 23:45 y termina a las 00:15 del día siguiente no aparece en ninguna de las dos consultas diarias. El resto del código (`getAppointmentsForDay`, `public-booking`) usa la convención correcta de solapamiento; esta query quedó con otra semántica.
* **Antes (Código Actual):**

```typescript
    static async getAppointments(fromISO: string, toISO: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                patient:patients (nombre, dni, telefono, email)
            `)
            .gte('start_time', fromISO)
            .lte('end_time', toISO);
```

* **Después (Código Optimizado):**

```typescript
    static async getAppointments(fromISO: string, toISO: string) {
        // Solapamiento con la ventana, no contención: un turno que cruza la
        // medianoche debe aparecer en el día en que empieza.
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                patient:patients (nombre, dni, telefono, email)
            `)
            .lte('start_time', toISO)
            .gte('end_time', fromISO);
```

---

## [Impacto: Medio] [Esfuerzo: Medio] `syncPendingAppointments` corre en cada fetch de turnos, sin límite

* **Ubicación:** `src/hooks/useAppointmentsQuery.ts`, `src/services/AppointmentService.ts`
* **Categoría:** Performance
* **Justificación:** Cada vez que la query de turnos se ejecuta (montaje de vista, invalidación tras una mutación, evento de realtime) se dispara `syncPendingAppointments`, que trae **todos** los turnos futuros sin `google_event_id` y los sincroniza uno por uno, secuencialmente, con un round-trip a la Edge Function por turno. Con la app abierta y varias invalidaciones seguidas se acumulan pasadas redundantes sobre el mismo conjunto. El único freno es el early-return cuando Google no está conectado.
* **Antes (Código Actual):**

```typescript
            const events = await AppointmentService.getAppointments(fromISO, toISO, session);

            // Trigger background sync for any unsynced confirmed appointments
            if (session?.user?.id) {
                AppointmentService.syncPendingAppointments(session).catch(e => console.error("Background sync error:", e));
            }
```

* **Después (Código Optimizado):**

```typescript
            const events = await AppointmentService.getAppointments(fromISO, toISO, session);

            // Sincronización de rezagados: a lo sumo una vez cada 5 minutos por
            // sesión. Antes corría en cada refetch (montaje, mutación, realtime),
            // recorriendo el mismo conjunto de turnos una y otra vez.
            if (session?.user?.id && Date.now() - lastPendingSyncAt > PENDING_SYNC_INTERVAL_MS) {
                lastPendingSyncAt = Date.now();
                AppointmentService.syncPendingAppointments(session)
                    .catch(e => console.error("Background sync error:", e));
            }
```

con, a nivel de módulo:

```typescript
const PENDING_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastPendingSyncAt = 0;
```

Y en `AppointmentService.syncPendingAppointments`, acotar el lote para que un backlog grande no genere decenas de requests seguidos:

```typescript
            const pending = await AppointmentRepository.getPendingGoogleSync(new Date().toISOString());
            if (!pending || pending.length === 0) return;

            // Tope por pasada: el resto se reintenta en la siguiente. Evita
            // encadenar decenas de llamadas a la Edge Function de una sola vez.
            for (const appt of pending.slice(0, 10)) {
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] Comunicación entre componentes vía eventos globales del `window`

* **Ubicación:** `src/hooks/usePatients.ts`, `src/hooks/useAppointmentsQuery.ts`, `src/hooks/usePatientModals.tsx`, `src/components/ClinicalRecordModal.tsx`, `src/components/settings/useSettings.ts` y otros
* **Categoría:** Arquitectura
* **Justificación:** El código dispara y escucha `CustomEvent`s globales (`patients:refresh`, `turnos:refresh`, `profile:updated`) para invalidar caché — un bus de eventos paralelo al que React Query ya provee. Esto rompe la trazabilidad (no se puede saber quién refresca qué sin buscar strings en todo el repo), duplica trabajo (varios listeners reaccionan al mismo evento y disparan refetches simultáneos: `usePatients`, `usePatientModals` y `useTurnosView` escuchan eventos superpuestos) y es propenso a listeners huérfanos. `queryClient.invalidateQueries` hace exactamente esto de forma tipada y deduplicada.
* **Antes (Código Actual):**

```typescript
// usePatients.ts
useEffect(() => {
    window.addEventListener('patients:refresh', invalidate);
    return () => {
        window.removeEventListener('patients:refresh', invalidate);
    };
}, []); // eslint-disable-line react-hooks/exhaustive-deps

// ClinicalRecordModal.tsx, tras guardar
window.dispatchEvent(new CustomEvent('patients:refresh'));
```

* **Después (Código Optimizado):**

```typescript
// usePatients.ts — se elimina el listener por completo:
// la invalidación llega por queryClient, que ya deduplica refetches.

// ClinicalRecordModal.tsx
import { useQueryClient } from '@tanstack/react-query';
// ...
const queryClient = useQueryClient();
// ...tras guardar:
queryClient.invalidateQueries({ queryKey: ['patients'] });
```

Migrar los tres eventos de una vez (son ~10 llamadas en total) evita quedar con los dos mecanismos conviviendo, que es el peor escenario.

---

## [Impacto: Medio] [Esfuerzo: Fácil] `WORK_HOURS` expone constantes que ya no se usan

* **Ubicación:** `src/config/appointments.ts`
* **Categoría:** Clean Code
* **Justificación:** El archivo declara `start: 9` y `end: 18` pero los horarios reales vienen de la tabla `schedules` por usuario; solo `interval` se usa (en `AppointmentBusinessLogic`). Las otras dos constantes sugieren un horario global fijo que no existe, y el comentario de cabecera menciona "Tipos de turno y días laborales" que tampoco están ahí (viven en `profiles.services`). Es un archivo que desinforma más de lo que aporta.
* **Antes (Código Actual):**

```typescript
// src/config/appointments.js
// Tipos de turno y días laborales centralizados

export const WORK_HOURS = {
  start: 9,
  end: 18,
  interval: 30, // minutes
};
```

* **Después (Código Optimizado):**

```typescript
// src/config/appointments.ts
// Los horarios laborales reales viven en la tabla `schedules` (por usuario y día).
// Acá solo queda la granularidad con la que se generan los slots ofrecidos.

/** Paso entre inicios de slot, en minutos. */
export const SLOT_INTERVAL_MINUTES = 30;
```

Actualizando el único consumidor, `AppointmentBusinessLogic`:

```typescript
import { SLOT_INTERVAL_MINUTES } from '../config/appointments';
// ...
current = addMinutes(current, SLOT_INTERVAL_MINUTES);
```

---

## [Impacto: Medio] [Esfuerzo: Medio] `useModals` deprecado sigue en uso en las dos vistas principales

* **Ubicación:** `src/hooks/useModals.tsx`, `src/components/DashboardView.tsx`, `src/components/PacientesView.tsx`
* **Categoría:** Arquitectura
* **Justificación:** El propio archivo marca `useModals` como `@deprecated` y recomienda los hooks específicos, pero Dashboard y Pacientes siguen usándolo. El hook combinado suscribe cada componente a **ambos** contextos, así que un cambio en cualquier modal de turnos re-renderiza toda la lista de pacientes y viceversa. Migrar son dos líneas por archivo.
* **Antes (Código Actual):**

```typescript
// DashboardView.tsx
import { useModals } from '../hooks/useModals';
// ...
const {
    openAddPatient,
    onViewPatient,
    onOpenRecord,
    openBookingModal,
    onViewTurno
} = useModals();
```

* **Después (Código Optimizado):**

```typescript
// DashboardView.tsx
import { usePatientModals } from '../hooks/usePatientModals';
import { useAppointmentModals } from '../hooks/useAppointmentModals';
// ...
const { openAddPatient, onViewPatient, onOpenRecord } = usePatientModals();
const { openBookingModal, onViewTurno } = useAppointmentModals();
```

```typescript
// PacientesView.tsx
import { usePatientModals } from '../hooks/usePatientModals';
// ...
const { openAddPatient, onViewPatient, onOpenRecord } = usePatientModals();
```

Con eso `useModals.tsx` queda sin consumidores y se puede eliminar junto con `ModalsProvider`.

---

## [Impacto: Medio] [Esfuerzo: Fácil] `ServicesTab` lee inputs con `document.getElementById`

* **Ubicación:** `src/components/settings/ServicesTab.tsx`
* **Categoría:** Clean Code
* **Justificación:** El componente accede al DOM por id para leer y limpiar los campos, saltándose el modelo de React. Los ids son globales (colisionan si el tab se monta dos veces), el estado no es observable, y el resto del proyecto usa React Hook Form. Además el `props` del componente está tipado como `{ [key: string]: any }`, sin ningún tipo real.
* **Antes (Código Actual):**

```typescript
export default function ServicesTab({ profile, handleProfileChange, handleAutoSaveProfile }: { [key: string]: any }) {
    const handleAdd = async () => {
        const nameEl = document.getElementById('service-name') as HTMLInputElement;
        const durEl = document.getElementById('service-duration') as HTMLInputElement;
        if (nameEl?.value.trim()) {
            const id = nameEl.value.toLowerCase().replace(/\s+/g, '_');
            const newServices = [...(profile.services || []), { id, name: nameEl.value.trim(), duration: parseInt(durEl.value) || 30 }];
            handleProfileChange('services', newServices);
            nameEl.value = '';
            durEl.value = '30';
            await handleAutoSaveProfile({ services: newServices });
        }
    };
```

* **Después (Código Optimizado):**

```typescript
import React, { useState } from 'react';
import { ProfileData } from './useSettings';

interface Service { id: string; name: string; duration: number }

interface ServicesTabProps {
    profile: ProfileData;
    handleProfileChange: (field: string, value: unknown) => void;
    handleAutoSaveProfile: (updates: Partial<ProfileData>) => void;
}

export default function ServicesTab({ profile, handleProfileChange, handleAutoSaveProfile }: ServicesTabProps) {
    const [newName, setNewName] = useState('');
    const [newDuration, setNewDuration] = useState(30);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) return;
        const service: Service = {
            id: name.toLowerCase().replace(/\s+/g, '_'),
            name,
            duration: newDuration > 0 ? newDuration : 30,
        };
        const newServices = [...((profile.services as unknown as Service[]) || []), service];
        handleProfileChange('services', newServices);
        setNewName('');
        setNewDuration(30);
        await handleAutoSaveProfile({ services: newServices as unknown as ProfileData['services'] });
    };
```

con los inputs controlados:

```tsx
<input
    type="text"
    value={newName}
    onChange={(e) => setNewName(e.target.value)}
    placeholder="Ej: Limpieza Completa"
    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
/>
<input
    type="number"
    value={newDuration}
    onChange={(e) => setNewDuration(Number(e.target.value))}
    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
/>
```

---

## [Impacto: Medio] [Esfuerzo: Fácil] Índices sin usar en producción (13 detectados)

* **Ubicación:** Base de datos (advisors de performance del proyecto)
* **Categoría:** Performance
* **Justificación:** El advisor de Supabase reporta 13 índices que nunca fueron utilizados, entre ellos cinco sobre `chat_history` (`idx_chat_history_instance`, `idx_chat_history_jid_created_at`, `idx_chat_history_jid_tenant`, `idx_chat_history_created_at`) — la tabla que más crece del sistema. Cada índice de más encarece los `INSERT` del webhook de WhatsApp y ocupa espacio. Notar que varios (`idx_patients_user_id`, `idx_appointments_user_id`) figuran sin uso porque el volumen actual hace que el planner prefiera seq scan; esos conviene conservarlos. El corte razonable es eliminar los redundantes de `chat_history`, donde hay cuatro índices solapados sobre las mismas columnas.
* **Antes (Código Actual):**

```text
idx_chat_history_instance        — nunca usado
idx_chat_history_jid_created_at  — nunca usado
idx_chat_history_jid_tenant      — nunca usado
idx_chat_history_created_at      — nunca usado
```

* **Después (Código Optimizado):**

```sql
-- Migración: 20260728000001_prune_chat_history_indexes.sql
-- chat_history tiene cuatro índices solapados y ninguno se usa: el webhook
-- consulta siempre por (jid, whatsapp_instance, status, created_at).
-- Se deja UN índice que cubre ese patrón y se eliminan los demás.
DROP INDEX IF EXISTS public.idx_chat_history_instance;
DROP INDEX IF EXISTS public.idx_chat_history_jid_created_at;
DROP INDEX IF EXISTS public.idx_chat_history_jid_tenant;
DROP INDEX IF EXISTS public.idx_chat_history_created_at;

CREATE INDEX IF NOT EXISTS idx_chat_history_lookup
  ON public.chat_history (jid, whatsapp_instance, status, created_at DESC);
```

---

## [Impacto: Bajo] [Esfuerzo: Fácil] `pg_net` instalado en el schema `public`

* **Ubicación:** Base de datos (advisor `extension_in_public`)
* **Categoría:** Arquitectura / Seguridad defensiva
* **Justificación:** El advisor marca `pg_net` en `public`. La migración `20260610000002` documenta que la extensión no soporta `SET SCHEMA` y lo asume como excepción conocida — la decisión está bien fundada. Lo que falta es que quede registrado como excepción aceptada en lugar de reaparecer en cada auditoría como hallazgo abierto.
* **Antes (Código Actual):**

```sql
-- pg_net queda en public: la extension no soporta SET SCHEMA
-- ("extension pg_net does not support SET SCHEMA", probado con v0.19.5).
-- El lint 0014 para pg_net se asume como excepcion conocida; sus funciones viven
-- en el schema net y el cron job (net.http_post) no se ve afectado.
```

* **Después (Código Optimizado):**

```sql
-- Excepción aceptada y documentada en la propia DB, para que quien audite
-- vea la justificación sin tener que buscar en el historial de migraciones.
COMMENT ON EXTENSION pg_net IS
  'Excepción aceptada al lint 0014 (extension_in_public): pg_net no soporta SET SCHEMA '
  '(verificado en v0.19.5). Sus funciones viven en el schema net; el único consumidor '
  'es el cron job cleanup-orphaned-files vía net.http_post. Revisar si una versión '
  'futura habilita el movimiento de schema.';
```

Alternativa si se quiere cerrar del todo: reinstalar la extensión con `DROP EXTENSION pg_net; CREATE EXTENSION pg_net SCHEMA extensions;` en una ventana de mantenimiento, recreando después el cron job.

---

## [Impacto: Bajo] [Esfuerzo: Fácil] `Header.tsx` desmonta el canal de realtime con un `setTimeout`

* **Ubicación:** `src/components/Header.tsx`
* **Categoría:** Clean Code
* **Justificación:** El cleanup difiere `removeChannel` 500 ms "para evitar WebSocket is closed before the connection is established". Es un parche por tiempo: si el componente se remonta antes de que el timeout dispare, el canal nuevo se crea mientras el viejo aún vive (dos suscripciones al mismo filtro) y el timeout puede terminar cerrando el canal equivocado en un remonte rápido. `useAppointmentsQuery` resuelve lo mismo sin timeout.
* **Antes (Código Actual):**

```typescript
    return () => {
      window.removeEventListener('profile:updated', fetchUserData);
      // Small delay prevents "WebSocket is closed before the connection is established"
      // if React unmounts immediately during StrictMode or rapid auth changes.
      setTimeout(() => {
        supabase.removeChannel(profileSubscription);
      }, 500);
    };
```

* **Después (Código Optimizado):**

```typescript
    return () => {
      window.removeEventListener('profile:updated', fetchUserData);
      // removeChannel devuelve una promesa: dejar que la librería cierre el socket
      // en orden en vez de diferirlo por tiempo (un remonte rápido dentro de la
      // ventana de 500 ms dejaba dos canales vivos sobre el mismo filtro).
      supabase.removeChannel(profileSubscription).catch(() => { /* canal ya cerrado */ });
    };
```

---

## [Impacto: Bajo] [Esfuerzo: Fácil] `console.log` de payloads de realtime en producción

* **Ubicación:** `src/hooks/useAppointmentsQuery.ts`, `src/services/AppointmentService.ts`
* **Categoría:** Clean Code / Privacidad
* **Justificación:** Cada evento de realtime imprime el payload completo del turno en la consola del navegador, y `AppointmentService.createAppointment` loguea el DNI del paciente. Son datos de salud y documentos de identidad que quedan en la consola de cualquier equipo compartido del consultorio. El proyecto ya tiene el patrón correcto: el `devLog` de `GoogleCalendarService`, que solo escribe en desarrollo.
* **Antes (Código Actual):**

```typescript
                (payload) => {
                    console.log('Cambio detectado vía Supabase Realtime:', payload);
                    // Invalidamos la query principal para forzar un refetch silencioso
                    queryClient.invalidateQueries({ queryKey: ['turnos'] });
                }
```

```typescript
                    console.log(`[AppointmentService] Found existing patient by DNI ${cleanDni} -> ID: ${patientId}`);
```

* **Después (Código Optimizado):**

```typescript
// src/utils/devLog.ts
/** Log solo en desarrollo: evita filtrar datos de pacientes a la consola en producción. */
export const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) console.log(...args);
};
```

```typescript
// useAppointmentsQuery.ts
                (payload) => {
                    devLog('Cambio detectado vía Supabase Realtime:', payload);
                    queryClient.invalidateQueries({ queryKey: ['turnos'] });
                }
```

```typescript
// AppointmentService.ts — sin el DNI en el mensaje
                    devLog(`[AppointmentService] Paciente existente encontrado -> ID: ${patientId}`);
```

---

## [Impacto: Bajo] [Esfuerzo: Fácil] `useAppointmentsQuery` importa `Appointment` sin usarlo

* **Ubicación:** `src/hooks/useAppointmentsQuery.ts`
* **Categoría:** Clean Code
* **Justificación:** El import de `Appointment` no se usa en el archivo (la query devuelve `any[]`). Es sintomático de la falta de linter: `noUnusedLocals` está en `false` en `tsconfig.json`, así que nada lo detecta. Corregirlo además invita a tipar el retorno de la query, que hoy es implícitamente `any`.
* **Antes (Código Actual):**

```typescript
import { addDays, isAfter } from 'date-fns';
import { Appointment } from '../types/appointments';
import { supabase } from '../config/supabaseClient';
```

* **Después (Código Optimizado):**

```typescript
import { addDays, isAfter } from 'date-fns';
import { supabase } from '../config/supabaseClient';
```

Y en `tsconfig.json`, para que estos casos se detecten solos:

```json
        "noUnusedLocals": true,
        "noUnusedParameters": true,
```

---

## [Impacto: Bajo] [Esfuerzo: Fácil] Cobertura de tests mínima en la lógica más riesgosa

* **Ubicación:** `src/services/*.test.ts`, `src/utils/helpers.test.ts`
* **Categoría:** Mantenibilidad
* **Justificación:** Hay solo dos archivos de test (`ExportService` y `helpers`) sobre 114 archivos. La lógica con más aristas — el cálculo de slots disponibles con zonas horarias, el mapeo de estados de suscripción, el manejo de solapamientos — no tiene ninguna prueba, y son exactamente las áreas donde esta auditoría encontró bugs de zona horaria. Un puñado de tests sobre `AppointmentBusinessLogic` y `dateUtils` pagaría solo el primer bug de TZ que evite.
* **Antes (Código Actual):**

```text
src/services/ExportService.test.ts
src/utils/helpers.test.ts
```

* **Después (Código Optimizado):**

```typescript
// src/utils/dateUtils.test.ts
import { describe, it, expect } from 'vitest';
import { createARDateTime, getDayBounds, parseLocalYMD, formatTimeAR } from './dateUtils';

describe('dateUtils — anclaje a hora argentina', () => {
  it('createARDateTime interpreta la hora como hora de pared AR (UTC-3)', () => {
    const day = new Date('2026-08-05T15:00:00.000Z');
    expect(createARDateTime(day, '09:00:00').toISOString()).toBe('2026-08-05T12:00:00.000Z');
  });

  it('getDayBounds cubre el día completo en AR, no en UTC', () => {
    const { start, end } = getDayBounds(new Date('2026-08-05T15:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-05T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-06T02:59:59.999Z');
  });

  it('parseLocalYMD no corre la fecha un día', () => {
    expect(parseLocalYMD('2026-08-05')!.toISOString()).toBe('2026-08-05T03:00:00.000Z');
  });

  it('formatTimeAR devuelve la hora de pared del consultorio', () => {
    expect(formatTimeAR(new Date('2026-08-05T12:00:00.000Z'))).toBe('09:00');
  });
});
```

---

## [Impacto: Bajo] [Esfuerzo: Fácil] `deploy.json` conserva una copia obsoleta del código de `chat-webhook`

* **Ubicación:** `deploy.json` (raíz, 35 KB)
* **Categoría:** Mantenibilidad
* **Justificación:** El archivo contiene el código fuente completo de una versión vieja de `chat-webhook`, que difiere de la actual en cosas sustanciales: consulta una tabla `tenants` que ya no existe, usa `organization_id` en vez de `user_id`, inserta turnos con INSERT directo sin overlap-check y no tiene rate limiting. Está en `.gitignore` (no se versiona) y no participa del deploy — pero cualquiera que lo abra buscando "el código desplegado" va a leer una versión que hace tres años de arquitectura atrás. También expone el `project_id` en claro.
* **Antes (Código Actual):**

```json
{"project_id":"dzpvvfhrcadmhppnyqcp","name":"chat-webhook","entrypoint_path":"file:///supabase/functions/chat-webhook/index.ts","verify_jwt":false,"files":[{"name":"supabase/functions/chat-webhook/index.ts","content":"...código de una versión que usa la tabla `tenants` y `organization_id`..."}]}
```

* **Después (Código Optimizado):**

```text
Eliminar deploy.json del working tree. El deploy de Edge Functions se hace con:

  supabase functions deploy chat-webhook --no-verify-jwt
  supabase functions deploy public-booking --no-verify-jwt
  supabase functions deploy mp-webhook --no-verify-jwt
  supabase functions deploy admin-api create-checkout calendar-sync notify-appointment whatsapp-manager google-token-refresh cleanup-orphaned-files

Documentar esos comandos en README.md, que es donde alguien los va a buscar.
```
