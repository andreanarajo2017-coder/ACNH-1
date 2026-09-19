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
