# Auditoría de código — DentalDash

**Rama:** `claude/code-review-mercadopago-docs-8elgrp` · **Commit base:** `010318e` · **Fecha:** 2026-08-20

Checklist accionable. La versión narrada, con contexto y diagramas, está en
[`docs/manual-dentaldash.html`](./manual-dentaldash.html) §09.

> **Estado — 2026-08-20.** Todos los hallazgos de código están corregidos en esta
> rama. Queda pendiente **C3** (baseline del esquema, se ejecuta con el CLI de
> Supabase) y los ítems de negocio (precios reales, `trial_days`). Los pasos de
> deploy, reparación de datos y verificación están en
> [`docs/DEPLOY-LANZAMIENTO.md`](./DEPLOY-LANZAMIENTO.md).
>
> Se encontró además, al verificar contra producción, que **C1 ya había ocurrido
> con datos reales**: una suscripción paga quedó en `status='trial'` vencido con
> el período vigente hasta 2026-09-05, es decir bloqueada. La reparación de esa
> fila está en el runbook.
>
> Corrección a M1: ambos planes de producción otorgan `google_calendar` y
> `patients_unlimited`, así que no gatearlas no producía fuga de ingresos. Lo
> único que diferencia los planes es `whatsapp_bot` y `faqs_config`, y eso es lo
> que ahora se valida server-side.

## Estado mecánico

| Chequeo | Resultado |
|---|---|
| `npm run typecheck` | ✅ limpio |
| `npx vitest run` | ✅ 80 tests / 8 archivos (eran 50/5 antes de esta tanda) |
| `npm run lint` | ✅ 0 errores · ⚠️ 223 warnings (todos `no-explicit-any`) |
| `npm audit` | ⚠️ 12 vulnerabilidades, todas en `devDependencies` |
| Secretos commiteados | ✅ ninguno |

---

## Bloqueantes — antes del primer cliente que paga

### C1 · Un estado no mapeado de MercadoPago tira al usuario a `trial`

`supabase/functions/mp-webhook/index.ts:184-185, 231`

El `switch` de estados cierra con `default: internalStatus = "trial"`.
`create-checkout` crea el preapproval con `status: "pending"` y MercadoPago emite
un `subscription_preapproval` por esa creación, que cae en el `default` y escribe
`status = 'trial'` sobre la fila del usuario.

Para un cliente que ya paga y entra a hacer un upgrade, su `trial_ends_at` quedó
fijado en `now()` cuando activó el plan — o sea, en el pasado.
`SubscriptionContext` calcula `isExpired = isTrial && daysLeft <= 0` → verdadero →
`ProtectedRoute` lo expulsa a `/suscripcion`. Si completa el pago se recupera; si
abandona el checkout **queda encerrado fuera de una cuenta paga**.

**Arreglo:** que un estado desconocido no degrade nunca. Mapear `pending`
explícitamente a "no tocar el status" y que el `default` preserve el estado actual.
`trial` debería asignarlo solo el trigger de alta.

### C2 · La clave de idempotencia se quema antes de aplicar el cambio

`supabase/functions/mp-webhook/index.ts:158-168` vs. `:254-261`

El insert en `processed_mp_events` ocurre antes del `UPDATE` de `subscriptions`.
Si el update falla, el código loguea y **sigue**, devolviendo 200: MercadoPago no
reintenta, y un reenvío manual sale por "already processed". El pago se cobró y la
suscripción nunca se activa, sin forma de reprocesar.

Segundo camino al mismo resultado, y es una carrera real: el `UPDATE` filtra por
`mercadopago_sub_id = preapprovalId`, pero `create-checkout` guarda ese id
*después* de cancelar el preapproval anterior (otro round-trip de hasta 15 s). Si
el webhook llega en esa ventana, el update no encuentra filas — y PostgREST no lo
considera un error: `updateError` es `null` y la función devuelve 200 satisfecha.

**Arreglo:** insertar la clave de idempotencia *después* de confirmar filas
afectadas (o borrarla si el update falla), y devolver 5xx cuando el update afecta
0 filas para que MercadoPago reintente.

### C3 · El esquema de las tablas de negocio no está en el repo

`supabase/migrations/` — 25 archivos

Las migraciones crean 8 tablas (facturación, permisos, soporte). El código usa 18.
Sin migración que las cree: `patients`, `appointments`, `profiles`, `schedules`,
`odontograms`, `treatment_history`, `chat_history`, `tenant_faqs`, `debug_payloads`.
Sus políticas RLS tampoco están versionadas, y `prevent_role_change()` se
referencia en `20260607000004` pero nunca se define.

No se puede levantar staging desde el repo, no hay dev local, no hay recuperación
desde código, y las políticas RLS que protegen las historias clínicas no son
revisables en un diff.

**Arreglo:** `supabase db dump --schema public` contra producción, versionado como
migración base.

### M3 · El rate limit del link público se saltea con un header

`supabase/functions/public-booking/index.ts:359-360`

```ts
const ip = fwd.split(",")[0].trim() || "unknown";
```

Toma el valor más a la izquierda de `x-forwarded-for`, que es justamente la parte
que controla el cliente. Con un `X-Forwarded-For` distinto por request, los límites
de 5/hora y 8/día no aplican nunca.

Agravante: el paciente se crea en la línea 404, **antes** del chequeo de turnos
pendientes de la línea 428. Cada intento deja una fila en `patients` aunque la
reserva se rechace. Combinado con el bypass, alguien puede llenar la lista de
pacientes de un dentista conociendo solo su slug público.

**Arreglo:** tomar la IP del extremo derecho de la cadena (el hop que agrega el
proxy de Supabase) y mover la creación del paciente después de todos los límites.

---

## Importantes — primeras dos semanas

### M1 · Seis de los once feature keys no bloquean nada

`src/components/SettingsView.tsx:19-27`

`canUse()` se invoca para `insurance_management`, `services_config`, `faqs_config`,
`whatsapp_bot` y `export_data`. Nada más.

| Feature key | ¿Se aplica? |
|---|---|
| `insurance_management`, `services_config`, `faqs_config` | ✅ tab bloqueado |
| `whatsapp_bot`, `export_data` | ⚠️ solo UI |
| `google_calendar` | ❌ `TAB_FEATURE_MAP.googlecalendar = null` — tab siempre abierto |
| `patients_unlimited` | ❌ el límite de "hasta 20 pacientes" no existe en ningún lado |
| `appointments`, `odontogram`, `clinical_records`, `consent_forms` | ❌ nunca consultados |

**Arreglo:** decidir qué claves son reales. Las que lo sean, aplicarlas; las que no,
sacarlas de `featureKeys.ts` y de los planes.

### M2 · El feature gating existe solo en React

`supabase/functions/whatsapp-manager/index.ts:62-70`

Ninguna Edge Function consulta `feature_permissions`. `whatsapp-manager` valida JWT
y `tenant_id === user.id`, pero no el plan: un usuario del plan barato que llame la
función directamente crea su instancia y usa el bot (`chat-webhook` tampoco chequea).
Igual para `calendar-sync`.

El aislamiento de **datos** es sólido. Lo que no está protegido es el acceso a
**funciones pagas**.

**Arreglo:** helper compartido `assertFeature(supabase, userId, key)` al inicio de
las funciones que sirven features pagas.

### M4 · `past_due` conserva el acceso completo, para siempre

`src/context/SubscriptionContext.tsx:135` · `src/router/ProtectedRoute.tsx:88-92`

`isExpired` se calcula solo para `trial`. Un usuario en `past_due` no está expirado,
no está cancelado y tiene fila → pasa el guard. Solo ve un banner. Tampoco se evalúa
`current_period_end` para usuarios `active`: si MP deja de cobrar y no llega webhook
de cancelación, el acceso sigue indefinidamente.

**Arreglo:** política explícita de gracia (ej. `past_due` > N días bloquea) y
evaluar `current_period_end` además del status.

---

## Menores

| # | Hallazgo | Ubicación |
|---|---|---|
| m1 | Firma de MP comparada con `===` (no timing-safe) y sin pasar `data.id` a minúsculas como pide la doc de MP. Si los ids dejan de venir en minúscula, **todos** los webhooks devuelven 401. `chat-webhook` sí implementa `timingSafeEqual`. | `mp-webhook/index.ts:24,44` |
| m2 | `email: z.string().max(150)` sin `.email()`. Cualquier texto entra a `patients.email` y se manda como attendee a Google Calendar, que rechaza el evento entero → la sync del turno muere en silencio. | `public-booking/index.ts:14` |
| m3 | `syncToGoogleCalendar` reimplementa el refresh de token aunque el archivo ya importa `getAccessTokenForUser` de `_shared/google-calendar.ts` y lo usa en `get_slots`. | `public-booking/index.ts:56-127` |
| m4 | El trigger de alta toma el primer plan activo con `trial_days IS NOT NULL` por `sort_order`. Si un admin le pone `trial_days` al plan caro, todos los registros nuevos van ahí. Si ninguno lo tiene, la suscripción se crea con `plan_id = NULL` y las 11 permissions en `false`. | `20260607000002_remove_trial_plan.sql:55-61` |
| m5 | El `UPDATE` final de `payment_events` filtra solo por `mp_resource_id` + `processed=false`: marca también las filas de fallo que escribe `create-checkout` con ese mismo id, con un `mp_status` que no les corresponde. | `mp-webhook/index.ts:294-297` |
| m6 | `confirm_appointment_safe` excluye `'cancelled'` y `'Cancelado'`; `confirm_public_appointment_safe` solo `'cancelled'`. Con filas legacy en castellano, un turno cancelado bloquea el horario desde el link público pero no desde la app. | `20260728000000_appointment_race_fix.sql` |
| m7 | 12 vulnerabilidades de `npm audit`, todas en `devDependencies` (`esbuild`, `rollup`, `postcss`, `undici`, `picomatch`). No viajan al bundle; sí afectan a la máquina que buildea. `npm audit fix` las resuelve. | `package.json` |
| m8 | `CLAUDE.md` dice React Router 6; `package.json` tiene la 7. La lista de componentes también quedó desactualizada (faltan ~15 archivos nuevos). | `CLAUDE.md` |

---

## Orden sugerido

1. C1, C2 — los dos caminos por los que un cliente paga y no obtiene acceso.
2. C3 — dump del esquema a migración base.
3. M3 — IP real + orden de creación del paciente.
4. Ciclo completo en sandbox de MP: alta → cobro → upgrade → downgrade → renovación → cancelación, verificando `payment_events` en cada paso.
5. M1, M2 — feature gating real, también server-side.
6. M4, m1 — gracia de `past_due` y endurecimiento de la firma.
7. `npm audit fix` + tests de integración del webhook (firma inválida, duplicado, cuota mensual, cancelación).

No urgente: los 223 `any`, el nombre de `EvolutionService`, el código muerto de
`system_prompt` / `apikey_evolution`, y la duplicación de m3.
