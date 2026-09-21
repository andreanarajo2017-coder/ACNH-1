# Decisiones de arquitectura (ADRs)

Formato: 5 líneas — contexto, decisión, alternativas, consecuencias, fecha.
Las decisiones D-01…D-16 de la sección 2 de la especificación ya están
tomadas y no requieren ADR salvo que se cambien. Este archivo registra
decisiones de implementación adicionales, tomadas ante ambigüedad, siguiendo
la regla 0.4 del documento de especificación.

---

## ADR-001 — Estructura de build de `apps/api`

- **Contexto:** `tsconfig.json` (usado por el editor/ESLint) incluye `src` y
  `test`, pero `npm run build` no debe empaquetar los tests en `dist/`.
- **Decisión:** se agrega `tsconfig.build.json` (extiende de `tsconfig.json`,
  `rootDir`/`include` limitados a `src`) y `npm run build` usa ese archivo.
- **Alternativas:** un solo `tsconfig.json` con `test` excluido del
  typecheck (perdía cobertura de tipos en los tests).
- **Consecuencias:** dos archivos de config a mantener sincronizados en
  `compilerOptions` compartidas (vía `extends`); `dist/server.js` queda en
  la raíz de `dist/` en vez de `dist/src/server.js`.
- **Fecha:** 2026-09-19.

## ADR-002 — Cliente de IA generado (mobile) diferido a M4

- **Contexto:** D-01 pide un cliente Dart generado desde el OpenAPI de la
  API, pero en M0 la API solo expone `/healthz` y `/readyz` (fuera de
  `/v1`); el OpenAPI real (generado desde los esquemas Zod, ver sección 7)
  no existe hasta que haya endpoints de dominio.
- **Decisión:** en M0, `apps/mobile` usa un `ApiClient` escrito a mano
  (`lib/core/api/api_client.dart`) solo para `GET /healthz`. La generación
  de cliente desde OpenAPI se activa cuando existan los primeros endpoints
  `/v1` (M1 en adelante).
- **Alternativas:** generar un OpenAPI vacío ya en M0 (sobre-ingeniería sin
  valor: no habría endpoints que generar).
- **Consecuencias:** `apps/mobile/lib/core/api/api_client.dart` debe
  reemplazarse por el cliente generado en cuanto exista `openapi.json`,
  documentado en la tarea de M1.
- **Fecha:** 2026-09-19.

## ADR-003 — Plataformas nativas de Flutter no generadas en este entorno

- **Contexto:** el contenedor donde se preparó el esqueleto de M0 no tiene
  el SDK de Flutter instalado, por lo que no se pudo ejecutar
  `flutter create` para generar `android/` e `ios/`, ni `flutter pub get` /
  `flutter analyze` / `flutter test` para verificar el código Dart escrito
  a mano.
- **Decisión:** se deja únicamente el código Dart (`lib/`, `test/`,
  `pubspec.yaml`, `l10n.yaml`, `analysis_options.yaml`); `apps/mobile/README.md`
  documenta el paso `flutter create --platforms=android,ios .` a ejecutar
  una vez, en una máquina con el SDK, antes de compilar para dispositivo.
- **Alternativas:** escribir a mano los proyectos nativos (alto riesgo de
  inconsistencia con la versión real del SDK, sin forma de verificarlos
  aquí).
- **Consecuencias:** el primer desarrollador que abra `apps/mobile` con
  Flutter instalado debe correr `flutter create` y `flutter pub get` antes
  de `flutter run`; CI (`flutter analyze`/`flutter test`) no requiere las
  carpetas nativas y no se vio afectado.
- **Fecha:** 2026-09-19.

## ADR-004 — Tablas de implementación fuera del modelo canónico (M1)

- **Contexto:** F01 requiere límite de intentos de login (5/15 min por
  email+IP) y recuperación de contraseña con token de un solo uso, pero la
  sección 6 no define tablas para ninguna de las dos, y 10.2 pide que la API
  sea *stateless* y escalable horizontalmente (descarta un limitador solo en
  memoria).
- **Decisión:** se agregan dos tablas no listadas en la sección 6:
  `login_attempts(email, ip, succeeded_at, created_at)` (ventana deslizante
  persistida) y `password_reset_tokens(user_id, token_hash, expires_at,
  used_at)`.
- **Alternativas:** limitador en memoria (viola 10.2 con múltiples
  instancias); extender `refresh_tokens` para tokens de reset (mezclaría
  dos conceptos con ciclos de vida distintos).
- **Consecuencias:** dos tablas adicionales a mantener; ambas son puramente
  de implementación (sin `user_id` propio en `login_attempts`, sin soft
  delete) y no forman parte del contrato de dominio.
- **Fecha:** 2026-09-19.

## ADR-005 — Email liberado al eliminar la cuenta (soft delete)

- **Contexto:** `DELETE /me` hace soft delete (`deleted_at`, ver 10.5); con
  un `UNIQUE` simple en `users.email`, volver a registrarse con el mismo
  email después de eliminar la cuenta fallaba con `500` por violar la
  restricción, porque la fila eliminada seguía ocupando el email. Se detectó
  probando el flujo completo manualmente antes de escribir los tests
  automatizados.
- **Decisión:** `users.email` pasa a un índice único **parcial**
  (`WHERE deleted_at IS NULL`), y `AuthService.register` además captura el
  código de Postgres `23505` como defensa en profundidad ante una carrera
  entre dos registros simultáneos con el mismo email.
- **Alternativas:** anonimizar/mutar el email al eliminar la cuenta (pierde
  la posibilidad de reconstruir el historial si se recupera dentro de la
  ventana de purga de 10.5).
- **Consecuencias:** el email de una cuenta eliminada queda libre de
  inmediato para un nuevo registro; el historial de la fila eliminada se
  conserva hasta el job de purga definitiva (≤ 30 días, pendiente de M6).
- **Fecha:** 2026-09-19.

## ADR-006 — Tests de integración: Postgres real, no Testcontainers; archivos secuenciales

- **Contexto:** 13 sugiere Testcontainers para integración; el contenedor de
  desarrollo no tiene un daemon de Docker disponible, así que un test
  basado en Testcontainers no se puede ejecutar ni verificar aquí. Los
  tests de auth/me necesitan un Postgres real (RLS, `citext`, índices
  parciales no son simulables con un mock). Además, Vitest corre archivos
  de test en paralelo por defecto; con una sola base compartida y cada
  archivo truncando tablas en su `beforeEach`, un archivo puede borrar los
  datos de otro a mitad de ejecución (se reprodujo como fallos
  intermitentes de 401/429 en tests que debían pasar).
- **Decisión:** los tests de integración se conectan directamente a
  `DATABASE_URL` (Postgres real, iniciado localmente en dev y como
  *service container* de Postgres en `ci.yml`, no Testcontainers-en-proceso)
  y `vitest.config.ts` fija `fileParallelism: false` para que los archivos
  de test corran en serie contra esa base compartida.
- **Alternativas:** Testcontainers (no verificable en este entorno);
  una base de datos por archivo de test (más aislamiento pero más
  complejidad de setup, innecesaria en este volumen de tests).
- **Consecuencias:** el suite de tests es más lento de lo que sería en
  paralelo, pero determinista; cualquier test nuevo que toque tablas
  compartidas debe truncar en su propio `beforeEach` (ver
  `test/helpers/app.ts`) y no asumir aislamiento entre archivos más allá
  del orden secuencial.
- **Fecha:** 2026-09-20.

## ADR-007 — Row-Level Security: conexión dedicada por request, `set_config` en vez de `SET ... = $1`

- **Contexto:** la sección 6 pide RLS por `user_id` como defensa en
  profundidad. La API usa un `pg.Pool` compartido; para que las políticas
  de RLS vean el `user_id` correcto, cada query autenticada necesita
  ejecutarse en una conexión donde se haya fijado `app.user_id`, y esa
  conexión no puede volver al pool con el valor de otro usuario todavía
  puesto. Además, `SET app.user_id = $1` **no es sintaxis válida** en
  Postgres (el comando `SET` no acepta parámetros enlazados) — se
  reprodujo como `syntax error at or near "$1"` al escribirlo así en un
  primer intento.
- **Decisión:** el `preHandler` `authenticate`
  (`apps/api/src/plugins/auth.ts`) hace `pool.connect()`, corre
  `SELECT set_config('app.user_id', $1, false)` (síncrona la función, sí
  soporta parámetros) y expone `request.db`/`request.dbClient`; un hook
  global `onResponse` en `app.ts` hace `RESET app.user_id` y libera la
  conexión al pool. Los módulos de dominio (M2+) usan `request.db`, no el
  `db` global de la app. Dentro de una transacción ya abierta (p. ej. el
  alta de categorías semilla en `AuthService.register`, que corre en la
  conexión sin contexto RLS porque el registro es previo a tener
  `request.userId`) se usa `set_config(..., true)` (equivalente a `SET
  LOCAL`, vigente solo para esa transacción).
- **Alternativas:** RLS con `SET LOCAL` dentro de una transacción explícita
  por request (más invasivo: obliga a envolver cada handler en una
  transacción aunque no la necesite); confiar solo en el filtro `WHERE
  user_id = ...` de la capa de aplicación sin RLS (pierde la defensa en
  profundidad que pide la sección 6).
- **Consecuencias:** todas las tablas de dominio (`categories`, `people`,
  `tasks`, `events`, `inbox_items`, `item_relations`, `reminders`) tienen
  `ENABLE` + `FORCE ROW LEVEL SECURITY` (FORCE es necesario porque la app
  se conecta con el rol dueño de las tablas, que por defecto se salta RLS)
  y una policy `USING/WITH CHECK (user_id = current_setting('app.user_id',
  true)::uuid)`; sin `app.user_id` seteado, las políticas deniegan todo
  por defecto. Cualquier tabla de dominio nueva debe sumarse a la migración
  de RLS y sus tests deben usar `request.db`, nunca el `db` de la app.
- **Fecha:** 2026-09-21.

## ADR-008 — Presets de "posponer" sin límites de día calendario por zona horaria

- **Contexto:** F06 define presets de posponer tarea ("más tarde hoy" = +3 h,
  "mañana", "la semana que viene", "elegir"). "Mañana" y "la semana que
  viene" sugieren un límite de *día calendario* (p. ej. "mañana" debería
  significar el inicio del día siguiente en la zona horaria del usuario),
  pero calcular eso bien requiere la zona horaria del usuario (ya existe en
  `users.timezone`) y aritmética de calendario con esa zona — trabajo real
  que hoy no tiene un consumidor (la UI de "Tareas" con las vistas Hoy/
  Vencidas es M3; el algoritmo de "¿Qué hago ahora?" que realmente decide
  qué es "hoy" es M7).
- **Decisión:** para M2, los tres presets son desplazamientos fijos desde
  `Clock.now()`: `later_today` = +3 h, `tomorrow` = +24 h, `next_week` =
  +7 días. `TasksService.postpone` (`src/modules/tasks/tasks.service.ts`)
  documenta esto en un comentario.
- **Alternativas:** implementar ya el cálculo con zona horaria (trabajo
  especulativo sin nada que lo consuma todavía, contra la regla de no
  construir para requisitos hipotéticos).
- **Consecuencias:** "mañana" pospuesto a las 23:50 vence a las 23:50 del
  día siguiente, no a las 00:00 — puede sentirse raro en el límite del día.
  Revisar este ADR cuando se implemente la vista "Hoy" (M3) o "¿Qué hago
  ahora?" (M7), que sí necesitan aritmética de calendario con zona horaria.
- **Fecha:** 2026-09-21.
