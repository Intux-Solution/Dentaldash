# Dental Dash - Dental Dashboard

Aplicación React para gestionar pacientes y turnos de un consultorio odontológico. El backend, la base de datos, el almacenamiento y la autenticación se resuelven utilizando **Supabase**.

—

## Requisitos

- Node.js 18.x (ver `.nvmrc`)
- npm (o yarn)
- Proyecto Supabase configurado y en ejecución.

Instalar dependencias:
```bash
npm install
```

—

## Puesta en marcha

1) Variables de entorno (`.env` local):
```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

2) Modo desarrollo:
```bash
npm run dev
```

3) Build producción:
```bash
npm run build
```

—

## Estructura (resumen)

```
src/
├─ App.tsx                    # Boot, auth, Router
├─ components/                # Vistas y componentes UI
├─ hooks/                     # Custom hooks para lógica de negocio y React Query
├─ services/                  # Clientes API (Supabase, Storage, Edge Functions)
├─ config/                    # Configuración de clientes (Supabase config)
├─ types/                     # Interfaces TypeScript (database.types.ts)
├─ utils/                     # Utilidades
└─ router/                    # Rutas principales
```

—

## Arquitectura y Seguridad

- **Autenticación**: Supabase Auth (Email/Password, Google OAuth).
- **Base de Datos**: PostgreSQL vía Supabase. RLS (Row Level Security) habilitado en todas las tablas para garantizar que cada tenant o usuario solo acceda a su información.
- **Almacenamiento**: Supabase Storage para historias clínicas (límite recomendado: 5MB, tipos validados).
- **Edge Functions**: Desplegadas en Supabase Deno para tareas automatizadas (Webhooks, WhatsApp, sincronización, etc).

—

## Scripts útiles

- Desarrollo: `npm run dev`
- Verificación de tipos: `npm run typecheck` (`tsc --noEmit`)
- Build de producción: `npm run build`
- Preview de build: `npm run preview`

