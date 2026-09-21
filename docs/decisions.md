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

## ADR-009 — SDK de Flutter instalado; ADR-003 superada

- **Contexto:** ADR-003 (M0) documentó que el contenedor de desarrollo no
  tenía SDK de Flutter y que el esqueleto móvil no se pudo verificar. Al
  empezar M3 había acceso a red y espacio en disco suficientes para
  instalar el SDK.
- **Decisión:** se instaló Flutter 3.47.5 stable en `/opt/flutter`
  (`PATH="/opt/flutter/bin:$PATH"`, agregado a `~/.bashrc` en este
  contenedor — no persiste entre sesiones/contenedores nuevos) y se corrió
  `flutter create --platforms=android,ios --project-name copiloto --org
  com.copiloto .` sobre `apps/mobile` para generar `android/`, `ios/`,
  `.metadata` y el `.gitignore` propio del paquete Flutter, sin tocar
  `lib/` ni `test/` existentes. `flutter analyze` y `flutter test` corren
  de verdad desde ahora.
- **Verificación real reveló 3 bugs en el código de M0** (nunca antes
  ejecutado), corregidos en este commit:
  1. `pubspec.yaml` fijaba `intl: ^0.19.0`; el `flutter_localizations`
     de este SDK requiere `^0.20.3` — `flutter pub get` fallaba.
  2. `test/widget_test.dart` montaba `CopilotoApp()` sin envolverlo en
     `ProviderScope`, y `HomeScreen` usa Riverpod (`ConsumerWidget`) →
     `Bad state: No ProviderScope found`.
  3. El mismo test dejaba pendiente un timer de dio (el chequeo real de
     `/healthz` en `HomeScreen`) al terminar, violando la regla de
     `flutter_test` de no dejar timers vivos tras destruir el árbol de
     widgets; se resolvió sobreescribiendo `apiClientProvider` con un
     `_FakeApiClient` en el test — los tests de widgets no deben pegarle
     a la red real.
- **Consecuencias:** `apps/mobile/README.md` y las notas de ADR-003 sobre
  "no verificado" quedan obsoletas para este entorno; **no** se borra
  ADR-003 (es historial), pero deja de aplicar. Si una sesión futura corre
  en un contenedor sin este SDK persistido, hay que reinstalarlo (este
  ADR documenta el comando exacto) antes de tocar `apps/mobile`.
- **Fecha:** 2026-09-21.

## ADR-010 — Cliente Dart escrito a mano en vez de generado desde OpenAPI (M3)

- **Contexto:** D-01/ADR-002 previeron generar el cliente Dart desde
  `openapi.json` en cuanto hubiera endpoints `/v1`. Al empezar M3 (con
  endpoints de M1+M2 ya expuestos) se intentó `npx
  @openapitools/openapi-generator-cli` para generarlo: falla porque
  descarga el `.jar` desde `central.sonatype.com`, host no permitido por
  la política de red del proxy de este entorno (`request blocked: no rule
  or allowlist entry allows host`).
- **Decisión:** `apps/mobile/lib/core/api` se escribe a mano: modelos
  tipados (`fromJson`/`toJson`) y clases de cliente por recurso sobre
  `dio`, reflejando 1 a 1 los esquemas Zod del backend (`*.schemas.ts` en
  `apps/api`). Cambiar un esquema del backend exige actualizar el modelo
  Dart correspondiente a mano; no hay generación automática todavía.
- **Alternativas:** instalar el generador desde otra fuente (Homebrew,
  binario de GitHub Releases) — no se probó por estar fuera del scope de
  esta sesión y por la misma restricción de red podría fallar igual; un
  cliente HTTP no tipado (`dynamic`/`Map`) — pierde el chequeo en tiempo
  de compilación que `flutter analyze` puede dar hoy.
- **Consecuencias:** riesgo de divergencia entre el contrato real de la
  API y los modelos Dart si no se actualizan juntos; revisar este ADR
  cuando un entorno con acceso a `central.sonatype.com` (o un generador
  alternativo) esté disponible para retomar la generación automática.
- **Fecha:** 2026-09-21.

## ADR-011 — Router (`go_router`) dirigido por el estado de sesión de Riverpod

- **Contexto:** M3 necesita redirigir según sesión (sin token → login; token
  pero onboarding sin terminar → onboarding; autenticado y con onboarding →
  shell) sin que cada pantalla de auth/onboarding navegue manualmente tras
  su acción (login/registro/logout ya no llaman `context.go` — ver
  `login_screen.dart`, `register_screen.dart`).
- **Decisión:** `appRouterProvider` (`lib/core/router/app_router.dart`) es un
  `Provider<GoRouter>` cuyo `redirect` lee `sessionControllerProvider` y
  cuyo `refreshListenable` es un `ChangeNotifier` que se suscribe a ese
  mismo provider vía `ref.listen` — así go_router reevalúa `redirect` cada
  vez que cambia el estado de sesión, no solo al navegar. Una ruta
  `/splash` cubre la ventana asíncrona de `AuthStatus.unknown` (bootstrap
  leyendo el token guardado) para no mostrar login/home de forma incorrecta
  antes de resolver la sesión.
- **Alternativas:** cada pantalla de auth navega explícitamente tras su
  acción (`context.go('/')` en login, etc.) — se descartó: duplica la
  lógica de "a dónde ir según el estado" en cada pantalla y diverge
  fácilmente del router.
- **Consecuencias:** el router se reconstruye una sola vez (no
  `autoDispose`); cualquier pantalla nueva que dependa de sesión debe
  confiar en el redirect en vez de navegar manualmente después de
  login/logout/onboarding. `test/widget_test.dart` sobreescribe
  `tokenStorageProvider` para no tocar el canal de plataforma real de
  `flutter_secure_storage` en tests de widgets.
- **Fecha:** 2026-09-21.

## ADR-012 — Edición de eventos sin `GET /events/:id`; eventos de todo el
  día no reprograman fecha/hora desde la app (M3)

- **Contexto:** `GET /calendar` (M2) devuelve filas ya con todos los campos
  de un evento (`CalendarItem`), pero no existe un `GET /events/:id`
  individual; además `EventsApi.update` (M2) no acepta `all_day`/
  `start_date`, solo `start_at`/`end_at` con hora.
- **Decisión:** `CalendarScreen` pasa el `CalendarItem` tocado directamente
  como `extra` de go_router hacia `EventFormScreen` (mismo patrón que
  `PersonDetailScreen` ya usaba con `Person`), sin pedirlo de nuevo a la
  API. Al editar un evento de todo el día, el formulario oculta los
  controles de fecha/hora y solo permite cambiar título/ubicación/
  categoría/persona, con un aviso (`eventsAllDayCantReschedule`).
- **Alternativas:** agregar `GET /events/:id` y extender `PATCH
  /events/:id` para aceptar `all_day`/`start_date` — trabajo de backend
  fuera del alcance de "pantallas de Calendario" en `apps/mobile`; se
  puede retomar si M3 necesita reprogramar eventos de todo el día.
- **Consecuencias:** reprogramar la fecha de un evento de todo el día
  requiere borrarlo y crearlo de nuevo por ahora; revisar este ADR si se
  extiende `PATCH /v1/events/:id` en un hito posterior.
- **Fecha:** 2026-09-21.

## ADR-013 — `ai_interactions` como almacenamiento del `parse`; dos relojes de expiración distintos

- **Contexto:** 8.1 exige que un `parse` expire a los 30 min si no se
  confirma, y 8.3 permite continuarlo (`parse_id` + `answers`) o
  confirmarlo (`commit`) de forma idempotente; la sección 6 no define una
  tabla separada para ese estado intermedio, solo `ai_interactions`
  (pensada para el log/retención de 10.5). Además, 10.5 pide purgar
  `ai_interactions.input_text/output_json` a los 30 **días** — un reloj
  totalmente distinto del de 30 **minutos** del parse.
- **Decisión:** `ai_interactions` hace las dos cosas: es el log de la
  interacción **y** el almacenamiento del `parse` en curso
  (`id` = `parse_id`, `output_json` guarda ítems/relaciones/aclaraciones y,
  tras el commit, el resultado para poder responder repeticiones
  idempotentes — AC-F04-07). `expires_at` se usa únicamente para la
  ventana de 30 minutos de 8.1; la purga de 30 días de 10.5 no tiene
  columna propia (se calcularía con `created_at < now() - 30 días`) y
  **no** se implementa todavía: requiere un scheduler (pg-boss, D-05), que
  recién se instala en M6.
- **Alternativas:** una tabla `parses` separada de `ai_interactions`
  (duplica casi todas las columnas sin necesidad); mantener el `parse` en
  memoria (viola 10.2, la API debe ser *stateless*).
- **Consecuencias:** hasta M6, `ai_interactions` crece sin purgarse
  automáticamente — aceptable para el volumen de desarrollo/pruebas de
  este hito, pero **hay que retomar este ADR en M6** para agregar el job
  de purga de 10.5 antes de producción real.
- **Fecha:** 2026-09-21.

## ADR-014 — Validaciones 8.4 como unión LLM+backend; placeholders de fecha/hora para aclaraciones

- **Contexto:** R-01/8.4.2 dicen que el backend, no el LLM, decide qué
  campo falta — pero algunas aclaraciones (G-10 "el lunes", G-12 "a las
  15" sin día) dependen de un juicio de lenguaje natural que el backend no
  puede reconstruir solo mirando qué campos están vacíos: si el LLM ya
  completó una fecha *provisoria* (p. ej. "hoy" como candidato más
  cercano) para poder devolver un `start_at` válido, el campo ya no está
  "vacío" desde el punto de vista mecánico del backend.
- **Decisión:** `deriveMissingFields` (`ai.validation.ts`) calcula la
  **unión** de lo que el LLM reportó en `missing_fields` con lo que el
  backend puede verificar mecánicamente (título vacío; evento sin fecha
  ni hora en absoluto) — nunca resta lo que el LLM marcó. El LLM (real o
  `FakeProvider`) sigue la convención de dejar un valor *placeholder* en
  `start_at`/`due_at`/`start_date` cuando conoce una parte del dato
  (fecha o wall-clock time) pero no la otra, en vez de dejar el campo
  vacío; `applyAnswer` combina ese placeholder con la respuesta del
  usuario en vez de reconstruir la fecha desde cero.
- **Alternativas:** que el backend reimplemente el algoritmo de
  resolución de fechas relativas de R-05/R-06 para decidir cuándo
  preguntar (duplica lógica que ya vive en el prompt/LLM y en los
  fixtures, y contradice "el LLM interpreta, el backend valida").
- **Consecuencias:** un proveedor real que no siga la convención del
  placeholder (por ejemplo, deja el campo completamente vacío en vez de
  poner la fecha/hora provisoria) haría que el backend pierda la
  posibilidad de combinar la respuesta del usuario con el dato parcial ya
  conocido — el prompt (`ai.prompt.ts`, regla R-06) documenta la
  convención explícitamente para mitigarlo.
- **Fecha:** 2026-09-21.

## ADR-015 — `AnthropicProvider`: salida estructurada con JSON Schema crudo, no `zodOutputFormat`

- **Contexto:** el SDK de Anthropic (`@anthropic-ai/sdk`) expone
  `zodOutputFormat()` como atajo para salida estructurada, pero internamente
  usa `zod/v4` (`z.toJSONSchema`) — un *submódulo* de compatibilidad que
  trae el paquete `zod` 3.25+, con una representación interna distinta de
  la del `zod` "v3" (`import { z } from 'zod'`) que usa el resto de este
  backend (D-02). Pasarle un schema construido con el `zod` de siempre a
  `zodOutputFormat()` es un riesgo real de incompatibilidad silenciosa.
- **Decisión:** `AnthropicProvider` arma el JSON Schema a mano con
  `zod-to-json-schema` (compatible con `zod/v3`, `$refStrategy: 'none'`
  para no depender de `$ref`) y lo manda directo en
  `output_config.format = { type: 'json_schema', schema }` vía
  `client.messages.create()`; el texto de la respuesta se parsea y valida
  con el mismo schema Zod de siempre (`req.schema.safeParse`), sin pasar
  por `client.messages.parse()`. `LlmProvider.generateStructured`
  (`lib/llm/provider.ts`) expone `schema: z.ZodType<T, ZodTypeDef,
  unknown>` — Zod, no un JSON Schema crudo, pese a que 8.1 describe la
  interfaz con `jsonSchema: object` — para que `FakeProvider` y
  `AnthropicProvider` compartan un único schema fuente de verdad, acorde a
  D-02 (Zod como validación en todo el backend).
- **Alternativas:** agregar `zod/v4` como dependencia directa solo para
  esta llamada (dos versiones de Zod conviviendo en el mismo paquete,
  confuso y frágil); usar `zodOutputFormat` igual y confiar en que
  funcione (sin garantía, no documentado como soportado para `zod` v3).
- **Consecuencias:** si el SDK de Anthropic cambia la forma de
  `output_config.format`, hay que actualizar solo `anthropic-provider.ts`;
  revisar este ADR si en el futuro se agrega soporte oficial de
  `zod-to-json-schema` (u otra utilidad) certificado para `zod/v4`.
- **Fecha:** 2026-09-21.

## ADR-016 — Continuación de aclaraciones sin nueva llamada al LLM; `shopping_item` se previsualiza pero no se confirma (P1/M9)

- **Contexto:** dos límites de alcance de M4: (1) 8.3 permite continuar un
  `parse` con `answers`, y no aclara si eso implica una nueva llamada al
  LLM; (2) los fixtures G-09 (dos `shopping_item`) están en el set de
  8.6, pero F09 (listas de compras) es P1/M9 — no existen las tablas
  `shopping_lists`/`shopping_items` todavía.
- **Decisión:** (1) `continueParse` (`ai.service.ts`) aplica la respuesta
  directamente sobre el ítem almacenado (ver ADR-014) sin volver a
  invocar `LlmProvider` — los tipos de respuesta de una `Clarification`
  (`time`/`date`/`choice`/`text`) ya traen un valor lo bastante resuelto
  como para no necesitar reinterpretación. (2) `POST /v1/ai/parse` sí
  devuelve ítems `shopping_item` en la vista previa (fiel a los
  fixtures), pero `POST /v1/ai/parse/{parse_id}/commit` rechaza el commit
  completo con `422 shopping_lists_not_available` si algún ítem es
  `shopping_item`.
- **Alternativas:** (1) volver a llamar al LLM en cada ronda de aclaración
  (gasto y latencia innecesarios para una respuesta ya estructurada,
  contradice el límite de 8.1 de "máx. 3 rondas" pensado como límite de
  interacción, no de llamadas al modelo). (2) crear ya las tablas de
  compras para no bloquear el commit (adelanta trabajo de M9 fuera de
  alcance de este hito).
- **Consecuencias:** una respuesta de texto libre mal formada en una
  aclaración no se corrige con una segunda pasada por el LLM — se
  revalida con las mismas reglas 8.4 y puede volver a pedir aclaración;
  la UI de M5 (F03/F04) deberá filtrar o deshabilitar la confirmación de
  ítems `shopping_item` hasta M9.
- **Fecha:** 2026-09-21.

## ADR-017 — Vista previa (mobile): editar un ítem vacía `missing_fields`; `shopping_item` bloquea Confirmar

- **Contexto:** M5 conecta `apps/mobile` a `/ai/parse`/`/commit` (ya
  construidos en M4). Dos huecos que el backend deja abiertos a propósito
  para que los resuelva el cliente: (1) 8.4 dice que "se ofrece completar
  a mano" después de 3 rondas de aclaración, pero no dice qué pasa con
  `missing_fields` cuando el usuario edita el ítem directamente en vez de
  responder una aclaración; (2) ADR-016 hace que el backend rechace todo
  el `commit` si algún ítem es `shopping_item` (F09/P1 no existe todavía),
  pero la vista previa sigue mostrando esos ítems (fieles al fixture G-09).
- **Decisión:** (1) `showEditParsedItemSheet` siempre guarda el ítem
  editado con `missing_fields: []` — el formulario ya exige los campos
  requeridos por tipo (fecha+hora o `all_day` en un evento, título
  siempre), así que la edición manual es en sí misma la resolución; el
  botón "Editar ítem" queda disponible en cualquier momento, no solo
  después de agotar las 3 rondas. (2) `ParsePreviewScreen._canConfirm` es
  `false` mientras quede algún ítem `shopping_item` en la lista — el
  usuario tiene que quitarlo explícitamente (R-02: nada desaparece solo)
  para poder confirmar el resto.
- **Alternativas:** (1) que el cliente vuelva a llamar a `/ai/parse` tras
  cada edición manual para que el backend re-derive `missing_fields`
  (round-trip innecesario: el formulario ya validó localmente lo que el
  backend habría verificado). (2) quitar los ítems `shopping_item` en
  silencio antes de confirmar (viola R-02/R-01 — el usuario nunca ve que
  algo desapareció).
- **Consecuencias:** el backend sigue siendo la autoridad final — su
  propio esquema Zod por tipo (`createTaskBodySchema`/`createEventBodySchema`)
  revalida en `commit` de todas formas, así que un ítem mal formado
  falla ahí, no se persiste corrupto. Revisar la rama "shopping_item
  bloquea Confirmar" cuando exista F09 (M9).
- **Fecha:** 2026-09-21.
