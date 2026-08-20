# Runbook de lanzamiento — correcciones P0/P1

Acompaña a los cambios de código de esta rama. Todo lo de acá se ejecuta contra
el proyecto `dzpvvfhrcadmhppnyqcp`.

## Qué se arregló

| # | Problema | Dónde |
|---|---|---|
| C1 | Un estado no mapeado de MercadoPago escribía `status='trial'` y expulsaba de la app a clientes que ya pagaban | `_shared/mp-status.ts`, `mp-webhook` |
| C2 | Un evento cuyo `UPDATE` fallaba (o no encontraba fila) se perdía para siempre | `mp-webhook`, `create-checkout` |
| C2b | Una caída transitoria de la API de MercadoPago descartaba el evento | `mp-webhook` |
| M3 | El rate limit del link público se salteaba con un header, y cada intento dejaba un paciente basura | `_shared/client-ip.ts`, `public-booking` |
| M4 | `past_due` y período vencido conservaban acceso completo para siempre | `subscriptionStatus.ts`, `SubscriptionBanner` |
| M1 | 6 de 11 feature keys no aplicaban ningún control | `featureKeys.ts`, `_shared/feature-keys.ts`, migración |
| M2 | El feature gating existía solo en React | `_shared/features.ts`, `whatsapp-manager`, `chat-webhook` |
| m1 | Firma de MP comparada con `===` y sin normalizar `data.id` | `_shared/crypto.ts`, `mp-webhook` |
| m2 | El email del formulario público no se validaba | `public-booking` |
| m5 | El cierre de `payment_events` marcaba filas ajenas | `mp-webhook` |

Tests: 50 → 80. `typecheck`, `lint` (0 errores) y `build` en verde.

---

## 1. Deploy de Edge Functions

Las cuatro funciones tocadas. Los flags no cambian respecto de hoy:

```bash
supabase functions deploy mp-webhook      --no-verify-jwt
supabase functions deploy public-booking  --no-verify-jwt
supabase functions deploy chat-webhook    --no-verify-jwt
supabase functions deploy whatsapp-manager
```

`create-checkout` también cambió (orden de guardado):

```bash
supabase functions deploy create-checkout
```

> **Orden:** desplegar `create-checkout` **antes** que `mp-webhook`. Así, cuando
> el webhook nuevo empiece a exigir que la fila exista, `create-checkout` ya la
> está guardando temprano. Al revés hay una ventana en la que el webhook
> devuelve 500 y espera un reintento que igual llega bien — no rompe nada, solo
> genera ruido en los logs.

## 2. Frontend

Build normal. Las `VITE_*` se hornean en la imagen, así que hay que rebuildear:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_ANON_KEY=... \
  -t dentaldash:latest .
```

## 3. Migración de limpieza de feature keys

`supabase/migrations/20260820120000_prune_unenforced_feature_keys.sql`

**No es bloqueante para el deploy**: si el código nuevo corre con la base vieja,
las 6 filas sobrantes de `feature_permissions` simplemente no las consulta nadie.
Se puede aplicar antes o después, sin estado intermedio roto.

⚠️ **No usar `supabase db push`** hasta terminar el baseline (paso 5): las
versiones de los archivos del repo no coinciden con las 62 migraciones aplicadas
en producción, así que un push intentaría reaplicar historia vieja. Por ahora,
aplicar el SQL de esa migración a mano desde el SQL Editor del dashboard.

Verificación:

```sql
-- Debe devolver solo las 5 claves vigentes
select distinct feature_key from public.feature_permissions order by 1;

-- Los planes no deben conservar ninguna clave retirada
select name, feature_keys from public.subscription_plans order by sort_order;
```

## 4. Reparación de la suscripción trabada

Hay **una** fila que quedó con `status='trial'` y `trial_ends_at` vencido pese a
tener `current_period_end` en el futuro y `mercadopago_sub_id` cargado. Es el
síntoma exacto de C1.

Primero identificarla y confirmar el estado real contra MercadoPago:

```sql
select user_id, mercadopago_sub_id, status, trial_ends_at, current_period_end
from   public.subscriptions
where  status = 'trial'
  and  mercadopago_sub_id is not null
  and  current_period_end > now();
```

```bash
curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  https://api.mercadopago.com/preapproval/<mercadopago_sub_id> | jq '.status, .next_payment_date'
```

Solo si MercadoPago responde `"authorized"`:

```sql
update public.subscriptions
set    status = 'active', updated_at = now()
where  mercadopago_sub_id = '<preapproval_id>'
  and  status = 'trial'
  and  current_period_end > now();
```

Si responde `"cancelled"`, dejarla como está: el usuario tiene que recontratar.

También hay una fila `preapproval_cancel_failed` en `payment_events`: es un
preapproval que pudo haber quedado cobrando. Verificarlo en el panel de
MercadoPago y cancelarlo a mano si sigue activo.

```sql
select created_at, mp_resource_id, payload->>'detail'
from   public.payment_events
where  event_type = 'preapproval_cancel_failed';
```

## 5. Baseline del esquema (C3)

Pendiente, lo corrés vos. Ver el plan aprobado; el resumen:

```bash
supabase link --project-ref dzpvvfhrcadmhppnyqcp
supabase db dump --schema public  -f supabase/migrations/00000000000000_baseline.sql
supabase db dump --schema storage -f supabase/migrations/00000000000001_storage.sql
mkdir -p supabase/migrations/_archive
git mv supabase/migrations/2026*.sql supabase/migrations/_archive/
supabase migration repair --status applied 00000000000000
supabase migration repair --status applied 00000000000001
supabase db diff --schema public   # no debe devolver nada
```

Ojo: el `git mv` también movería la migración nueva del paso 3. Aplicarla primero
y después dejarla dentro del baseline, o excluirla del `mv` a mano.

## 6. Verificación end-to-end en sandbox

Con credenciales `TEST-` y una cuenta de comprador de prueba de MercadoPago:

1. **Alta** desde `/pricing` → pagar → `status='active'`, `current_period_end` con
   la fecha que informó MP.
2. **Abandonar un upgrade** → abrir el checkout del otro plan y cerrar la
   pestaña sin pagar. El usuario tiene que seguir en `active` con su plan
   original y **con acceso a la app**. Este es el caso que hoy lo deja afuera.
3. **Completar el upgrade** → plan y permisos nuevos.
4. **Downgrade** → `pending_plan_id` cargado, acceso sin cambios.
5. `select public.apply_pending_plan_changes();` → plan bajado, permisos
   revocados.
6. **Cancelar** → `cancelled_at` cargado y preapproval cancelado en MP.

Después de cada paso:

```sql
select created_at, event_type, mp_status, processed
from   public.payment_events
order  by created_at desc limit 10;
```

Todos `processed = true` y ninguno con `mp_status` nulo.

## 7. Antes de abrir el registro

- [ ] **Precios reales.** Hoy los planes están en `15.00` y `16.00` ARS.
- [ ] **`trial_days` definitivo.** Hoy: Básico 7, Asistente IA 1.
- [ ] **Leaked Password Protection** en Supabase Auth → Policies (hoy desactivado,
      lo reporta el advisor de seguridad).
- [ ] `npm audit fix` — 12 vulnerabilidades, todas de build.
- [ ] Confirmar la cadena de `x-forwarded-for` en producción: loguearla una vez
      desde `public-booking` y verificar que el último elemento es la IP real
      del visitante.

## Rollback

Las Edge Functions se revierten con un redeploy de la versión anterior. Los
cambios de `mp-webhook` son compatibles hacia atrás con los datos: no cambian
ningún esquema, solo qué se escribe y cuándo. La migración del paso 3 sí borra
filas — si hiciera falta revertirla, `apply_pending_plan_changes()` regenera las
`feature_permissions` a partir de los planes, pero las claves retiradas habría
que volver a agregarlas primero a `subscription_plans.feature_keys`.
