# Auditoría de Software: Dentaldash SaaS

## A) Resumen Ejecutivo

**Estado General:**
El proyecto tiene una base funcional robusta para un MVP utilizando React, Tailwind y Supabase. Sin embargo, en el estado actual **NO está listo para operar a nivel SaaS comercial de forma segura**. Se han encontrado múltiples vulnerabilidades Críticas (P0) referentes a la falta de aislamiento real entre inquilinos (Multi-tenant BOLA/Insecure Direct Object References), exposición de APIs serverless sin autenticación, y exposición de datos de salud protegidos (PHI) por políticas RLS deficientes o inexistentes. Resolver estos riesgos bloqueantes tomará alrededor de 1-2 semanas de esfuerzo, tras lo cual la plataforma estará lista y segura para escalar.

**Riesgos que bloquean la venta o salida a producción (Showstoppers):**
1. **Fuga de datos inter-tenant en Storage y Base de Datos:** Las políticas (RLS) de Supabase en tablas clave (`odontograms`, `schedules`) y el bucket `clinical-records` permiten a cualquier usuario autenticado leer, modificar y borrar datos/archivos de otros doctores.
2. **API de WhatsApp Manager expuesta:** La Edge Function `whatsapp-manager` no requiere autenticación. Un ataque puede desvincular o secuestrar sesiones de WhatsApp de cualquier tenant pasando el `tenant_id`.
3. **Fuga de historial de chat:** La tabla `chat_history` no tiene RLS habilitado. Cualquier usuario puede consultar el historial de mensajes de WhatsApp de todos los pacientes.

**Top 10 Riesgos Identificados:**
| Riesgo | Severidad | Área |
|---|---|---|
| 1. Acceso total a archivos médicos (`clinical-records`) de otros tenants | Crítico | Supabase Storage |
| 2. RLS Inexistente en `chat_history` y `debug_payloads` (fuga de PHI) | Crítico | Supabase DB |
| 3. RLS Roto en `odontograms` y `schedules` (BOLA) | Crítico | Supabase DB |
| 4. Función `whatsapp-manager` sin validación de Authorization | Alto | Edge Functions |
| 5. Logs con datos sensibles (PII/PHI) en texto plano (Payloads de WA) | Alto | Edge / Observabilidad |
| 6. Generación insegura de nombres de archivos en Storage | Medio | Frontend / Seguridad |
| 7. Fugas de almacenamiento (archivos huérfanos al actualizar historias clínicas) | Medio | Backend / Performance |
| 8. Posibles inyecciones de Prompt (AI Jailbreak) en `chat-webhook` | Medio | Funciones AI |
| 9. Arquitectura multi-tenant ligada estrictamente a `auth.uid()` (limita escalado de clínicas con varios usuarios) | Bajo/Medio | Arquitectura |
| 10. `setTimeout` usado como mecanismo de idempotencia en Edge Functions | Bajo | Fiabilidad |

**Quick Wins (Arreglos < 1 día):**
- Aplicar políticas RLS estrictas (`organization_id = auth.uid()`) en TODAS las tablas públicas y en Storage.
- Validar el JWT (`Authorization` header) en la Edge Function `whatsapp-manager`.
- Cambiar `Math.random()` por `crypto.randomUUID()` al subir archivos.

## B) Mapa de Arquitectura Actual

```text
[ Cliente React (SPA - CRA) ] 
       |       |
       |       +--(Auth / Sesiones / JWT)----> [ Supabase Auth ]
       |
       +--(Consultas RLS directas)-----------> [ Supabase PostgreSQL ]
       |
       +--(Carga directa firmada)------------> [ Supabase Storage ]
       |
       +--(Llamadas REST)--------------------> [ Supabase Edge Functions ]
                                                        |
                                                        +--> [whatsapp-manager] ---> [Evolution API] ---> [WhatsApp]
                                                        |
                                                        +--> [chat-webhook] <------- [Evolution API]
                                                                |
                                                                +---> [OpenAI / Gemini]
```

**Puntos de Confianza (Trust Boundaries):**
- **De Cliente a Supabase:** Se confía en el JWT proporcionado por Supabase Auth, validado a nivel de Postgres vía RLS. *Fallo actual:* Las políticas confían en el rol `authenticated` sin validar a qué tenant pertenece el recurso.
- **De Edge Functions a APIs de Terceros:** Las Edge Functions tienen acceso total a la BDD (usan `SERVICE_ROLE_KEY`), saltando el RLS. Confían ciegamente en los payloads enviados desde APIs externas o desde el cliente.

**Superficies de Ataque Principales:**
- **Supabase Data API (Port 443):** Consultas directas anónimas o autenticadas a tablas sin RLS correcto.
- **Edge Functions URLs:** Rutas públicas que reciben peticiones POST (ej. webhooks) susceptibles a enumeración y ataques de replay si no validan firmas o tokens de autorización.
- **Storage API:** Acceso a historias clínicas y documentos vulnerables a Insecure Direct Object Reference (IDOR).

## C) Auditoría de Seguridad (AppSec + Supabase)

### 1. Row Level Security (RLS) Perforado o Inexistente
- **Qué pasa:** Las tablas `odontograms` y `schedules` tienen la política: [(auth.role() = 'authenticated'::text)](file:///c:/Users/esteb/Desktop/Dentaldash/src/App.js#12-64). Esto significa que si el Doctor A inicia sesión, puede consultar o borrar el odontograma del paciente del Doctor B. Adicionalmente, `chat_history` y `debug_payloads` NO tienen RLS activado.
- **Riesgo:** Crítico (P0). Fuga masiva de datos y manipulación por parte de cualquier usuario registrado.
- **Cómo reproducir:** Iniciando sesión con cualquier usuario y ejecutando: `supabase.from('odontograms').select('*')` o listando `chat_history`.
- **Cómo arreglar:** 
  ```sql
  -- Para odontograms (asumiendo que tiene patient_id que enlaza a patients):
  DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON odontograms;
  CREATE POLICY "Aislamiento tenant en odontograms" ON odontograms
  FOR ALL USING (
    patient_id IN (SELECT id FROM patients WHERE organization_id = auth.uid())
  );
  
  -- Para chat_history:
  ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Aislamiento tenant en chat_history" ON chat_history
  FOR ALL USING (
    tenant_id IN (SELECT id FROM tenants WHERE user_id = auth.uid())
  );
  ```

### 2. Archivos Médicos Expuestos en Storage (IDOR / BOLA)
- **Qué pasa:** El bucket `clinical-records` tiene políticas de escritura, actualización, borrado y lectura para CUALQUIER rol `authenticated`. No hay restricción por `owner` o `tenant_id`.
- **Riesgo:** Crítico (P0). Acceso no autorizado a registros médicos privados.
- **Cómo reproducir:** Con sesión activa, llamar a `supabase.storage.from('clinical-records').list()`.
- **Cómo arreglar:** Cambiar las políticas de Storage para que el Path incluya el `auth.uid()` del tenant (ejemplo: `/clinical-records/{tenant_id}/archivo.pdf`) y restringir la política RLS del storage a [(storage.foldername(name))[1] = auth.uid()::text](file:///c:/Users/esteb/Desktop/Dentaldash/src/App.js#12-64).

### 3. Falta de Autenticación en Edge Function `whatsapp-manager`
- **Qué pasa:** El endpoint recibe `{action, tenant_id}` y ejecuta comandos privilegiados (crear, borrar, desvincular instancias en Evolution API) usando el `SERVICE_ROLE_KEY` sin validar SI EL QUE HACE LA REQUEST ES EL DUEÑO de dicho `tenant_id`.
- **Riesgo:** Crítico (P0). Un atacante podría desvincular el WhatsApp de toda la base de clientes.
- **Cómo arreglar:** 
  Obtener la sesión a partir del header `Authorization` que envía el cliente web, usando `supabase.auth.getUser(token)` ANTES de proceder, y verificar que el `user.id` coincida con el `tenant.user_id`.

### 4. Logging de Datos Sensibles en Texto Plano (`chat-webhook`)
- **Qué pasa:** El webhook guarda en la tabla `debug_payloads` el `payload` completo entrante desde WhatsApp, que incluye nombres, teléfonos (JID) e información médica enviada en el chat texto.
- **Riesgo:** Alto (P1). Incumplimiento de normativas de protección de datos (HIPAA/GDPR) al almacenar PII/PHI sin encriptación ni control de retención o acceso en logs de depuración.
- **Cómo arreglar:** Eliminar la inserción en `debug_payloads` en producción o implementar un enmascaramiento estricto de los campos sensibles del objeto antes de insertarlo.

### 5. Generadores Criptográficos Inseguros
- **Qué pasa:** El frontend usa `Math.random().toString(36)` para generar nombres de archivo en [PatientService.js](file:///c:/Users/esteb/Desktop/Dentaldash/src/services/PatientService.js). 
- **Riesgo:** Medio (P2). Posibilidad de colisiones o ataques de adivinación de URL si los buckets fuesen públicos.
- **Cómo arreglar:** Usar `crypto.randomUUID()` nativo del navegador.

## D) Auditoría de Fiabilidad y Calidad

- **Gestión de Errores (Edge):** La lógica de debounce de mensajes de WhatsApp (`setTimeout(5000)`) en `chat-webhook` no es confiable en un entorno Serverless/Edge (el contenedor puede ser pausado o destruido). **Recomendación:** Usar colas o Inngest/Trigger.dev, o gestionar estado mediante base de datos con timestamps sin bloquear la ejecución.
- **Manejo de Transacciones:** En [PatientService.js](file:///c:/Users/esteb/Desktop/Dentaldash/src/services/PatientService.js), la creación de un paciente con historia clínica requiere 2 pasos (subir a storage, luego insertar DB). Si el insert falla, el archivo queda "huérfano" en Storage. **Recomendación:** Implementar Rollbacks (borrar archivo si insert falla) o un cron job que limpie archivos huérfanos.
- **Validación de Formularios:** La validación en frontend es básica y confía en los errores de Supabase. El backend (RLS y constraints) es la única barrera de seguridad de los datos.

## E) Auditoría de Performance y Escalabilidad (SaaS Multi-usuario)

- **Estrategia Multi-Tenant:** Implementada mediante columnas lógicas (`organization_id`, `tenant_id`). Trade-off: Menos esfuerzo operativo, pero altísimo riesgo de fuga de datos si el RLS falla (como sucede ahora). Además, usar `auth.uid() = organization_id` restringe fuertemente el modelo si una clínica quiere tener MÚLTIPLES sub-usuarios (ej. secretaria y varios doctores). **Recomendación:** Migrar a Roles de Organización (RBAC) donde un usuario pertenezca a una organización antes de escalar comercialmente.
- **N+1 Queries y Hot Paths:** En el webhook de WA, la generación de turnos itera sobre memoria. Es rápido con baja carga, pero escalaría mal. Adicionalmente, consultar [fetchAllPatients()](file:///c:/Users/esteb/Desktop/Dentaldash/src/services/PatientService.js#10-38) sin paginación en el frontend será un cuello de botella con clínicas grandes. **Recomendación:** Implementar paginación (limit/offset) y búsquedas directas en BDD.

## F) Auditoría de Mantenibilidad y DX

- **Estructura del Proyecto:** El frontend está utilizando `Create React App (react-scripts)`, lo cual está **deprecado** oficialmente por React. **Recomendación Urgente:** Migrar el empaquetador a Vite (`vite.config.js`), ya que CRA afectará el mantenimiento futuro.
- **Tipado Fuerte:** Todo el Frontend usa JavaScript puro ([.js](file:///c:/Users/esteb/Desktop/Dentaldash/src/App.js), [.jsx](file:///c:/Users/esteb/Desktop/Dentaldash/src/components/Chip.jsx)). Esto propicia bugs en tiempo de ejecución. **Recomendación:** Migrar gradualmente a TypeScript (`.tsx`). Las Edge Functions ya utilizan TypeScript (Deno), lo cual es ideal.
- **Componentes React:** Archivos monolíticos muy extensos (ej. [SettingsView.jsx](file:///c:/Users/esteb/Desktop/Dentaldash/src/components/SettingsView.jsx) con más de 800 líneas) mezclan lógica de negocios, datos y UI. **Recomendación:** Extraer hooks personalizados (ej. `useSettings`, `useWhatsAppConnection`).

## G) Auditoría de Testing y Release

- **Estado Actual:** No existen pruebas unitarias o e2e implementadas (más allá de los esqueletos por defecto de CRA).
- **Plan de Pruebas Necesario:**
  - **Crítico (Unit/Integration):** Testear políticas RLS asumiendo distintos roles usando `pgTAP` o tests de integración desde Deno.
  - **E2E (Playwright/Cypress):** Test de flujos críticos (Login, Agendar Turno, Guardar Odontograma cruzado verificando que NO se pueda ver lo del Doctor B).
  - **Edge Functions:** Mocks de la `Evolution API` y `OpenAI` para probar el bot sin costo recurrente usando `Deno.test`.
- **Release/CI:** Implementar GitHub Actions con validación de linting y despliegue usando la CLI de Supabase.

## H) Observabilidad y Operación

- **Edge Logging:** Supabase provee logs, pero actualmente la app inserta payloads crudos a la tabla `debug_payloads`. Esto es un anti-patrón no seguro. Implementar **Sentry** para errores del frontend/edge y usar logs estructurados sanitizados (removiendo DNI, mensajes clínicos y números de teléfono) cuando se guarde debug.

## I) Plan de Remediación (Backlog Priorizado)

| Tarea | Severidad | Esfuerzo | Impacto | Descripción |
|---|---|---|---|---|
| **P0-1** | Crítico | Small | Bloqueante | **Asegurar RLS en Base de Datos**: Añadir `patient_id IN (SELECT id from patients where organization_id = auth.uid())` en `odontograms` y `schedules`. Habilitar RLS en `chat_history`. |
| **P0-2** | Crítico | Small | Bloqueante | **Asegurar RLS en Storage**: Limitar acceso en Bucket `clinical-records` para que sólo pueda acceder el tenant propietario del archivo usando paths con el `auth.uid()`. |
| **P0-3** | Crítico | Small | Bloqueante | **Proteger Edge Functions**: Exigir pasar Token JWT (Authorization) en `whatsapp-manager` y verificar que pertenezca al `tenant_id` objetivo. |
| **P1-1** | Alto | Medium | Operación Sec. | **Sanear Payload Logging**: Evitar insertar en `debug_payloads` el texto crudo de los chats (PHI) o al menos truncarlos u ofuscarlos. Deshabilitar en Prod. |
| **P2-1** | Medio | Medium | Mant./Perf. | **Migrar de CRA a Vite**: Permite compilar más rápido y asegura soporte futuro de la herramienta de build. |
| **P2-2** | Medio | Medium | Fiabilidad | **Refactorizar Edge AI Debouncer**: Quitar `setTimeout` y manejar la cola de mensajes de WhatsApp en una lógica basada en CRON o herramienta externa de colas. |
| **P2-3** | Medio | Medium | UX/Perf. | **Paginación en Pacientes**: Implementar range() en las queries RLS grandes del [PatientService.js](file:///c:/Users/esteb/Desktop/Dentaldash/src/services/PatientService.js). |
| **P3-1** | Bajo | Large | Escalamiento | **Refactorizar a TS / Separar Lógica**: Partir archivos de >500 líneas (SettingsView) y agregar TS al frontend. |
| **P3-2** | Bajo | Medium | Calidad | **Setup Playwright & CI**: Agregar pruebas e2e automatizadas previas al despliegue. |

---
**Definition of Done (DoD) de la Auditoría:**
✅ Entender arquitectura actual  
✅ Identificar y documentar vulnerabilidades de Supabase/AppSec  
✅ Identificar bugs arquitectónicos (SaaS BOLA)  
✅ Generar ticket backlog accionable para remediación  

*Fin del Reporte*
