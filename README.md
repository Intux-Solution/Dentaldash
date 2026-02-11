# Odonto React - Dental Dashboard

Aplicación React para gestionar pacientes y turnos de un consultorio odontológico. El backend se resuelve con flujos de n8n (webhooks), usando Airtable para almacenamiento de pacientes y Google Calendar para agenda. La app incluye login y módulo de turnos con disponibilidad, creación, edición y cancelación.

—

## Requisitos

- Node.js 18.x (ver `.nvmrc`)
- npm (o yarn)
- Servidor n8n accesible con los siguientes flujos/webhooks:
  - Pacientes: get/create/update/delete
  - Turnos: availability/create/update/delete y lectura de eventos del calendario
  - Auth: auth-login, forgot-password, change-password
- Conexiones del n8n: Airtable (pacientes) y Google Calendar (turnos)

Instalar dependencias:
```bash
npm install
```

—

## Puesta en marcha

1) Variables de entorno (`.env` en la raíz):
```
REACT_APP_N8N_BASE=https://tu-n8n.dominio.com
```

2) Modo desarrollo:
```bash
npm start
```

3) Build producción:
```bash
npm run build
```

—

## Estructura (resumen)

```
src/
├─ App.js                     # Boot, auth, Router
├─ components/
│  ├─ AuthedApp.jsx           # Layout autenticado + ModalsRoot
│  ├─ DashboardView.jsx       # KPIs + próximos turnos + atajos
│  ├─ TurnosView.jsx          # Listado por fechas + filtros
│  ├─ PacientesView.jsx       # Buscador + tabla pacientes
│  ├─ BookingModal.jsx        # Modal con BookingForm
│  ├─ BookingForm.jsx         # Crear turno (check patient + availability)
│  ├─ EditTurnoModal.jsx      # Editar/Cancelar turno
│  ├─ TurnoDetailsModal.jsx   # Detalle de turno
│  ├─ AddPatientModal.jsx     # Alta paciente (archivo opcional)
│  ├─ EditPatientModal.jsx    # Edición paciente (archivo opcional)
│  ├─ PatientProfileModal.jsx # Perfil + eliminar + abrir editar
│  ├─ MessagePatientModal.jsx # IU de mensaje (no conectado aún)
│  ├─ ... (Sidebar, Header, tablas, inputs, etc.)
├─ hooks/
│  ├─ useTurnos.js            # Carga eventos desde n8n
│  ├─ usePatients.js          # CRUD pacientes contra n8n
│  ├─ useModals.js            # Estado central de modales/acciones
│  └─ useNormalizedPatients.js
├─ services/
│  └─ PatientService.js       # GET/POST pacientes (JSON o FormData)
├─ config/
│  ├─ n8n.js                  # BaseURL y endpoints centralizados
│  └─ appointments.js         # Tipos de turno + días laborales
├─ utils/
│  ├─ appointments.js         # Utilidades de fechas/normalización
│  ├─ auth.js                 # JWT, headers y fetch seguro
│  └─ helpers.js              # Misceláneos
└─ router/
   └─ AppRoutes.jsx           # Rutas principales
```

Rutas y endpoints están centralizados en: `src/config/n8n.js:1`.

—

## Configuración n8n (endpoints)

Archivo: `src/config/n8n.js:1`

```js
export const N8N_BASE = process.env.REACT_APP_N8N_BASE || 'https://n8n-automation.chilldigital.tech';

// Pacientes
export const URL_GET_PATIENTS     = `${N8N_BASE}/webhook/get-patients`;
export const URL_CREATE_PATIENT   = `${N8N_BASE}/webhook/create-patient`;
export const URL_UPDATE_PATIENT   = `${N8N_BASE}/webhook/update-patient`;
export const URL_DELETE_PATIENT   = `${N8N_BASE}/webhook/delete-patient`;

// Calendario / Turnos (lectura)
export const URL_CALENDAR_EVENTS  = `${N8N_BASE}/webhook/turnos-hoy`;

// Booking (disponibilidad y CRUD turnos)
export const URL_CHECK_PATIENT       = `${N8N_BASE}/webhook/check-patient`;
export const URL_GET_AVAILABILITY    = `${N8N_BASE}/webhook/get-availability`;
export const URL_CREATE_APPOINTMENT  = `${N8N_BASE}/webhook/create-appointment`;
export const URL_UPDATE_APPOINTMENT  = `${N8N_BASE}/webhook/update-appointment`;
export const URL_DELETE_APPOINTMENT  = `${N8N_BASE}/webhook/delete-appointment`;

// Mensajería (UI disponible, integración pendiente)
export const URL_SEND_MESSAGE     = `${N8N_BASE}/webhook/send-message`;
```

—

## Contratos de API (webhooks n8n)

Los siguientes contratos reflejan lo que envía el frontend y lo que se espera recibir desde n8n. Donde hay variantes de nombres de campos, la app ya normaliza las respuestas para tolerarlas.

### Autenticación

- POST `/webhook/auth-login`
  - Request (JSON):
    ```json
    {
      "username": "admin",
      "password": "********",
      "timestamp": "2025-09-03T00:00:00.000Z"
    }
    ```
  - Respuesta esperada:
    ```json
    {
      "success": true,
      "token": "<jwt>",
      "user": { "username": "admin", "name": "Nombre" },
      "code": null
    }
    ```
    - En error, `code` puede ser `INVALID_CREDENTIALS`, `RATE_LIMITED`, `ACCOUNT_LOCKED` y `message` con detalle.

- POST `/webhook/forgot-password`
  - Request (JSON): `{ "email": "user@dominio.com", "timestamp": "..." }`
  - Respuesta: `{ "success": true, "message": "..." }`

- POST `/webhook/change-password`
  - Headers: `Authorization: Bearer <jwt>` (recomendado)
  - Request (JSON):
    ```json
    {
      "username": "admin",
      "currentPassword": "***",
      "newPassword": "***",
      "timestamp": "..."
    }
    ```
  - Respuesta: `{ "success": true, "message": "Password actualizado" }`

### Pacientes

- GET `/webhook/get-patients`
  - Respuesta esperada:
    ```json
    { "patients": [ {"id": "recXXX", "nombre": "...", "telefono": "...", "createdTime": "..."} ] }
    ```

- POST `/webhook/create-patient`
  - Dos modos según si hay archivo de historia clínica:
    - JSON (sin archivo):
      ```json
      {
        "nombre": "Juan Pérez",
        "dni": "12345678",
        "telefono": "+54 11 5555 5555",
        "email": "juan@ejemplo.com",
        "obraSocial": "OSDE",
        "numeroAfiliado": "ABC123",
        "fechaNacimiento": "1990-01-01",
        "alergias": "Ninguna",
        "notas": "..."
      }
      ```
    - FormData (con archivo):
      - Campos: `nombre`, `dni`, `telefono`, `email`, `obraSocial`, `numeroafiliado` (minúsculas para compatibilidad), `fechanacimiento`, `alergias`, `notas`, y `clinicalRecord` (archivo)
  - Respuesta sugerida (flexible; la app normaliza):
    ```json
    {
      "id": "recXXX",
      "airtableId": "recXXX",
      "nombre": "Juan Pérez",
      "telefono": "+54...",
      "createdTime": "2025-09-03T00:00:00Z",
      "historiaClinica": "https://.../archivo.pdf"
    }
    ```

- POST `/webhook/update-patient`
  - JSON (sin archivo) o FormData (con archivo)
  - Campos mínimos: `airtableId` y los campos a actualizar
  - En FormData, el archivo se envía bajo la clave `historiaClinica`
  - Respuesta: objeto paciente actualizado (la app mergea `{...prev, ...result, ...(result.data||{})}`)

- POST `/webhook/delete-patient`
  - Request (JSON): `{ "id": "recXXX", "airtableId": "recXXX", "nombre": "Juan", "timestamp": "..." }`
  - Respuesta: `{ "success": true }`

### Mensajería (WhatsApp / Email)

- POST `/webhook/send-message`
  - Request (JSON sugerido):
    ```json
    {
      "channel": "whatsapp", // o "email"
      "message": "Hola, te recordamos tu turno...",
      "toPhone": "+54 11 5555 5555",
      "toEmail": "paciente@dominio.com",
      "recipientName": "Juan Pérez",
      "airtableId": "recXXX" // opcional
    }
    ```
  - Respuesta: `{ "success": true, "providerMessageId": "..." }`
  - Nota: La UI `MessagePatientModal.jsx` existe pero aún no invoca el webhook desde el árbol actual.

### Turnos (Booking + Calendario)

- GET `/webhook/check-patient?dni=12345678`
  - Respuesta: `{ "found": true, "patient": { "nombre": "...", "telefono": "...", "obraSocial": "..." } }`

- GET `/webhook/get-availability?fecha=YYYY-MM-DD&duration=30[&excludeId=<id>]`
  - Respuesta: `{ "availableSlots": ["09:00", "09:30", "10:00"] }`

- POST `/webhook/create-appointment`
  - Request (JSON):
    ```json
    {
      "dni": "12345678",
      "nombre": "Juan Pérez",
      "telefono": "+54...",
      "obraSocial": "OSDE",
      "numeroAfiliado": "ABC123",
      "alergias": "Ninguna",
      "antecedentes": "Ninguno",
      "tipoTurno": "consulta",
      "tipoTurnoNombre": "Consulta",
      "duracion": 30,
      "fechaHora": "2025-09-03T15:00:00.000Z",
      "timezone": "America/Argentina/Buenos_Aires",
      "isNewPatient": false
    }
    ```
  - Respuesta: `{ "success": true, "appointment": { "id": "evt_123", ... } }`

- POST `/webhook/update-appointment`
  - Request (JSON): igual a create-appointment, con `id` del turno a actualizar
  - Respuesta: `{ "success": true, "appointment": { ...actualizado } }`

- POST `/webhook/delete-appointment`
  - Request (JSON): `{ "id": "evt_123", "reason": "Cancelado...", "canceledAt": "..." }`
  - Respuesta: `{ "success": true }`

- GET `/webhook/turnos-hoy?from=<ISO>&to=<ISO>&timeZone=America/Argentina/Buenos_Aires`
  - Usado por `useTurnos.js`
  - Respuesta esperada (propiedades tolerantes):
    ```json
    {
      "events": [
        {
          "id": "evt_123",
          "title": "Consulta",          // o "summary"
          "description": "...",
          "start": "2025-09-03T15:00:00.000Z", // o "startTime"
          "end": "2025-09-03T15:30:00.000Z",
          "location": "Consultorio",
          "patientName": "Juan Pérez",   // o "paciente"
          "patientPhone": "+54...",
          "patientDni": "12345678",
          "htmlLink": "https://calendar.google.com/..."
        }
      ]
    }
    ```

—

## Seguridad recomendada

- Proteger todos los webhooks con token (por ejemplo `x-api-key`) o `Authorization: Bearer <jwt>` cuando aplique.
- Configurar CORS en n8n para permitir solo el dominio de la app.
- Limitar tamaño de archivos en upload de historia clínica y validar tipos (`.pdf`, `image/*`).
- Registrar y tratar códigos de error coherentes (`code`, `message`).

—

## Scripts útiles

- Desarrollo: `npm start`
- Tests (CRA): `npm test`
- Build producción: `npm run build`

—

## Notas y troubleshooting

- La app normaliza claves en respuestas (por ejemplo `title|summary`, `start|startTime`, `nombre|name`) para tolerar variaciones del workflow.
- Si `get-patients` no devuelve `{ patients: [...] }`, la tabla aparecerá vacía.
- `MessagePatientModal` está listo a nivel UI, pero no se conecta a `send-message` en el árbol actual; si querés, puedo cablearlo.
- El endpoint de lectura de calendario actual es `/webhook/turnos-hoy` con parámetros `from`, `to` y `timeZone`.
- Cancelar turno: la UI envía POST a `/webhook/delete-appointment` con `{ id, reason, canceledAt }`. Asegurate de tener ese webhook creado en n8n. Si el feed de calendario no trae `id`, ahora se toleran `eventId` o `_id` como fallback.
- Si ves `Webhook "/webhook/delete-appointment" no encontrado (404)`, falta publicar ese flujo en n8n o la URL base `REACT_APP_N8N_BASE` no es correcta.

—

## Checklist

- [ ] `.env` con `REACT_APP_N8N_BASE`
- [ ] Flujos n8n activos: auth, pacientes, turnos, calendario, mensajería
- [ ] CORS y seguridad configurados
- [ ] Respuestas de n8n con estructuras esperadas
