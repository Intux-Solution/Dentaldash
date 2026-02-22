# 📋 Checklist Maestro de la Auditoría (Dentaldash)

Este documento desglosa todas las vulnerabilidades, riesgos y mejoras halladas en el reporte `audit_report.md` en tareas paso a paso para que las abordemos sistemáticamente sin sobrecargarnos.

---

## 🛑 Fase 1: Remediaciones Críticas (Bloqueantes - Prioridad 0)
*Estas tareas previenen la fuga de historiales médicos y secuestro de clínicas.*

- [x] **Aislamiento de Odontogramas (DB BOLA):** Aplicar política RLS `organization_id = auth.uid()` en la tabla `odontograms`.
- [x] **Aislamiento de Agenda (DB BOLA):** Aplicar política RLS `organization_id = auth.uid()` en la tabla `schedules`.
- [x] **Habilitar RLS en Chat (Fuga masiva):** Activar RLS en la tabla `chat_history`.
- [x] **Aislamiento en Supabase Storage (IDOR):** Restringir el Bucket `clinical-records` para forzar que la ruta del archivo comience con el `auth.uid()` del dentista logueado.
- [x] **Asegurar Edge Function (`whatsapp-manager`):** Exigir y verificar un Header JWT (`Authorization`) para confirmar que el usuario que ejecuta comandos sobre el Bot sea el dueño verdadero de la Clínica.

*(Nota: Las tareas marcadas con `[x]` fueron completadas en nuestras sesiones anteriores, pero forman parte del núcleo auditado).*

---

## ⚠️ Fase 2: Saneamiento, Rendimiento y Fiabilidad (Prioridad 1 y 2)
*Estas tareas evitan la caída del servidor y protegen métricas y PII.*

- [x] **Sanear Payload Logging (P1):** Modificar el Edge Function `chat-webhook` para que reemplace información clínica personal (PHI) y celular por textos ofuscados antes de guardar en `debug_payloads`.
- [x] **Actualizar Generador Criptográfico (P2):** Cambiar uso de `Math.random()` a `crypto.randomUUID()` puro en el front-end a la hora de dar nombre a historias clínicas adjuntas.
- [x] **Migrar CRA a ViteJS (P2):** Eliminar la dependencia obsoleta `react-scripts`, y acelerar la compilación reconstruyendo el entorno base sobre Vite.
- [x] **Refactor AI Debouncer (P2):** Remover `setTimeout(5000)` del bot de WA. Devolver HTTP 200 directo a Evolution API y procesar IA de forma asíncrona no bloqueante ("background processing").
- [x] **Límite y paginación en Pacientes (P2):** Prevenir que el explorador muera bloqueando el query `.select()` en 300 filas y creando servicio ilike dinámico.

---

## 🛠️ Fase 3: Mantenibilidad y Experiencia del Desarrollador (Prioridad 3)
*Reduce la deuda técnica (Archivos muy largos, propensos a "romperse").*

- [x] **Refactorizar `SettingsView.jsx`:** Extraer la lógica a componentes más chicos y usar un hook `useSettings()`.
- [x] **Tipado Fuerte Incremental (TSX):** Instalar TypeScript y migrar el core services (Ej: `PatientService.ts`) a un entorno estricto sin romper Vite.
- [x] **Rollback manual de Storage:** Detectar errores en BDD en `PatientService` e interceptar para *borrar* archivos subidos y evitar que queden huérfanos.

---

## 🧪 Fase 4: Pruebas Automáticas y CI/CD (Pendientes)
*Tareas para que podamos desplegar sin miedo a romper lo arreglado.*

- [ ] **Escribir Tests Unitarios Críticos:** Pruebas que validen específicamente que el RLS funciona y un doctor no pueda leer info ajena.
- [ ] **Configurar Playwright (E2E):** Diseñar un script (bot en navegador) que asegure que el login y el flujo de Agendar Citas no se ha roto.
- [ ] **GitHub Actions:** Crear pipeline para automatizar que cada Push corra las pruebas E2E.

---

## 🚀 Fase 5: Arquitectura a Largo Plazo (Pendiente)
*Para cuando la empresa escale a algo masivo.*

- [ ] **Implementar Sentry / Datadog:** Monitoreo serio de logs sin depender de tablas en BDD para rastrear errores de React UI y Deno.
- [ ] **Migrar de "UID de Autenticación" a "RBAC de Organización":** Diseñar el modelo de Datos que admita *Múltiples Secretarias* y *Múltiples Doctores* conectándose al **mismo** tenant clínico en simultáneo, superando la relación actual de (Identidad Auth = Todo el Tenant).
