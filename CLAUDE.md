# CLAUDE.md

Guía para trabajar en este repositorio. Ver `docs/spec.md` (o el documento
de especificación entregado) para el contrato funcional completo; este
archivo es operativo: cómo construir, testear y navegar el código.

## Visión general

**Copiloto Personal de Carga Mental** — app móvil (Flutter) + API
(Node.js/TypeScript) que convierte capturas en lenguaje natural en eventos,
tareas y compras estructurados, con un asistente de IA que propone y el
usuario confirma. Idioma del producto: español (es-AR). Código e
identificadores: inglés.

Implementación por hitos, **M0 → M8 en orden** (sección 12 de la
especificación); P1/P2 solo después de cerrar M8, salvo *feature flags*
explícitos. Estado actual: **M0 completado** (ver `docs/decisions.md`).

## Estructura del repositorio

```text
apps/
  api/      Backend — Node.js 22 + TypeScript strict + Fastify + Zod + Drizzle ORM
  mobile/   Cliente móvil — Flutter 3.x + Riverpod + go_router + drift
docs/
  decisions.md   ADRs (contexto, decisión, alternativas, consecuencias)
infra/
  docker-compose.yml   api + postgres
.github/workflows/
  ci.yml    lint + typecheck + test + build (api), analyze + test (mobile)
```

## Comandos

### Backend (`apps/api`)

Ejecutar siempre desde `apps/api`.

```bash
npm install              # instalar dependencias
npm run dev               # servidor con recarga (tsx watch)
npm run build              # compila a dist/ (tsconfig.build.json)
npm start                  # ejecuta dist/server.js
npm run lint                # eslint --max-warnings=0
npm run format               # prettier --check
npm run format:write          # prettier --write
npm run typecheck              # tsc --noEmit (incluye test/)
npm test                        # vitest run
npm run test:watch               # vitest en modo watch
npm run db:generate               # drizzle-kit generate (a partir de src/db/schema.ts)
npm run db:migrate                 # aplica migraciones en drizzle/ contra DATABASE_URL
npm run openapi:generate            # genera openapi.json desde los esquemas Zod (desde M1)
```

Variables de entorno: copiar `apps/api/.env.example` a `apps/api/.env`.
Nunca commitear `.env` ni secretos reales.

### Mobile (`apps/mobile`)

Requiere el SDK de Flutter instalado localmente (no disponible en el
contenedor donde se generó el esqueleto de M0 — ver `docs/decisions.md`,
ADR-003, y `apps/mobile/README.md` para el setup de primera vez).

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

### Infraestructura

```bash
docker compose -f infra/docker-compose.yml up --build
# API en http://localhost:3000, Postgres en localhost:5432 (user/pass/db: copiloto)
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz   # 200 solo si la DB responde
```

### CI

`.github/workflows/ci.yml` corre en cada push/PR: dos jobs independientes
(`api`, `mobile`), cada uno debe estar en verde antes de mergear.

## Convenciones (secciones 2, 4 y 13 de la especificación)

- **Reloj inyectable (D-16):** toda lógica dependiente de la hora recibe un
  `Clock` (`apps/api/src/lib/clock.ts`) en vez de llamar `Date.now()`/`new
  Date()` directamente. Los tests usan `FixedClock`.
- **Fechas:** instantes en UTC (`timestamptz`); "sin hora" se guarda como
  `due_date` (tipo `date`), nunca como medianoche (R-04).
- **Aislamiento por usuario (R-13):** todo recurso pertenece a un
  `user_id`; acceder al recurso de otro usuario devuelve `404`, nunca
  `403`. RLS de Postgres como defensa en profundidad además del filtro en
  la capa de datos (a partir de M2).
- **Nunca inventar información (R-01):** un campo requerido ausente se
  convierte en una `Clarification`; el LLM nunca decide solo, el backend
  valida su salida contra los esquemas Zod.
- **Confirmación explícita (R-02, R-03):** nada se persiste sin
  confirmación del usuario; las sugerencias no son acciones.
- **Sin datos sensibles en logs:** nunca loguear texto de capturas,
  títulos, emails ni tokens (10.4). El logger de Fastify ya redacta
  `Authorization`.
- **Sin secretos en el repo:** mantener `.env.example` completo y
  actualizado en cada paquete que lo requiera.
- **Trazabilidad de tests:** nombrar los tests con el ID del criterio de
  aceptación que cubren (`AC-F04-02`, `AC-M0-01`, …).
- **OpenAPI como fuente de verdad (sección 7):** desde M1, la OpenAPI 3.1
  se genera desde los esquemas Zod del backend; el cliente Dart se genera
  en CI a partir de esa OpenAPI (ver ADR-002 para el estado transitorio de
  M0).
- **Vocabulario normativo:** DEBE = obligatorio, DEBERÍA = recomendado
  (desviarse requiere ADR en `docs/decisions.md`), PUEDE = opcional.

## Ante ambigüedad

No bloquearse: elegir la opción más simple coherente con la sección 4 de la
especificación, registrar un ADR de 5 líneas en `docs/decisions.md`
(contexto, decisión, alternativas, consecuencias, fecha) y continuar.
Detenerse a preguntar solo ante decisiones difíciles de revertir.

## Definition of Done (por hito y por PR)

- [ ] Criterios de aceptación del alcance implementados, con test nombrado
      por su ID.
- [ ] Lint, tipos estrictos y tests en verde en CI.
- [ ] OpenAPI y cliente generado actualizados; migraciones con `down`.
- [ ] Sin datos sensibles en logs; sin secretos en el repo.
- [ ] Strings externalizados (es); estados de carga, vacío y error
      implementados; etiquetas de accesibilidad.
- [ ] Funcionalidad P1/P2 detrás de *feature flag*.
- [ ] `docs/decisions.md` y este archivo actualizados si cambió algún
      supuesto.

## Próximo hito

**M1 — Cuentas:** registro/login por email+contraseña (F01), `/me`,
`/me/settings`, categorías semilla, eliminación de cuenta, límites de
intentos de login. Ver sección 5 (F01) y sección 12 de la especificación.
