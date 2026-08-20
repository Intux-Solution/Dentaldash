# Guía de puesta en producción

Ocho pasos, en orden. Cada uno dice **qué hace**, **por qué va en ese lugar**,
**el comando exacto**, **qué tenés que ver** y **cómo volver atrás**.

Tiempo estimado: 1 hora larga, sin contar el ciclo de prueba de MercadoPago.

**Datos del proyecto**

| | |
|---|---|
| Repo | `Intux-Solution/Dentaldash` |
| Rama | `claude/code-review-mercadopago-docs-8elgrp` |
| PR | [#7](https://github.com/Intux-Solution/Dentaldash/pull/7) |
| Supabase project ref | `dzpvvfhrcadmhppnyqcp` |
| Dominio de producción | `https://dashboard.dentaldash.cloud` |

> **Regla que atraviesa toda la guía: no corras `supabase db push`.**
> El repo tiene 25 archivos de migración y tu base tiene 62 migraciones
> aplicadas, con números de versión que no coinciden entre sí. Un `push`
> intentaría reaplicar historia que la base ya tiene. El paso 2 arregla eso;
> hasta entonces, todo el SQL va a mano por el editor del panel.

---

## Paso 1 — Mergear el Pull Request

**Qué hace:** lleva los 3 commits de la rama a `main`.

**Por qué primero:** nada se despliega desde una rama. Todo lo que sigue asume
que `main` ya tiene el código nuevo.

### Cómo

1. Abrí https://github.com/Intux-Solution/Dentaldash/pull/7
2. Pestaña **Files changed**: 22 archivos. Vale la pena mirar
   `supabase/functions/mp-webhook/index.ts`, que es donde estaban los dos bugs
   de cobro.
3. Botón **Merge pull request** → **Confirm merge**.

### Qué tenés que ver

El PR queda en morado con el cartel *Merged*. En la pestaña **Commits** de `main`
aparecen los 3 commits nuevos.

### Rollback

`git revert -m 1 <sha-del-merge>` desde tu máquina, o el botón **Revert** que
GitHub deja en el PR ya mergeado.

---

## Paso 2 — Baseline del esquema

**Qué hace:** exporta la estructura completa de tu base de producción (tablas,
índices, políticas de RLS, funciones, triggers) a un archivo en el repo.

**Por qué acá:** es una operación de **solo lectura** sobre producción, así que
no puede romper nada, y te deja un punto de recuperación antes de tocar
cualquier otra cosa. Además desbloquea el uso normal de migraciones para
adelante.

**El problema que resuelve:** hoy, si tu base de datos desaparece, el repo no
alcanza para reconstruirla. Las migraciones versionadas cubren facturación y
permisos, pero las tablas más viejas y más sensibles — `patients`,
`appointments`, `profiles`, `odontograms` — nunca entraron al repo. Sus
políticas de RLS, que son lo único que impide que un dentista vea las historias
clínicas de otro, tampoco. Están bien configuradas (lo verifiqué), pero viven
solo dentro de Supabase.

### Cómo

```bash
cd /ruta/a/Dentaldash
git checkout main && git pull

supabase login                                  # si no lo hiciste antes
supabase link --project-ref dzpvvfhrcadmhppnyqcp
```

`link` te va a pedir la contraseña de la base. Está en el panel de Supabase:
**Project Settings → Database → Connection string**.

```bash
# Estructura del schema public: tablas, RLS, funciones, triggers
supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql

# Storage aparte: los buckets y sus policies viven en otro schema
supabase db dump --schema storage -f supabase/migrations/00000000000001_storage.sql
```

Abrí `00000000000000_baseline.sql` y confirmá que estén las tablas grandes:

```bash
grep -c "CREATE TABLE" supabase/migrations/00000000000000_baseline.sql   # esperado: ~17
grep -c "CREATE POLICY" supabase/migrations/00000000000000_baseline.sql  # esperado: ~16
```

Ahora archivá los 25 archivos viejos. Ya están reflejados dentro del baseline y
sus versiones no coinciden con las aplicadas, así que solo generan confusión:

```bash
mkdir -p supabase/migrations/_archive

# Ojo: el patrón 2026* también agarraría la migración nueva del paso 4.
# Por eso la excluimos explícitamente.
find supabase/migrations -maxdepth 1 -name '2026*.sql' \
  ! -name '20260820120000_prune_unenforced_feature_keys.sql' \
  -exec git mv {} supabase/migrations/_archive/ \;
```

Decile a Supabase que el baseline ya está aplicado, para que no intente
ejecutarlo la próxima vez:

```bash
supabase migration repair --status applied 00000000000000
supabase migration repair --status applied 00000000000001
```

### Qué tenés que ver

```bash
supabase db diff --schema public
```

**No debe imprimir nada.** Si no imprime nada, el repo y tu base coinciden: a
partir de acá el repo es la fuente de verdad y podés volver a usar
`supabase db push` con normalidad.

Guardá el resultado:

```bash
git add supabase/migrations
git commit -m "chore: baseline del esquema de produccion"
git push
```

### Si algo sale mal

Si `db diff` muestra diferencias, **no las apliques todavía** — significa que el
dump se comió algo. Guardá la salida y revisala antes de seguir. Ningún paso
posterior depende de esto, así que podés continuar con el 3 y volver acá después.

### Rollback

No hay nada que revertir: todo el paso escribe archivos en tu repo, nunca en la
base. `migration repair` solo toca una tabla de bookkeeping interna de Supabase.

---

## Paso 3 — Desplegar las Edge Functions

**Qué hace:** publica el código nuevo de las 5 funciones que corren en Supabase.
Acá viven los arreglos de cobro.

### Cómo — el orden importa

```bash
supabase functions deploy create-checkout
```

**Esperá a que termine antes de seguir.** `create-checkout` es quien guarda el
identificador de la suscripción de MercadoPago en la base. La versión nueva lo
guarda mucho antes que la vieja. El webhook nuevo, por su parte, exige que ese
identificador ya exista y devuelve un error pidiendo reintento si no lo
encuentra.

Si desplegás el webhook primero, durante esos minutos vas a ver errores 500 en
los logs. **No rompe nada** — MercadoPago reintenta y el segundo intento entra
bien — pero es ruido evitable.

```bash
supabase functions deploy mp-webhook      --no-verify-jwt
supabase functions deploy public-booking  --no-verify-jwt
supabase functions deploy chat-webhook    --no-verify-jwt
supabase functions deploy whatsapp-manager
```

**Sobre `--no-verify-jwt`:** esas tres funciones las llaman servicios externos
(MercadoPago, Evolution API, y pacientes sin cuenta) que no pueden mandar un
token de sesión. Tienen su propia autenticación: firma HMAC en el caso de
MercadoPago, un secreto en la URL en el de Evolution. **Si olvidás el flag, esas
funciones dejan de responder** y se te cae el bot y el link de reservas.

### Qué tenés que ver

En el panel de Supabase → **Edge Functions**, las 5 con fecha de despliegue de
hoy. Después mirá los logs de `mp-webhook` un rato:

```bash
supabase functions logs mp-webhook
```

### Rollback

```bash
git checkout <sha-anterior> -- supabase/functions/mp-webhook
supabase functions deploy mp-webhook --no-verify-jwt
```

Los cambios de esta tanda **no modifican ningún esquema de base**: solo cambian
qué se escribe y cuándo. Volver atrás es seguro en cualquier momento.

---

## Paso 4 — Limpiar las feature keys

**Qué hace:** borra de la base las 6 claves de funcionalidad que no controlaban
nada.

**Por qué después del deploy:** no es bloqueante. Si el código nuevo corre con la
base vieja, las filas sobrantes simplemente no las consulta nadie. No existe un
estado intermedio roto, así que podés hacerlo cuando quieras.

**Por qué hay que borrarlas y no solo ignorarlas:** la función que aplica los
cambios de plan reconstruye la lista de claves a partir de lo que encuentra en la
base. Si dejás las filas viejas, las revive en cada cambio de plan y vuelven
para siempre.

### Cómo

Panel de Supabase → **SQL Editor** → pegá el contenido de
`supabase/migrations/20260820120000_prune_unenforced_feature_keys.sql` → **Run**.

### Qué tenés que ver

```sql
select distinct feature_key from public.feature_permissions order by 1;
```

Exactamente 5 filas: `export_data`, `faqs_config`, `insurance_management`,
`services_config`, `whatsapp_bot`.

```sql
select name, feature_keys from public.subscription_plans order by sort_order;
```

Ningún plan debe conservar `appointments`, `odontogram`, `clinical_records`,
`consent_forms`, `patients_unlimited` ni `google_calendar`.

### Rollback

El script borra filas, así que revertirlo es reconstruirlas. Si hiciera falta:
volvé a agregar las claves a `subscription_plans.feature_keys` y ejecutá
`select public.apply_pending_plan_changes();`, que regenera los permisos a partir
de los planes.

---

## Paso 5 — Reparar la suscripción trabada

**Qué hace:** devuelve el acceso a un usuario que pagó y quedó bloqueado por el
bug C1.

**Contexto:** hay una fila con `status='trial'` y fecha de trial vencida, pero
con período pagado hasta el 5 de septiembre y un identificador de MercadoPago
cargado. Es exactamente la huella del bug: pagó, se activó, y después un webhook
de tipo `pending` le pisó el estado y lo mandó a un trial que ya había vencido.

### Primero: identificar la fila

Panel → **SQL Editor**:

```sql
select user_id, mercadopago_sub_id, status, trial_ends_at, current_period_end
from   public.subscriptions
where  status = 'trial'
  and  mercadopago_sub_id is not null
  and  current_period_end > now();
```

Copiá el `mercadopago_sub_id`.

### Segundo: preguntarle a MercadoPago cuál es la verdad

Esto **no es opcional**. Un *preapproval* es la suscripción recurrente del lado
de MercadoPago: es quien decide si al usuario se le sigue cobrando o no. Nuestra
base es solo un reflejo. Si escribís `active` en una fila cuyo preapproval está
cancelado, le estás dando acceso gratis a alguien a quien nadie le cobra.

```bash
export MP_ACCESS_TOKEN='<tu token de produccion>'   # el mismo de los secrets de Supabase

curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  https://api.mercadopago.com/preapproval/<mercadopago_sub_id> \
  | jq '{status, next_payment_date, reason}'
```

| Respuesta de MercadoPago | Qué hacer |
|---|---|
| `"status": "authorized"` | Sigue cobrando. Reparar (abajo). |
| `"status": "cancelled"` | Ya no cobra. **No reparar** — el usuario tiene que contratar de nuevo. |
| `"status": "pending"` | Nunca llegó a autorizarse. No reparar. |

### Tercero: reparar, solo si dijo `authorized`

```sql
update public.subscriptions
set    status = 'active', updated_at = now()
where  mercadopago_sub_id = '<mercadopago_sub_id>'
  and  status = 'trial'
  and  current_period_end > now();
```

Debe decir **Success. 1 row**. Si dice 0 filas, revisá que copiaste bien el id.

### Cuarto: el preapproval huérfano

Hay una entrada `preapproval_cancel_failed` en la bitácora. Significa que en
algún momento no se pudo cancelar una suscripción vieja de MercadoPago, y podría
seguir cobrándole a alguien.

```sql
select created_at, mp_resource_id, payload->>'detail' as detalle
from   public.payment_events
where  event_type = 'preapproval_cancel_failed';
```

Consultá ese `mp_resource_id` con el mismo `curl` de arriba. Si vuelve
`authorized`, cancelalo desde el panel de MercadoPago (**Tus suscripciones**) o:

```bash
curl -s -X PUT -H "Authorization: Bearer $MP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"cancelled"}' \
  https://api.mercadopago.com/preapproval/<mp_resource_id> | jq '.status'
```

---

## Paso 6 — Redesplegar el frontend en Easypanel

**Qué hace:** publica la interfaz nueva (corte por vencimiento con gracia, aviso
en el banner, feature keys reducidas).

**Por qué hay que reconstruir y no solo reiniciar:** Vite mete las variables
`VITE_*` **dentro del código compilado** durante el build. No se leen en tiempo
de ejecución. Reiniciar el contenedor no cambia nada; hay que rehacer la imagen.

### Cómo

1. Entrá a Easypanel → tu proyecto → el servicio del frontend.
2. Si tenés **auto-deploy desde GitHub** activado, el merge del paso 1 ya
   disparó el build. Mirá la pestaña **Deployments** y confirmá que hay uno de
   hoy, en verde.
3. Si no, botón **Deploy** (o **Force rebuild** si querés forzar el build sin
   caché).

### La trampa a revisar

Las dos variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` tienen que
llegar **al momento del build**, no al del arranque. En el `Dockerfile` del repo
están declaradas como `ARG`.

Si en Easypanel están cargadas solo como variables de entorno de runtime, la
imagen compila igual pero la app arranca sin credenciales y no carga nada. Es un
error silencioso: el build sale verde y la web se ve rota.

**Cómo verificarlo sin adivinar** — después del deploy, comprobá que la URL de
Supabase realmente quedó adentro del JavaScript publicado:

```bash
curl -s https://dashboard.dentaldash.cloud/ \
  | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

Eso te da el nombre del bundle. Después:

```bash
curl -s https://dashboard.dentaldash.cloud/assets/index-XXXX.js \
  | grep -c "dzpvvfhrcadmhppnyqcp"
```

Si devuelve **1 o más**, las variables entraron bien. Si devuelve **0**, están
configuradas como runtime y hay que pasarlas a build args en la configuración
del servicio en Easypanel.

### Qué tenés que ver

Abrí `https://dashboard.dentaldash.cloud`, iniciá sesión y entrá a
**Configuración**. El panel de suscripción debe cargar normalmente. Con
`Ctrl+Shift+R` forzás recarga sin caché.

### Rollback

Easypanel guarda los despliegues anteriores: **Deployments** → elegí el previo →
**Redeploy**.

---

## Paso 7 — Probar el ciclo de cobro completo

**Qué hace:** verifica que los arreglos funcionan de verdad, con dinero de
prueba.

**Por qué no lo podés saltear:** los tests automáticos cubren la lógica en
aislamiento, pero C1 y C2 solo aparecen cuando MercadoPago manda webhooks reales
en orden real. Es la única prueba que los cubre de punta a punta.

### Preparación

Usá credenciales de **prueba** (empiezan con `TEST-`) y una cuenta de comprador
de prueba de MercadoPago. Con tu email real el preapproval falla: MercadoPago no
te deja suscribirte a vos mismo.

### La secuencia

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 1 | Alta desde `/pricing`, pagar | `status='active'`, `current_period_end` con la fecha que informó MP |
| 2 | **Abrir un upgrade y cerrar la pestaña sin pagar** | El usuario **sigue en `active` con su plan y con acceso a la app** |
| 3 | Completar el upgrade | Plan y permisos nuevos |
| 4 | Bajar de plan | `pending_plan_id` cargado, el acceso no cambia |
| 5 | `select public.apply_pending_plan_changes();` | Plan bajado, permisos revocados |
| 6 | Cancelar | `cancelled_at` cargado y preapproval cancelado en MP |

**El paso 2 es el importante.** Es exactamente el que hoy deja al usuario
afuera. Antes del arreglo, cerrar esa pestaña lo mandaba a `/suscripcion` sin
poder volver a entrar. Si después del arreglo seguís teniendo acceso normal,
C1 está cerrado.

### Después de cada paso

```sql
select created_at, event_type, mp_status, processed
from   public.payment_events
order  by created_at desc
limit  10;
```

Todos con `processed = true` y ninguno con `mp_status` en `null`. Un `null` o un
`false` que no se resuelve solo en un minuto significa que un evento quedó
colgado — copiá esa fila y avisame.

---

## Paso 8 — Antes de abrir el registro

Estos no son bugs; son cosas que todavía están en valores de prueba.

- [ ] **Precios reales.** Los planes están en **15 y 16 pesos**. Panel de admin →
      **Planes**, o directo en `subscription_plans.price_monthly`.
- [ ] **Días de prueba.** Hoy Básico da 7 días y Asistente IA 1. Definí el
      valor final en `trial_days`.
      ⚠️ El trigger de alta elige el plan del usuario nuevo tomando *el primer
      plan activo con `trial_days` cargado, ordenado por `sort_order`*. Si
      reordenás los planes, los registros nuevos cambian de plan sin avisar.
- [ ] **Leaked Password Protection.** Supabase → **Authentication → Policies**.
      Está desactivado; es un interruptor. Bloquea contraseñas que aparecieron
      en filtraciones conocidas.
- [ ] **Dependencias.** `npm audit fix` — 12 vulnerabilidades, todas en
      herramientas de build. No viajan al navegador del usuario, pero sí afectan
      a la máquina que compila.
- [ ] **Confirmar la cadena de IPs.** El rate limit del link público ahora lee el
      último elemento de `x-forwarded-for`. Loguealo una vez desde
      `public-booking` y confirmá que ese último valor es la IP real del
      visitante y no una interna de Supabase.

---

## Resumen para tener a mano

```bash
# Paso 2 — baseline (solo lectura sobre produccion)
supabase link --project-ref dzpvvfhrcadmhppnyqcp
supabase db dump --schema public  -f supabase/migrations/00000000000000_baseline.sql
supabase db dump --schema storage -f supabase/migrations/00000000000001_storage.sql
supabase migration repair --status applied 00000000000000
supabase migration repair --status applied 00000000000001
supabase db diff --schema public          # no debe imprimir nada

# Paso 3 — edge functions (create-checkout PRIMERO)
supabase functions deploy create-checkout
supabase functions deploy mp-webhook      --no-verify-jwt
supabase functions deploy public-booking  --no-verify-jwt
supabase functions deploy chat-webhook    --no-verify-jwt
supabase functions deploy whatsapp-manager
```

**Los tres que no se negocian:** no corras `db push` antes del paso 2, no te
olvides de `--no-verify-jwt` en las tres funciones públicas, y no repares la
suscripción del paso 5 sin preguntarle antes a MercadoPago.

Si algo no coincide con lo que dice esta guía, pará y avisame antes de seguir.
