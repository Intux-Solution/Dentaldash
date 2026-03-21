# DentalDash - Sistema de Gestión Odontológica

## 1. ¿Qué es el sistema?
DentalDash es una aplicación web moderna (basada en React) diseñada específicamente para gestionar consultorios odontológicos. Funciona como un panel de control (Dashboard) integral que centraliza la administración de pacientes, la agenda de turnos, historiales clínicos y representaciones gráficas dentales (odontogramas). 

Además de la gestión manual, el sistema destaca por contar con un asistente automatizado impulsado por Inteligencia Artificial (OpenAI/Gemini) integrado a WhatsApp, el cual puede interactuar con los pacientes, consultar disponibilidad y agendar turnos de forma autónoma.

---

## 2. Funcionalidades Principales

* **Gestión de Pacientes:** * Registro detallado con datos personales, contacto, DNI, obra social y número de afiliado.
  * Registro de antecedentes médicos y alergias.
  * Almacenamiento seguro de historias clínicas en formato PDF/archivos (mediante Supabase Storage).

* **Agenda y Turnos:**
  * Creación, edición y cancelación de turnos, asignando la duración y el tipo de cita.
  * Sincronización y consulta de disponibilidad cruzada con Google Calendar.
  * Definición de horarios laborales de la clínica (Días de la semana y rangos horarios).

* **Odontograma y Tratamientos:**
  * Mapeo del estado dental del paciente a través de un odontograma interactivo almacenado en formato JSON.
  * Historial de tratamientos aplicados a piezas dentales específicas (procedimientos y descripciones).

* **Asistente Virtual por WhatsApp (Chatbot IA):**
  * Conexión a WhatsApp mediante Evolution API.
  * Respuestas automáticas generadas por IA (OpenAI GPT-4o-mini o Gemini como respaldo) basándose en las FAQs de la clínica y servicios.
  * Capacidad de invocar funciones en tiempo real (Function Calling) para buscar turnos libres (`get_available_slots`) y agendar consultas directamente desde el chat (`create_appointment`).

---

## 3. Stack Tecnológico

El proyecto está construido con un stack moderno enfocado en la velocidad, seguridad y escalabilidad:

**Frontend:**
* **Framework:** React 18 con TypeScript.
* **Build Tool:** Vite.
* **Manejo de Estado y Datos:** Zustand (estado global) y TanStack React Query (estado del servidor y caché).
* **Enrutamiento:** React Router DOM.
* **Formularios:** React Hook Form integrado con Zod para la validación de esquemas.
* **Estilos e UI:** Tailwind CSS, Ant Design (`antd`) y Lucide React para iconografía.

**Backend y Base de Datos (BaaS):**
* **Proveedor:** Supabase.
* **Base de Datos:** PostgreSQL relacional.
* **Autenticación:** Supabase Auth (Email/Contraseña y Google OAuth).
* **Almacenamiento:** Supabase Storage (para historiales médicos).
* **Edge Functions:** Escritas en TypeScript y ejecutadas en el entorno Deno de Supabase.

**Integraciones de Terceros:**
* **Evolution API:** Para gestionar la conexión y mensajería de WhatsApp.
* **OpenAI (GPT-4) / Google Gemini:** Para el motor conversacional y toma de decisiones del asistente virtual.
* **Google APIs:** Integración con Google Calendar para sincronización de turnos.

---

## 4. Información Adicional y Arquitectura

* **Arquitectura Multitenant (Multiusuario):** El sistema está pensado para que distintos odontólogos o clínicas (tenants) puedan utilizar la plataforma de manera segura. Se aplica **Row Level Security (RLS)** estricto en la base de datos de PostgreSQL, lo que garantiza que cada usuario solo pueda consultar o modificar a sus propios pacientes, agendas y perfiles.
* **Procesamiento de Webhooks Asíncronos:** Las Edge Functions encargadas de recibir mensajes de WhatsApp (`chat-webhook`) están construidas para capturar mensajes concurrentes, unirlos y procesarlos en lotes ("batching/debounce") de manera asíncrona, evitando respuestas duplicadas y mejorando el contexto que se envía a la Inteligencia Artificial.
* **Mantenimiento Automatizado:** El sistema cuenta con Edge functions especializadas, como `cleanup-orphaned-files`, diseñadas para correr de forma programada y limpiar archivos PDF/historiales en el bucket de Storage que ya no estén vinculados a ningún paciente, optimizando los costos de almacenamiento.
* **Control de Calidad:** El proyecto incorpora `vitest` para la ejecución de pruebas y `tsc --noEmit` para garantizar la seguridad en el tipado durante el desarrollo continuo.